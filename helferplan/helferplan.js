// --- 1. Abhaengigkeiten importieren ---
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

// --- 2. Express-App initialisieren ---
const app = express();
const port = Number(process.env.PORT) || 3003;

// --- 3. DB-Pool einrichten ---
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '192.168.0.187',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Dome1234.!',
    database: process.env.MYSQL_DATABASE || 'volleyball_turnier',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 5,
    queueLimit: 0
});

// --- 3b. Sicherstellen, dass Settings-Tabelle existiert ---
(async function ensureSettingsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS helferplan_settings (
                                                               setting_key VARCHAR(50) PRIMARY KEY,
                setting_value VARCHAR(255) NOT NULL
                ) ENGINE=InnoDB;
        `);
        console.log('helferplan_settings table OK');
    } catch (err) {
        console.error('Fehler beim Erstellen der helferplan_settings Tabelle', err);
    }
})();

// Optional: versuche einen Unique-Index auf helferplan_helpers.name zu erstellen (falls gewünscht/erlaubt).
// Das ist optional, aber empfehlenswert als zusätzliche Datenbankgarantie.
// Der Aufruf ist fehlerrobust (try/catch) und bricht nicht, falls die Tabelle/Spalte noch nicht existiert
// oder falls der Index bereits existiert bzw. fehlende Rechte vorliegen.
(async function ensureHelperNameUniqueIndex() {
    try {
        // Hinweis: falls deine MySQL-Variante anders ist oder die Tabelle noch nicht existiert,
        // kann dieser Befehl fehlschlagen. Dann nur die serverseitige Prüfung verwenden.
        await pool.query("ALTER TABLE helferplan_helpers ADD UNIQUE INDEX uniq_helper_name (name(191));");
        console.log('Unique index on helferplan_helpers.name created/ensured');
    } catch (err) {
        // Fehlercode 1061 = index already exists, andere Fehler können z.B. fehlende Tabelle sein
        if (err && err.errno === 1061) {
            console.log('Unique index already exists');
        } else {
            console.log('Could not ensure unique index for helferplan_helpers.name (this may be okay):', err && err.message ? err.message : err);
        }
    }
})();

// --- 4. Middleware einrichten ---
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    // Vorsicht: 'unsafe-eval' reduziert die CSP-Sicherheit. Nutze das nur falls nötig (z.B. Dev).
    const csp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';";
    res.setHeader('Content-Security-Policy', csp);
    next();
});
app.use(express.static('public'));

// Hilfsfunktion: sichere Query-Ausführung mit Logging
async function safeQuery(sql, params = []) {
    try {
        const [rows] = await pool.query(sql, params);
        return rows;
    } catch (err) {
        throw err;
    }
}

// Helper: konvertiert ISO-String (z.B. '2024-07-19T16:00:00.000Z') nach MySQL DATETIME 'YYYY-MM-DD HH:MM:SS'
function isoToMySQLDatetime(iso) {
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (isNaN(d)) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// Helper: konvertiert MySQL DATETIME (string "YYYY-MM-DD HH:MM:SS" oder Date-Objekt) => ISO string with Z (UTC)
function mySQLDatetimeToISOString(mysqlDt) {
    if (!mysqlDt) return null;
    if (mysqlDt instanceof Date) return mysqlDt.toISOString();
    if (typeof mysqlDt === 'string') {
        const isoCandidate = mysqlDt.replace(' ', 'T') + 'Z';
        const parsed = new Date(isoCandidate);
        if (!isNaN(parsed)) return parsed.toISOString();
        const parsed2 = new Date(mysqlDt);
        if (!isNaN(parsed2)) return parsed2.toISOString();
    }
    const parsed = new Date(mysqlDt);
    if (!isNaN(parsed)) return parsed.toISOString();
    return null;
}

// --- 5. API-Endpunkte ---

// Teams abrufen
app.get('/api/teams', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT id, name, color_hex FROM helferplan_teams ORDER BY name;");
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/teams', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Teams' });
    }
});

// Team erstellen
app.post('/api/teams', async (req, res) => {
    try {
        const { name, color_hex } = req.body;
        if (!name || !color_hex) return res.status(400).json({ error: 'Name und Farbwert sind erforderlich.' });
        const result = await pool.query("INSERT INTO helferplan_teams (name, color_hex) VALUES (?, ?);", [name, color_hex]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name, color_hex });
    } catch (err) {
        console.error('DB-Fehler POST /api/teams', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen des Teams' });
    }
});

// Team löschen
app.delete('/api/teams/:id', async (req, res) => {
    // Änderung: lösche zuerst alle Helfer die zu diesem Team gehören, danach das Team selbst.
    // Ausführung innerhalb einer DB-Transaktion, damit beide Operationen atomar sind.
    const id = req.params.id;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // Alle Helfer des Teams löschen
        await conn.query("DELETE FROM helferplan_helpers WHERE team_id = ?;", [id]);
        // Danach das Team löschen
        await conn.query("DELETE FROM helferplan_teams WHERE id = ?;", [id]);
        await conn.commit();
        res.status(200).json({ message: 'Team und zugehörige Helfer gelöscht' });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error('DB-Fehler DELETE /api/teams', err);
        res.status(500).json({ error: 'DB-Fehler beim Löschen des Teams' });
    } finally {
        conn.release();
    }
});

// Helfer abrufen
app.get('/api/helpers', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT h.id, h.name, h.role, h.team_id, t.name AS team_name
            FROM helferplan_helpers h
                     LEFT JOIN helferplan_teams t ON h.team_id = t.id
            ORDER BY h.name;
        `);
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/helpers', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Helfer' });
    }
});

