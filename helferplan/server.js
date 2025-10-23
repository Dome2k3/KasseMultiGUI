// --- 1. Abhaengigkeiten importieren ---
const express = require('express');
const mysql = require("mysql2");
const cors = require('cors');

// --- 2. Express-App initialisieren ---
const app = express();
const port = 3003;


const pool = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port:process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectionLimit: 5
});

// --- 4. Middleware einrichten ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- 5. API-Endpunkte ---

// Teams abrufen
app.get('/api/teams', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT id, name, color_hex FROM teams ORDER BY name;");
        res.json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Abrufen der Teams' }); }
    finally { if (conn) conn.release(); }
});

// Team erstellen
app.post('/api/teams', async (req, res) => {
    let conn;
    try {
        const { name, color_hex } = req.body;
        if (!name || !color_hex) return res.status(400).json({ error: 'Name und Farbwert sind erforderlich.' });
        conn = await pool.getConnection();
        const result = await conn.query("INSERT INTO teams (name, color_hex) VALUES (?, ?);", [name, color_hex]);
        res.status(201).json({ id: Number(result.insertId), name, color_hex });
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Erstellen des Teams' }); }
    finally { if (conn) conn.release(); }
});

// Helfer abrufen (erweiterte Version)
app.get('/api/helpers', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT h.id, h.name, h.role, h.team_id, t.name AS team_name 
            FROM helpers h
            LEFT JOIN teams t ON h.team_id = t.id
            ORDER BY h.name;
        `);
        res.json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Abrufen der Helfer' }); } 
    finally { if (conn) conn.release(); }
});

// Helfer erstellen
app.post('/api/helpers', async (req, res) => {
    let conn;
    try {
        const { name, team_id, role } = req.body;
        if (!name || !team_id || !role) return res.status(400).json({ error: 'Name, Team-ID und Rolle sind erforderlich.' });
        const validRoles = ['Minderjaehrig', 'Erwachsen', 'Orga'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Ungueltige Rolle.' });
        conn = await pool.getConnection();
        const result = await conn.query("INSERT INTO helpers (name, team_id, role) VALUES (?, ?, ?);", [name, team_id, role]);
        res.status(201).json({ id: Number(result.insertId), name, team_id, role });
    } catch (err) {
        if (err.errno === 1452) return res.status(400).json({ error: `Team mit der ID ${req.body.team_id} existiert nicht.` });
        console.error(err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen des Helfers' });
    } finally { if (conn) conn.release(); }
});

// Taetigkeits-Gruppen abrufen
app.get('/api/activity-groups', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT id, name FROM activity_groups ORDER BY sort_order, name;");
        res.json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Abrufen der Gruppen' }); }
    finally { if (conn) conn.release(); }
});

// Eine neue Taetigkeits-Gruppe erstellen
app.post('/api/activity-groups', async (req, res) => {
    let conn;
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });
        conn = await pool.getConnection();
        const result = await conn.query("INSERT INTO activity_groups (name) VALUES (?);", [name]);
        res.status(201).json({ id: Number(result.insertId), name });
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Erstellen der Gruppe' }); }
    finally { if (conn) conn.release(); }
});

// Alle Taetigkeiten abrufen
app.get('/api/activities', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT a.id, a.name, a.role_requirement, g.name AS group_name
            FROM activities a
            LEFT JOIN activity_groups g ON a.group_id = g.id
            ORDER BY g.sort_order, g.name, a.sort_order, a.name;
        `);
        res.json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Abrufen der Taetigkeiten' }); }
    finally { if (conn) conn.release(); }
});

// Eine neue Taetigkeit erstellen
app.post('/api/activities', async (req, res) => {
    let conn;
    try {
        const { name, group_id, role_requirement } = req.body;
        if (!name || !group_id || !role_requirement) return res.status(400).json({ error: 'Name, Gruppen-ID und Rollen-Anforderung sind erforderlich.' });
        conn = await pool.getConnection();
        const result = await conn.query("INSERT INTO activities (name, group_id, role_requirement) VALUES (?, ?, ?);", [name, group_id, role_requirement]);
        res.status(201).json({ id: Number(result.insertId), name, group_id, role_requirement });
    } catch (err) {
        if (err.errno === 1452) return res.status(400).json({ error: `Gruppe mit der ID ${req.body.group_id} existiert nicht.` });
        console.error(err);
        res.status(500).json({ error: 'DB-Fehler beim Erstellen der Taetigkeit' });
    } finally { if (conn) conn.release(); }
});

// Alle zugewiesenen Turnierschichten abrufen
app.get('/api/tournament-shifts', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT ts.activity_id, ts.start_time, ts.helper_id, h.name as helper_name, t.color_hex as team_color
            FROM tournament_shifts ts
            JOIN helpers h ON ts.helper_id = h.id
            JOIN teams t ON h.team_id = t.id;
        `);
        res.json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Abrufen der Schichten' }); }
    finally { if (conn) conn.release(); }
});

// Eine Schicht erstellen oder aktualisieren
app.post('/api/tournament-shifts', async (req, res) => {
    let conn;
    const { activity_id, start_time, end_time, helper_id } = req.body;
    if (!activity_id || !start_time || !end_time || !helper_id) return res.status(400).json({ error: 'Alle Felder sind erforderlich.' });
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO tournament_shifts (activity_id, start_time, end_time, helper_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE helper_id = VALUES(helper_id);",
            [activity_id, start_time, end_time, helper_id]
        );
        res.status(201).json({ message: 'Schicht gespeichert', affectedRows: result.affectedRows });
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Speichern der Schicht' }); }
    finally { if (conn) conn.release(); }
});

// Eine Schicht loeschen
app.delete('/api/tournament-shifts', async (req, res) => {
    let conn;
    const { activity_id, start_time } = req.body;
    if (!activity_id || !start_time) return res.status(400).json({ error: 'Activity ID und Startzeit sind erforderlich.' });
    try {
        conn = await pool.getConnection();
        await conn.query("DELETE FROM tournament_shifts WHERE activity_id = ? AND start_time = ?;", [activity_id, start_time]);
        res.status(200).json({ message: 'Schicht geloescht' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'DB-Fehler beim Loeschen der Schicht' }); }
    finally { if (conn) conn.release(); }
});

// --- 6. Server starten ---
app.listen(port, () => {
    console.log(`Helferplan-Backend laeuft auf http://localhost:${port}`);
});
