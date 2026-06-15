// teams.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

require('dotenv').config({ path: process.env.ENV_FILE || '/var/www/html/kasse/Umgebung.env' });
require('dotenv').config({ path: path.join(__dirname, '..', 'Umgebung.env'), override: false });
require('dotenv').config({ path: path.join(__dirname, 'Umgebung.env'), override: false });

const importTeams = require('./importTeams');

const importConfigPath = process.env.TEAMS_IMPORT_CONFIG_FILE || path.join(__dirname, 'teams-config.json');

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

function readImportConfig() {
    let saved = {};
    if (fs.existsSync(importConfigPath)) {
        saved = JSON.parse(fs.readFileSync(importConfigPath, 'utf8'));
    }
    return importTeams.normalizeConfig({
        ...importTeams.DEFAULT_IMPORT_CONFIG,
        ...saved
    });
}

function writeImportConfig(config) {
    const normalized = importTeams.normalizeConfig(config);
    fs.writeFileSync(importConfigPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
}

async function getTeamById(id) {
    const [rows] = await db.query('SELECT * FROM teams WHERE id=? LIMIT 1', [id]);
    return rows[0] || null;
}

const router = express.Router();

router.get('/teams', async (req, res) => {
    try {
        await importTeams.ensureTeamColumns(db);
        const [rows] = await db.query(`
            SELECT *
            FROM teams
            ORDER BY warteliste ASC, sheet_row ASC, name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('GET /teams Fehler:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

router.get('/import-config', (req, res) => {
    try {
        res.json(readImportConfig());
    } catch (err) {
        console.error('GET /import-config Fehler:', err);
        res.status(500).json({ error: err.message || 'Konfiguration konnte nicht gelesen werden' });
    }
});

router.put('/import-config', (req, res) => {
    try {
        const config = writeImportConfig(req.body || {});
        res.json({ success: true, config });
    } catch (err) {
        console.error('PUT /import-config Fehler:', err);
        res.status(400).json({ success: false, message: err.message || 'Konfiguration ungueltig' });
    }
});

router.put('/teams/:id/status', async (req, res) => {
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

router.put('/teams/:id/teilnehmer', async (req, res) => {
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

router.post('/teams/management/cancel', async (req, res) => {
    const { cancelTeamId, replacementTeamId } = req.body || {};
    const connection = await db.getConnection();

    try {
        await importTeams.ensureTeamColumns(connection);
        await connection.beginTransaction();

        const [cancelRows] = await connection.query('SELECT * FROM teams WHERE id=? LIMIT 1 FOR UPDATE', [cancelTeamId]);
        const cancelTeam = cancelRows[0];
        if (!cancelTeam) {
            throw new Error('Abzumeldendes Team wurde nicht gefunden.');
        }

        let replacementTeam = null;
        const cancelStatus = Number(cancelTeam.bezahlt) ? 'rueckgabe' : 'abgemeldet';
        await connection.query('UPDATE teams SET status=? WHERE id=?', [cancelStatus, cancelTeamId]);

        if (replacementTeamId) {
            const [replacementRows] = await connection.query('SELECT * FROM teams WHERE id=? LIMIT 1 FOR UPDATE', [replacementTeamId]);
            replacementTeam = replacementRows[0];
            if (!replacementTeam) {
                throw new Error('Nachruecker-Team wurde nicht gefunden.');
            }
            const [numberRows] = await connection.query(`
                SELECT MAX(CAST(original_nummer AS UNSIGNED)) AS max_nummer
                FROM teams
                WHERE warteliste=0 AND original_nummer REGEXP '^[0-9]+$'
            `);
            const nextNumber = Number(numberRows[0]?.max_nummer || 0) + 1;
            await connection.query(
                'UPDATE teams SET status=?, warteliste=0, original_nummer=? WHERE id=?',
                ['angemeldet', String(nextNumber), replacementTeamId]
            );
            replacementTeam = {
                ...replacementTeam,
                status: 'angemeldet',
                warteliste: 0,
                original_nummer: String(nextNumber)
            };
        }

        await connection.commit();
        res.json({ success: true, cancelTeam, replacementTeam });
    } catch (err) {
        await connection.rollback();
        console.error('POST /teams/management/cancel Fehler:', err);
        res.status(400).json({ success: false, message: err.message || 'Abmeldung fehlgeschlagen' });
    } finally {
        connection.release();
    }
});

router.put('/teams/:id/waitlist-status', async (req, res) => {
    try {
        await importTeams.ensureTeamColumns(db);
        const { id } = req.params;
        const { status } = req.body || {};
        const allowed = new Set(['offen', 'angefragt', 'positive', 'abgemeldet']);
        if (!allowed.has(status)) {
            return res.status(400).json({ success: false, message: 'Ungueltiger Nachruecker-Status.' });
        }
        await db.query('UPDATE teams SET status=? WHERE id=? AND warteliste=1', [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /teams/:id/waitlist-status Fehler:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

router.post('/import-teams', async (req, res) => {
    try {
        const requestedConfig = req.body && req.body.config ? req.body.config : readImportConfig();
        const config = req.body && req.body.saveConfig ? writeImportConfig(requestedConfig) : importTeams.normalizeConfig(requestedConfig);
        const result = await importTeams(db, config);
        res.json({ success: true, message: 'Import erfolgreich abgeschlossen', result });
    } catch (err) {
        console.error('POST /import-teams Fehler:', err);
        res.status(500).json({ success: false, message: err.message || 'Import fehlgeschlagen' });
    }
});

module.exports = router;

if (require.main === module) {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '1mb' }));
    app.use('/', router);
    const PORT = process.env.PORT || 3002;
    app.listen(PORT, '0.0.0.0', () => console.log(`Teams-Server laeuft auf Port ${PORT}`));
}
