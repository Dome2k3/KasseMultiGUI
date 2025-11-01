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
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Dome1234.!',
    database: process.env.MYSQL_DATABASE ||'volleyball_turnier',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 5,
    timezone: 'Z'
});

// Admin-Passwort (Standard: 1881)
const ADMIN_PASSWORD = '1881';

// --- 3b. Sicherstellen, dass Settings-Tabelle existiert ---
(async function ensureSettingsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS volleyball_turnier.helferplan_settings
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
        await pool.query("ALTER TABLE volleyball_turnier.helferplan_helpers ADD UNIQUE INDEX uniq_helper_name (name(191));");
        console.log('Unique index on helferplan_helpers.name created/ensured');
    } catch (err) {
        if (err && err.errno === 1061) {
            console.log('Unique index already exists');
        } else {
            console.log('Could not ensure unique index for helferplan_helpers.name (this may be okay):', err && err.message ? err.message : err);
        }
    }
})();

// Ensure allowed_time_blocks column exists in helferplan_activities table
(async function ensureAllowedTimeBlocksColumn() {
    try {
        await pool.query(`
            ALTER TABLE volleyball_turnier.helferplan_activities 
            ADD COLUMN allowed_time_blocks JSON DEFAULT NULL;
        `);
        console.log('allowed_time_blocks column added to helferplan_activities');
    } catch (err) {
        if (err && err.errno === 1060) {
            console.log('allowed_time_blocks column already exists');
        } else {
            console.log('Could not add allowed_time_blocks column (this may be okay):', err && err.message ? err.message : err);
        }
    }
})();

