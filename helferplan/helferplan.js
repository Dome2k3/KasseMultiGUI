// helferplan server (Express) - merged & updated
// Based on user's provided starting point - added robust shift ID handling,
// POST conflict detection (409 + existing_shift), DELETE by id, and tolerant DELETE fallback.

// --- 1. Abhaengigkeiten importieren ---
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');


// --- 2. Express-App initialisieren ---
const app = express();
const port = Number(process.env.PORT) || 3003;

// DB-Pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'volleyball_turnier',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 5,
    timezone: 'Z'
});

// --- 3b. Sicherstellen, dass Settings-Tabelle existiert ---
(async function ensureSettingsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS helferplan_settings
            (
                setting_key VARCHAR(50) PRIMARY KEY,
                setting_value VARCHAR(255) NOT NULL
            ) ENGINE=InnoDB;
        `);
        console.log('helferplan_settings table OK');
    } catch (err) {
        console.error('Fehler beim Erstellen der helferplan_settings Tabelle', err);
    }
})();

// Optional: try to create unique index on helper name (best-effort)
(async function ensureHelperNameUniqueIndex() {
    try {
        await pool.query("ALTER TABLE helferplan_helpers ADD UNIQUE INDEX uniq_helper_name (name(191));");
        console.log('Unique index on helferplan_helpers.name created/ensured');
    } catch (err) {
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
        console.error('safeQuery error:', err, sql, params);
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
        // Try converting "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SSZ"
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

// Helper to map DB row to API shift object (with id)
function mapShiftRow(row) {
    return {
        id: row.id,
        activity_id: row.activity_id,
        start_time: mySQLDatetimeToISOString(row.start_time),
        end_time: mySQLDatetimeToISOString(row.end_time),
        helper_id: row.helper_id,
        helper_name: row.helper_name,
        team_color: row.team_color
    };
}

// --- 5. API-Endpunkte ---

// Teams abrufen
app.get('/api/teams', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT id, name, color_hex FROM helferplan_teams ORDER BY name;");
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/teams', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Teams'});
    }
});

// Team erstellen
app.post('/api/teams', async (req, res) => {
    try {
        const {name, color_hex} = req.body;
        if (!name || !color_hex) return res.status(400).json({error: 'Name und Farbwert sind erforderlich.'});
        const [result] = await pool.query("INSERT INTO helferplan_teams (name, color_hex) VALUES (?, ?);", [name, color_hex]);
        res.status(201).json({id: Number(result.insertId), name, color_hex});
    } catch (err) {
        console.error('DB-Fehler POST /api/teams', err);
        res.status(500).json({error: 'DB-Fehler beim Erstellen des Teams'});
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
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Helfer'});
    }
});

// Helfer erstellen
app.post('/api/helpers', async (req, res) => {
    try {
        const {name, team_id, role} = req.body;
        if (!name || !team_id || !role) return res.status(400).json({error: 'Name, Team-ID und Rolle sind erforderlich.'});
        const validRoles = ['Minderjaehrig', 'Erwachsen', 'Orga'];
        if (!validRoles.includes(role)) return res.status(400).json({error: 'Ungueltige Rolle.'});

        const trimmed = String(name).trim();
        const [existing] = await pool.query("SELECT COUNT(*) as cnt FROM helferplan_helpers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?));", [trimmed]);
        const cnt = existing && existing[0] && (existing[0].cnt || existing[0].CNT || existing[0].Cnt) ? Number(existing[0].cnt || existing[0].CNT || existing[0].Cnt) : 0;
        if (cnt > 0) {
            return res.status(409).json({error: 'Name schon belegt.'});
        }

        const [result] = await pool.query("INSERT INTO helferplan_helpers (name, team_id, role) VALUES (?, ?, ?);", [trimmed, team_id, role]);
        res.status(201).json({id: Number(result.insertId), name: trimmed, team_id, role});
    } catch (err) {
        if (err && err.errno === 1452) {
            return res.status(400).json({error: `Team mit der ID ${req.body.team_id} existiert nicht.`});
        }
        if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
            return res.status(409).json({error: 'Name schon belegt.'});
        }
        console.error('DB-Fehler POST /api/helpers', err);
        res.status(500).json({error: 'DB-Fehler beim Erstellen des Helfers'});
    }
});

// Helfer löschen
app.delete('/api/helpers/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_helpers WHERE id = ?;", [id]);
        res.status(200).json({message: 'Helfer gelöscht'});
    } catch (err) {
        console.error('DB-Fehler DELETE /api/helpers', err);
        res.status(500).json({error: 'DB-Fehler beim Löschen des Helfers'});
    }
});

// Activity groups
app.get('/api/activity-groups', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT id, name, sort_order FROM helferplan_activity_groups ORDER BY sort_order ASC, name;");
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/activity-groups', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Gruppen'});
    }
});

app.post('/api/activity-groups', async (req, res) => {
    try {
        const {name, sort_order} = req.body;
        if (!name) return res.status(400).json({error: 'Name ist erforderlich.'});
        const [result] = await pool.query("INSERT INTO helferplan_activity_groups (name, sort_order) VALUES (?, ?);", [name, sort_order || 0]);
        res.status(201).json({id: Number(result.insertId), name, sort_order: Number(sort_order) || 0});
    } catch (err) {
        console.error('DB-Fehler POST /api/activity-groups', err);
        res.status(500).json({error: 'DB-Fehler beim Erstellen der Gruppe'});
    }
});

app.delete('/api/activity-groups/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_activity_groups WHERE id = ?;", [id]);
        res.status(200).json({message: 'Gruppe gelöscht'});
    } catch (err) {
        console.error('DB-Fehler DELETE /api/activity-groups', err);
        res.status(500).json({error: 'DB-Fehler beim Löschen der Gruppe'});
    }
});

// Activities
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
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Taetigkeiten'});
    }
});

app.post('/api/activities', async (req, res) => {
    try {
        const {name, group_id, role_requirement} = req.body;
        if (!name || !group_id || !role_requirement) return res.status(400).json({error: 'Name, Gruppen-ID und Rollen-Anforderung sind erforderlich.'});
        const [result] = await pool.query("INSERT INTO helferplan_activities (name, group_id, role_requirement) VALUES (?, ?, ?);", [name, group_id, role_requirement]);
        res.status(201).json({id: Number(result.insertId), name, group_id, role_requirement});
    } catch (err) {
        if (err && err.errno === 1452) return res.status(400).json({error: `Gruppe mit der ID ${req.body.group_id} existiert nicht.`});
        console.error('DB-Fehler POST /api/activities', err);
        res.status(500).json({error: 'DB-Fehler beim Erstellen der Taetigkeit'});
    }
});

app.delete('/api/activities/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_activities WHERE id = ?;", [id]);
        res.status(200).json({message: 'Taetigkeit gelöscht'});
    } catch (err) {
        console.error('DB-Fehler DELETE /api/activities', err);
        res.status(500).json({error: 'DB-Fehler beim Löschen der Taetigkeit'});
    }
});

// --- Shift endpoints ---
// Return all tournament shifts (including shift id)
app.get('/api/tournament-shifts', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT ts.id, ts.activity_id,
                   ts.start_time,
                   ts.end_time,
                   ts.helper_id,
                   h.name      as helper_name,
                   t.color_hex as team_color
            FROM helferplan_tournament_shifts ts
                     JOIN helferplan_helpers h ON ts.helper_id = h.id
                     LEFT JOIN helferplan_teams t ON h.team_id = t.id
            ORDER BY ts.start_time ASC;
        `);
        const converted = rows.map(mapShiftRow);
        res.json(converted);
    } catch (err) {
        console.error('DB-Fehler /api/tournament-shifts', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Schichten'});
    }
});