// Helfer erstellen
app.post('/api/helpers', async (req, res) => {
    try {
        const { name, team_id, role } = req.body;
        if (!name || !team_id || !role) return res.status(400).json({ error: 'Name, Team-ID und Rolle sind erforderlich.' });
        const validRoles = ['Minderjaehrig', 'Erwachsen', 'Orga'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Ungueltige Rolle.' });

        // Serverseitige Prüfung: Name darf nur einmal vorkommen (case-insensitive).
        // Trim und prüfe mit LOWER(...) für case-insensitive Abgleich.
        const trimmed = String(name).trim();
        const [existing] = await pool.query("SELECT COUNT(*) as cnt FROM helferplan_helpers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?));", [trimmed]);
        const cnt = existing && existing[0] && (existing[0].cnt || existing[0].CNT || existing[0].Cnt) ? Number(existing[0].cnt || existing[0].CNT || existing[0].Cnt) : 0;
        if (cnt > 0) {
            return res.status(409).json({ error: 'Name schon belegt.' });
        }

        const result = await pool.query("INSERT INTO helferplan_helpers (name, team_id, role) VALUES (?, ?, ?);", [trimmed, team_id, role]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name: trimmed, team_id, role });
    } catch (err) {
        if (err && err.errno === 1452) {
            return res.status(400).json({ error: `Team mit der ID ${req.body.team_id} existiert nicht.` });
        }
        // Wenn ein Unique-Index vorhanden ist und ein Duplicate-Insert doch durchrutscht, fange das ab:
        if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
            return res.status(409).json({ error: 'Name schon belegt.' });
        }
        console.error('DB-Fehler POST /api/helpers', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen des Helfers' });
    }
});

// Helfer löschen
app.delete('/api/helpers/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_helpers WHERE id = ?;", [id]);
        res.status(200).json({ message: 'Helfer gelöscht' });
    } catch (err) {
        console.error('DB-Fehler DELETE /api/helpers', err);
        res.status(500).json({ error: 'DB-Fehler beim Löschen des Helfers' });
    }
});

// Taetigkeits-Gruppen abrufen (inkl. sort_order)
app.get('/api/activity-groups', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT id, name, sort_order FROM helferplan_activity_groups ORDER BY sort_order ASC, name;");
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/activity-groups', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Gruppen' });
    }
});

// Eine neue Taetigkeits-Gruppe erstellen (mit sort_order)
app.post('/api/activity-groups', async (req, res) => {
    try {
        const { name, sort_order } = req.body;
        if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });
        const result = await pool.query("INSERT INTO helferplan_activity_groups (name, sort_order) VALUES (?, ?);", [name, sort_order || 0]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name, sort_order: Number(sort_order) || 0 });
    } catch (err) {
        console.error('DB-Fehler POST /api/activity-groups', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen der Gruppe' });
    }
});

// Gruppe löschen
app.delete('/api/activity-groups/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_activity_groups WHERE id = ?;", [id]);
        res.status(200).json({ message: 'Gruppe gelöscht' });
    } catch (err) {
        console.error('DB-Fehler DELETE /api/activity-groups', err);
        res.status(500).json({ error: 'DB-Fehler beim Löschen der Gruppe' });
    }
});

