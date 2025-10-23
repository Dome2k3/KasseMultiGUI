// --- 1. Abhaengigkeiten importieren ---
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

// --- 2. Express-App initialisieren ---
const app = express();
const port = Number(process.env.PORT) || 3003;

// --- 3. DB-Pool einrichten ---
// Nutze einen Pool damit pool.getConnection() bzw. pool.query() funktioniert.
// Werte koennen per Umgebung gesetzt werden; hier sind sinnvolle Defaults.
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

// --- 4. Middleware einrichten ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Hilfsfunktion: sichere Query-Ausführung mit Logging
async function safeQuery(sql, params = []) {
    try {
        const [rows] = await pool.query(sql, params);
        return rows;
    } catch (err) {
        // Re-throw damit Caller den Fehler behandeln kann
        throw err;
    }
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

// Helfer abrufen (erweiterte Version)
app.get('/api/helpers', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT h.id, h.name, h.role, h.team_id, t.name AS team_name 
            FROM helferplan_helpers h
            LEFT JOIN teams t ON h.team_id = t.id
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
        const result = await pool.query("INSERT INTO helferplan_helpers (name, team_id, role) VALUES (?, ?, ?);", [name, team_id, role]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name, team_id, role });
    } catch (err) {
        if (err && err.errno === 1452) {
            return res.status(400).json({ error: `Team mit der ID ${req.body.team_id} existiert nicht.` });
        }
        console.error('DB-Fehler POST /api/helpers', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen des Helfers' });
    }
});

// Taetigkeits-Gruppen abrufen
app.get('/api/activity-groups', async (req, res) => {
    try {
        const rows = await safeQuery("SELECT id, name FROM helferplan_activity_groups ORDER BY sort_order, name;");
        res.json(rows);
    } catch (err) {
        console.error('DB-Fehler /api/activity-groups', err);
        res.status(500).json({ error: 'DB-Fehler beim Abrufen der Gruppen' });
    }
});

// Eine neue Taetigkeits-Gruppe erstellen
app.post('/api/activity-groups', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });
        const result = await pool.query("INSERT INTO helferplan_activity_groups (name) VALUES (?);", [name]);
        const insertResult = result[0];
        res.status(201).json({ id: Number(insertResult.insertId), name });
    } catch (err) {
        console.error('DB-Fehler POST /api/activity-groups', err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen der Gruppe' });
    }
});

// Alle Taetigkeiten abrufen
app.get('/api/activities', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT a.id, a.name, a.role_requirement, g.name AS group_name
            FROM helferplan_activities a
            LEFT JOIN activity_groups g ON a.group_id = g.id
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

// Alle zugewiesenen Turnierschichten abrufen
app.get('/api/tournament-shifts', async (req, res) => {
    try {
        const rows = await safeQuery(`
            SELECT ts.activity_id, ts.start_time, ts.helper_id, h.name as helper_name, t.color_hex as team_color
            FROM helferplan_tournament_shifts ts
            JOIN helpers h ON ts.helper_id = h.id
            JOIN teams t ON h.team_id = t.id;
        `);
        res.json(rows);
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

        const result = await pool.query(
            "INSERT INTO helferplan_tournament_shifts (activity_id, start_time, end_time, helper_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE helper_id = VALUES(helper_id);",
            [activity_id, start_time, end_time, helper_id]
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
        await pool.query("DELETE FROM helferplan_tournament_shifts WHERE activity_id = ? AND start_time = ?;", [activity_id, start_time]);
        res.status(200).json({ message: 'Schicht geloescht' });
    } catch (err) {
        console.error('DB-Fehler DELETE /api/tournament-shifts', err);
        res.status(500).json({ error: 'DB-Fehler beim Loeschen der Schicht' });
    }
});

// --- 6. Server starten ---
app.listen(port, () => {
    console.log(`Helferplan-Backend laeuft auf http://localhost:${port}`);
});