/**
 * POST /api/tournament-shifts
 * - If conflict (overlap) found: return 409 + existing_shift (do not overwrite)
 * - Else insert shift and return created shift (including id)
 */
app.post('/api/tournament-shifts', async (req, res) => {
    try {
        const {activity_id, start_time, end_time, helper_id} = req.body;
        if (!activity_id || !start_time || !end_time || !helper_id) return res.status(400).json({error: 'Alle Felder sind erforderlich.'});

        const startMy = isoToMySQLDatetime(start_time);
        const endMy = isoToMySQLDatetime(end_time);
        if (!startMy || !endMy) return res.status(400).json({error: 'Ungueltiges Datumsformat.'});

        // Conflict check: existing.start < new.end AND existing.end > new.start (overlap)
        const [confRows] = await pool.query(
            `SELECT id, activity_id, start_time, end_time, helper_id, helper_name, team_color
             FROM helferplan_tournament_shifts
             WHERE activity_id = ?
               AND (start_time < ? AND end_time > ?)
             LIMIT 1`,
            [activity_id, endMy, startMy]
        );

        if (confRows && confRows.length > 0) {
            // return 409 with existing shift so client can ask user whether to overwrite
            const existing = mapShiftRow(confRows[0]);
            return res.status(409).json({ conflict: true, existing_shift: existing });
        }

        // Insert new shift. Try to populate helper_name and team_color if available from helpers/teams
        // We'll attempt to get helper_name and team_color first
        let helperName = null;
        let teamColor = null;
        try {
            const [hrows] = await pool.query("SELECT name, team_id FROM helferplan_helpers WHERE id = ? LIMIT 1", [helper_id]);
            if (hrows && hrows.length) {
                helperName = hrows[0].name;
                const teamId = hrows[0].team_id;
                if (teamId) {
                    const [trows] = await pool.query("SELECT color_hex FROM helferplan_teams WHERE id = ? LIMIT 1", [teamId]);
                    if (trows && trows.length) teamColor = trows[0].color_hex;
                }
            }
        } catch (err) {
            // non-fatal: continue without helperName/teamColor
            console.warn('Could not resolve helper/team meta:', err && err.message ? err.message : err);
        }

        const [insertRes] = await pool.query(
            `INSERT INTO helferplan_tournament_shifts (activity_id, start_time, end_time, helper_id, helper_name, team_color)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [activity_id, startMy, endMy, helper_id, helperName, teamColor]
        );

        const [rows] = await pool.query(
            `SELECT id, activity_id, start_time, end_time, helper_id, helper_name, team_color
             FROM helferplan_tournament_shifts WHERE id = ? LIMIT 1`,
            [insertRes.insertId]
        );

        if (!rows || rows.length === 0) {
            return res.status(500).json({ error: 'Schicht angelegt, aber konnte nicht geladen werden' });
        }

        const created = mapShiftRow(rows[0]);
        return res.status(201).json(created);

    } catch (err) {
        console.error('DB-Fehler POST /api/tournament-shifts', err);
        res.status(500).json({error: 'DB-Fehler beim Speichern der Schicht'});
    }
});

/**
 * DELETE by shift id (most reliable)
 */
app.delete('/api/tournament-shifts/:id', async (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'shift id required' });
    try {
        const [result] = await pool.query("DELETE FROM helferplan_tournament_shifts WHERE id = ?", [id]);
        return res.json({ deletedCount: result.affectedRows || 0 });
    } catch (err) {
        console.error('DELETE /api/tournament-shifts/:id error', err);
        return res.status(500).json({ error: 'Fehler beim Löschen der Schicht', detail: err.message });
    }
});

/**
 * Body-based DELETE (legacy fallback). Tries multiple match strategies (exact, tolerant)
 */
app.delete('/api/tournament-shifts', async (req, res) => {
    // Expect JSON body: { activity_id, start_time, helper_id? }
    const { activity_id, start_time, helper_id } = req.body || {};

    if (!activity_id || !start_time) {
        return res.status(400).json({ error: 'activity_id und start_time erforderlich' });
    }

    // Helper to run a parameterized delete query and return affectedRows
    async function runDelete(sql, params) {
        try {
            const [result] = await pool.query(sql, params);
            return result && result.affectedRows ? result.affectedRows : 0;
        } catch (err) {
            console.error('DB delete error', err, sql, params);
            throw err;
        }
    }

    const variants = [];
    variants.push(start_time);
    const isoNoMs = start_time.replace(/\.\d{3}Z$/, 'Z');
    if (isoNoMs !== start_time) variants.push(isoNoMs);
    try {
        const d = new Date(start_time);
        if (!isNaN(d)) {
            const sqlDt = d.getUTCFullYear() + '-' +
                String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
                String(d.getUTCDate()).padStart(2,'0') + ' ' +
                String(d.getUTCHours()).padStart(2,'0') + ':' +
                String(d.getUTCMinutes()).padStart(2,'0') + ':' +
                String(d.getUTCSeconds()).padStart(2,'0');
            if (!variants.includes(sqlDt)) variants.push(sqlDt);
        }
    } catch (e) {}

    const attempts = [];

    try {
        if (helper_id) {
            for (const st of variants) {
                const sql = 'DELETE FROM helferplan_tournament_shifts WHERE activity_id = ? AND start_time = ? AND helper_id = ?';
                attempts.push({ sql, params: [activity_id, st, helper_id] });
                const affected = await runDelete(sql, [activity_id, st, helper_id]);
                if (affected > 0) {
                    return res.json({ message: 'Schicht geloescht', deletedCount: affected, attempts });
                }
            }

            const sql = `DELETE ts FROM helferplan_tournament_shifts ts
                   WHERE ts.activity_id = ?
                     AND ts.helper_id = ?
                     AND ABS(TIMESTAMPDIFF(SECOND, ts.start_time, ?)) <= 3600`;
            attempts.push({ sql, params: [activity_id, helper_id, start_time] });
            const affected2 = await runDelete(sql, [activity_id, helper_id, start_time]);
            if (affected2 > 0) {
                return res.json({ message: 'Schicht geloescht (fuzzy match helper)', deletedCount: affected2, attempts });
            }
        }

        for (const st of variants) {
            const sql = 'DELETE FROM helferplan_tournament_shifts WHERE activity_id = ? AND start_time = ?';
            attempts.push({ sql, params: [activity_id, st] });
            const affected = await runDelete(sql, [activity_id, st]);
            if (affected > 0) {
                return res.json({ message: 'Schicht geloescht', deletedCount: affected, attempts });
            }
        }

        {
            const sql = `DELETE ts FROM helferplan_tournament_shifts ts
                   WHERE ts.activity_id = ?
                     AND ABS(TIMESTAMPDIFF(SECOND, ts.start_time, ?)) <= 3600`;
            attempts.push({ sql, params: [activity_id, start_time] });
            const affected = await runDelete(sql, [activity_id, start_time]);
            if (affected > 0) {
                return res.json({ message: 'Schicht geloescht (fuzzy match)', deletedCount: affected, attempts });
            }
        }

        return res.status(404).json({ message: 'Keine passende Schicht gefunden', deletedCount: 0, attempts });
    } catch (err) {
        console.error('DELETE /api/tournament-shifts error:', err);
        return res.status(500).json({ error: 'Serverfehler beim Loeschen', detail: err && err.message, attempts });
    }
});

// --- Settings endpoints ---
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT setting_key, setting_value FROM helferplan_settings;");
        const obj = {};
        rows.forEach(r => {
            obj[r.setting_key] = r.setting_value;
        });
        res.json(obj);
    } catch (err) {
        console.error('DB-Fehler /api/settings', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Einstellungen'});
    }
});

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
            res.status(200).json({message: 'Einstellungen gespeichert'});
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('DB-Fehler POST /api/settings', err);
        res.status(500).json({error: 'DB-Fehler beim Speichern der Einstellungen'});
    }
});

// --- 6. Server starten ---
app.listen(port, () => {
    console.log(`Helferplan-Backend laeuft auf http://localhost:${port}`);
});