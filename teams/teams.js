// teams.js
require('dotenv').config({ path: '/var/www/html/teams/Umgebung.env' });

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const importTeams = require('./importTeams'); // unser Import-Modul

const app = express();
app.use(cors());
app.use(express.json());

// DB-Pool
const db = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- Endpoints ---

// Alle Teams abrufen
app.get('/teams', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM teams ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        console.error('GET /teams Fehler:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// Status ändern
app.put('/teams/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await db.query('UPDATE teams SET status=? WHERE id=?', [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /teams/:id/status Fehler:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// Teilnehmerzahl ändern
app.put('/teams/:id/teilnehmer', async (req, res) => {
    try {
        const { id } = req.params;
        const { teilnehmerzahl } = req.body;
        await db.query('UPDATE teams SET teilnehmerzahl=? WHERE id=?', [teilnehmerzahl, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /teams/:id/teilnehmer Fehler:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// Import starten (überschreibt die Tabelle)
app.post('/import-teams', async (req, res) => {
    try {
        // optional: hier kann man noch auth/secret prüfen (nicht eingebaut)
        await importTeams(db);
        res.json({ success: true, message: 'Import erfolgreich abgeschlossen' });
    } catch (err) {
        console.error('POST /import-teams Fehler:', err);
        res.status(500).json({ success: false, message: err.message || 'Import fehlgeschlagen' });
    }
});

// Server starten
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => console.log(`Server läuft auf Port ${PORT}`));