// Alle Taetigkeiten abrufen
app.get('/api/activities', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT a.id, a.name, a.role_requirement, a.group_id, g.name AS group_name
            FROM helferplan_activities a
                     LEFT JOIN helferplan_activity_groups g ON a.group_id = g.id
            ORDER BY g.sort_order, g.name, a.sort_order, a.name;
        `);
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/activities', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Taetigkeiten' });
    }
});

// Eine neue Taetigkeit erstellen
app.post('/api/activities', async (req, res) => {
    try {
        const { name, group_id, role_requirement } = req.body;
        if (!name || !group_id || !role_requirement) return res.status(400).json({ error: 'Name, Gruppen-ID und Rollen-Anforderung sind erforderlich.' });
        const result = await pool.query("INSERT INTO helferplan_activities (name, group_id, role_requirement) VALUES (?, ?, ?);", [name, group_id, role_requirement]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name, group_id, role_requirement });
    } catch (err) {
        if (err && err.errno === 1452) return res.status(400).json({ error: `Gruppe mit der ID ${req.body.group_id} existiert nicht.` });
        console.error('DB-Fehler POST /api/activities', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen der Taetigkeit' });
    }
});

// Taetigkeit löschen
app.delete('/api/activities/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_activities WHERE id = ?;", [id]);
        res.status(200).json({ message: 'Taetigkeit gelöscht' });
    } catch (err) {
        console.error('DB-Fehler DELETE /api/activities', err);
        res.status(500).json({ error: 'DB-Fehler beim Löschen der Taetigkeit' });
    }
});

// Alle zugewiesenen Turnierschichten abrufen
app.get('/api/tournament-shifts', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT ts.activity_id, ts.start_time, ts.end_time, ts.helper_id, h.name as helper_name, t.color_hex as team_color
            FROM helferplan_tournament_shifts ts
                     JOIN helferplan_helpers h ON ts.helper_id = h.id
                     JOIN helferplan_teams t ON h.team_id = t.id;
        `);
        const converted = rows.map(r => ({
            ...r,
            start_time: mySQLDatetimeToISOString(r.start_time),
            end_time: mySQLDatetimeToISOString(r.end_time)
        }));
        res.json(converted);
    } catch (err) {
        console.error('DB-Fehler /api/tournament-shifts', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Schichten' });
    }
});

// Eine Schicht erstellen oder aktualisieren
app.post('/api/tournament-shifts', async (req, res) => {
    try {
        const { activity_id, start_time, end_time, helper_id } = req.body;
        if (!activity_id || !start_time || !end_time || !helper_id) return res.status(400).json({ error: 'Alle Felder sind erforderlich.' });

        const startMy = isoToMySQLDatetime(start_time);
        const endMy = isoToMySQLDatetime(end_time);
        if (!startMy || !endMy) return res.status(400).json({ error: 'Ungueltiges Datumsformat.' });

        const result = await pool.query(
            "INSERT INTO helferplan_tournament_shifts (activity_id, start_time, end_time, helper_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE helper_id = VALUES(helper_id);",
            [activity_id, startMy, endMy, helper_id]
        );
        const execResult = result[0];
        res.status(201).json({ message: 'Schicht gespeichert', affectedRows: execResult.affectedRows });
    } catch (err) {
        console.error('DB-Fehler POST /api/tournament-shifts', err);
        res.status(500).json({ error: 'DB-Fehler beim Speichern der Schicht' });
    }
});

// Eine Schicht loeschen
app.delete('/api/tournament-shifts', async (req, res) => {
    try {
        const { activity_id, start_time } = req.body;
        if (!activity_id || !start_time) return res.status(400).json({ error: 'Activity ID und Startzeit sind erforderlich.' });

        const startMy = isoToMySQLDatetime(start_time);
        if (!startMy) return res.status(400).json({ error: 'Ungueltiges Datumsformat.' });

        await pool.query("DELETE FROM helferplan_tournament_shifts WHERE activity_id = ? AND start_time = ?;", [activity_id, startMy]);
        res.status(200).json({ message: 'Schicht geloescht' });
    } catch (err) {
        console.error('DB-Fehler DELETE /api/tournament-shifts', err);
        res.status(500).json({ error: 'DB-Fehler beim Loeschen der Schicht' });
    }
});

// --- Settings: GET/POST ---
// GET: liefert alle Einstellungen als object { key: value }
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT setting_key, setting_value FROM helferplan_settings;");
        const obj = {};
        rows.forEach(r => { obj[r.setting_key] = r.setting_value; });
        res.json(obj);
    } catch (err) {
        console.error('DB-Fehler /api/settings', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Einstellungen' });
    }
});

// POST: body { key: value } or { settings: { key: value, ... } }
app.post('/api/settings', async (req, res) => {
    try {
        const payload = req.body;
        let entries = [];
        if (payload.settings && typeof payload.settings === 'object') {
            entries = Object.entries(payload.settings);
        } else {
            entries = Object.entries(payload);
        }
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const [key, value] of entries) {
                await conn.query(
                    "INSERT INTO helferplan_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);",
                    [key, String(value)]
                );
            }
            await conn.commit();
            res.status(200).json({ message: 'Einstellungen gespeichert' });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('DB-Fehler POST /api/settings', err);
        res.status(500).json({ error: 'DB-Fehler beim Speichern der Einstellungen' });
    }
});

// --- 6. Server starten ---
app.listen(port, () => {
    console.log(`Helferplan-Backend laeuft auf http://localhost:${port}`);
});