// Ensure setup_cleanup_shifts table exists
(async function ensureSetupCleanupShiftsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS volleyball_turnier.helferplan_setup_cleanup_shifts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                day_type ENUM('Aufbau', 'Abbau') NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                helper_id INT,
                FOREIGN KEY (helper_id) REFERENCES helferplan_helpers(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
        `);
        console.log('helferplan_setup_cleanup_shifts table OK');
    } catch (err) {
        console.error('Could not create helferplan_setup_cleanup_shifts table:', err && err.message ? err.message : err);
    }
})();

// Ensure cakes table exists
(async function ensureCakesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS volleyball_turnier.helferplan_cakes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                donation_day ENUM('Freitag', 'Samstag', 'Sonntag') NOT NULL,
                helper_id INT,
                cake_type VARCHAR(100),
                contains_nuts TINYINT(1) NOT NULL DEFAULT 0,
                INDEX (helper_id),
                FOREIGN KEY (helper_id) REFERENCES helferplan_helpers(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
        `);
        console.log('helferplan_cakes table OK');
    } catch (err) {
        console.error('Could not create helferplan_cakes table:', err && err.message ? err.message : err);
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
        // If ON DELETE RESTRICT is in place and there are shifts referencing this helper, MySQL returns errno 1451
        if (err && err.errno === 1451) {
            return res.status(400).json({ error: 'Helfer kann nicht gelöscht werden: Er ist noch in Schichten eingetragen.' });
        }
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
            SELECT a.id, a.name, a.role_requirement, a.group_id, a.allowed_time_blocks, g.name AS group_name
            FROM helferplan_activities a
                     LEFT JOIN helferplan_activity_groups g ON a.group_id = g.id
            ORDER BY g.sort_order, g.name, a.sort_order, a.name;
        `);

        // Parse `allowed_time_blocks` from JSON string to JavaScript object
        const activities = rows.map(row => ({
            ...row,
            allowed_time_blocks: row.allowed_time_blocks ? JSON.parse(row.allowed_time_blocks) : null
        }));

        res.json(activities);
    } catch (err) {
        console.error('DB-Fehler /api/activities', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Taetigkeiten' });
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

/// Schicht hinzufügen: Validierung der Rolle und Berücksichtigung von Schichtblöcken
app.post('/api/tournament-shifts', async (req, res) => {
    try {
        const { activity_id, start_time, end_time, helper_id } = req.body;
        const startMy = isoToMySQLDatetime(start_time);
        const endMy = isoToMySQLDatetime(end_time);

        // 1. Rolle validieren
        const [activity] = await pool.query("SELECT role_requirement, allowed_time_blocks FROM helferplan_activities WHERE id = ?", [activity_id]);
        if (activity.length === 0) return res.status(404).json({ error: 'Aktivität nicht gefunden.' });

        const roleRequirement = activity[0].role_requirement;
        const allowedTimeBlocks = activity[0].allowed_time_blocks ? JSON.parse(activity[0].allowed_time_blocks) : null;

        // Prüfen, ob die Rolle passt
        const [helper] = await pool.query("SELECT role FROM helferplan_helpers WHERE id = ?", [helper_id]);
        if (helper.length === 0) return res.status(404).json({ error: 'Helfer nicht gefunden.' });
        
        // Orga helpers can fill any role, minors can only fill 'Alle' roles
        const helperRole = helper[0].role;
        if (roleRequirement === 'Erwachsen') {
            // For 'Erwachsen' requirement, allow both 'Erwachsen' and 'Orga' helpers
            if (helperRole !== 'Erwachsen' && helperRole !== 'Orga') {
                return res.status(400).json({ error: 'Die Rolle des Helfers entspricht nicht den Anforderungen der Schicht.' });
            }
        } else if (roleRequirement !== 'Alle' && helperRole !== roleRequirement) {
            return res.status(400).json({ error: 'Die Rolle des Helfers entspricht nicht den Anforderungen der Schicht.' });
        }

        // 2. Zeitblock validieren
        // allowed_time_blocks contain hour indices (e.g., {start: 2, end: 6})
        // We need to convert these to actual datetimes based on event_friday setting
        if (allowedTimeBlocks && Array.isArray(allowedTimeBlocks) && allowedTimeBlocks.length > 0) {
            // Get event start date from settings
            const [settingsRows] = await pool.query("SELECT setting_value FROM helferplan_settings WHERE setting_key = 'event_friday'");
            const eventFriday = settingsRows && settingsRows.length > 0 ? settingsRows[0].setting_value : '2024-07-19';
            
            // Event starts at 12:00 on Friday
            const eventStartDate = new Date(`${eventFriday}T12:00:00Z`);
            const shiftStart = new Date(start_time);
            
            // Calculate hour index of the shift start time
            const hoursDiff = (shiftStart - eventStartDate) / (1000 * 60 * 60);
            const shiftHourIndex = Math.round(hoursDiff);
            
            // Check if shift hour index is within any allowed block
            const isAllowed = allowedTimeBlocks.some(block => {
                return shiftHourIndex >= block.start && shiftHourIndex < block.end;
            });
            
            if (!isAllowed) {
                console.log(`Time block validation failed: shiftHourIndex=${shiftHourIndex}, allowedBlocks=`, allowedTimeBlocks);
                return res.status(400).json({ error: 'Die ausgewählte Zeit liegt außerhalb der zulässigen Schichtblöcke.' });
            }
        }

        // Schicht anlegen (wenn keine Konflikte bestehen)
        const [result] = await pool.query(
            "INSERT INTO helferplan_tournament_shifts (activity_id, start_time, end_time, helper_id) VALUES (?, ?, ?, ?)",
            [activity_id, startMy, endMy, helper_id]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Fehler beim Hinzufügen der Schicht:', err);
        res.status(500).json({ error: 'Serverfehler beim Hinzufügen der Schicht.' });
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


// --- Zusätzliche API-Endpunkte für allowed_time_blocks ---


// 1. GET: Erlaubte Zeitblöcke für eine Aktivität abrufen
app.get('/api/activities/:id/allowed-time-blocks', async (req, res) => {
    const activityId = req.params.id;
    try {
        const [result] = await pool.query(
            "SELECT allowed_time_blocks FROM helferplan_activities WHERE id = ?",
            [activityId]
        );
        if (result.length === 0) {
            return res.status(404).json({ error: 'Aktivität nicht gefunden.' });
        }
        const allowedTimeBlocks = result[0].allowed_time_blocks
            ? JSON.parse(result[0].allowed_time_blocks)
            : [];
        res.json(allowedTimeBlocks);
    } catch (err) {
        console.error('GET /api/activities/:id/allowed-time-blocks Fehler:', err);
        res.status(500).json({ error: 'Serverfehler beim Abrufen der Zeitblöcke.' });
    }
});

// 2. POST: Erlaubte Zeitblöcke für eine Aktivität aktualisieren
app.post('/api/activities/:id/allowed-time-blocks', async (req, res) => {
    const activityId = req.params.id;
    const { blocks, password } = req.body;

    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Ungültiges Admin-Passwort.' });
    }

    if (!Array.isArray(blocks)) {
        return res.status(400).json({ error: 'blocks muss ein Array sein.' });
    }

    try {
        const blocksJson = JSON.stringify(blocks);
        await pool.query(
            "UPDATE helferplan_activities SET allowed_time_blocks = ? WHERE id = ?",
            [blocksJson, activityId]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('POST /api/activities/:id/allowed-time-blocks Fehler:', err);
        res.status(500).json({ error: 'Serverfehler beim Aktualisieren der Zeitblöcke.' });
    }
});


// --- Setup/Teardown Shifts Endpoints ---

// GET: Abrufen aller Setup/Teardown Schichten
app.get('/api/setup-cleanup-shifts', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT 
                sc.id, 
                sc.day_type, 
                sc.start_time, 
                sc.end_time, 
                sc.helper_id,
                h.name as helper_name,
                t.color_hex as team_color
            FROM helferplan_setup_cleanup_shifts sc
            LEFT JOIN helferplan_helpers h ON sc.helper_id = h.id
            LEFT JOIN helferplan_teams t ON h.team_id = t.id
            ORDER BY sc.start_time, sc.id;
        `);
        const mapped = rows.map(r => ({
            id: r.id,
            day_type: r.day_type,
            start_time: mySQLDatetimeToISOString(r.start_time),
            end_time: mySQLDatetimeToISOString(r.end_time),
            helper_id: r.helper_id,
            helper_name: r.helper_name,
            team_color: r.team_color
        }));
        res.json(mapped);
    } catch (err) {
        console.error('DB-Fehler /api/setup-cleanup-shifts', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Setup/Cleanup Schichten'});
    }
});

// POST: Schicht zuweisen oder erstellen
app.post('/api/setup-cleanup-shifts', async (req, res) => {
    try {
        const {day_type, start_time, end_time, helper_id} = req.body;
        if (!day_type || !start_time || !end_time) {
            return res.status(400).json({error: 'day_type, start_time und end_time sind erforderlich.'});
        }
        
        const startMySQL = isoToMySQLDatetime(start_time);
        const endMySQL = isoToMySQLDatetime(end_time);
        
        // Check if slot exists
        const [existing] = await pool.query(
            "SELECT id FROM helferplan_setup_cleanup_shifts WHERE day_type = ? AND start_time = ? LIMIT 1",
            [day_type, startMySQL]
        );
        
        if (existing && existing[0]) {
            // Update existing
            await pool.query(
                "UPDATE helferplan_setup_cleanup_shifts SET helper_id = ? WHERE id = ?",
                [helper_id || null, existing[0].id]
            );
            res.json({message: 'Schicht aktualisiert', id: existing[0].id});
        } else {
            // Create new
            const [result] = await pool.query(
                "INSERT INTO helferplan_setup_cleanup_shifts (day_type, start_time, end_time, helper_id) VALUES (?, ?, ?, ?)",
                [day_type, startMySQL, endMySQL, helper_id || null]
            );
            res.status(201).json({message: 'Schicht erstellt', id: Number(result.insertId)});
        }
    } catch (err) {
        console.error('DB-Fehler POST /api/setup-cleanup-shifts', err);
        res.status(500).json({error: 'DB-Fehler beim Speichern der Schicht'});
    }
});

// DELETE: Schicht leeren (helper_id auf NULL setzen)
app.delete('/api/setup-cleanup-shifts/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("UPDATE helferplan_setup_cleanup_shifts SET helper_id = NULL WHERE id = ?", [id]);
        res.json({message: 'Schicht geleert'});
    } catch (err) {
        console.error('DB-Fehler DELETE /api/setup-cleanup-shifts', err);
        res.status(500).json({error: 'DB-Fehler beim Leeren der Schicht'});
    }
});

// --- Cake Donations Endpoints ---

// GET: Abrufen aller Kuchenspenden
app.get('/api/cakes', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT 
                c.id,
                c.donation_day,
                c.helper_id,
                c.cake_type,
                c.contains_nuts,
                h.name as helper_name,
                t.color_hex as team_color
            FROM helferplan_cakes c
            LEFT JOIN helferplan_helpers h ON c.helper_id = h.id
            LEFT JOIN helferplan_teams t ON h.team_id = t.id
            ORDER BY 
                FIELD(c.donation_day, 'Freitag', 'Samstag', 'Sonntag'),
                c.id;
        `);
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/cakes', err);
        res.status(500).json({error: 'DB-Fehler beim Abrufen der Kuchen'});
    }
});

// POST: Kuchenspende erstellen oder aktualisieren
app.post('/api/cakes', async (req, res) => {
    try {
        const {id, donation_day, helper_id, cake_type, contains_nuts} = req.body;
        
        if (!donation_day) {
            return res.status(400).json({error: 'donation_day ist erforderlich.'});
        }
        
        if (id) {
            // Update existing
            await pool.query(
                `UPDATE helferplan_cakes 
                 SET helper_id = ?, cake_type = ?, contains_nuts = ? 
                 WHERE id = ?`,
                [helper_id || null, cake_type || null, contains_nuts ? 1 : 0, id]
            );
            res.json({message: 'Kuchen aktualisiert', id});
        } else {
            // Create new
            const [result] = await pool.query(
                `INSERT INTO helferplan_cakes (donation_day, helper_id, cake_type, contains_nuts) 
                 VALUES (?, ?, ?, ?)`,
                [donation_day, helper_id || null, cake_type || null, contains_nuts ? 1 : 0]
            );
            res.status(201).json({message: 'Kuchen erstellt', id: Number(result.insertId)});
        }
    } catch (err) {
        console.error('DB-Fehler POST /api/cakes', err);
        res.status(500).json({error: 'DB-Fehler beim Speichern des Kuchens'});
    }
});

// DELETE: Kuchenspende löschen
app.delete('/api/cakes/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM helferplan_cakes WHERE id = ?", [id]);
        res.json({message: 'Kuchen gelöscht'});
    } catch (err) {
        console.error('DB-Fehler DELETE /api/cakes', err);
        res.status(500).json({error: 'DB-Fehler beim Löschen des Kuchens'});
    }
});

// --- 6. Server starten ---
app.listen(port, () => {
    console.log(`Helferplan-Backend laeuft auf http://localhost:${port}`);
});