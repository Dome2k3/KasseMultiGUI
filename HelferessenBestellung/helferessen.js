const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '..', 'Umgebung.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'Umgebung.env'), override: false });

const router = express.Router();

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

async function ensureTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS helferessen_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tag_label VARCHAR(120) NOT NULL,
            event_date DATE NULL,
            main_enabled TINYINT(1) NOT NULL DEFAULT 1,
            ice_enabled TINYINT(1) NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'open',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS helferessen_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            name VARCHAR(160) NOT NULL,
            main_choice VARCHAR(40) NULL,
            doener_ohne_zwiebeln TINYINT(1) NOT NULL DEFAULT 0,
            doener_falafel TINYINT(1) NOT NULL DEFAULT 0,
            wants_ice TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_helferessen_orders_event (event_id),
            CONSTRAINT fk_helferessen_orders_event
                FOREIGN KEY (event_id) REFERENCES helferessen_events(id)
                ON DELETE CASCADE
        )
    `);
}

function toIsoDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

function normalizeEvent(row) {
    return {
        id: row.id,
        tagLabel: row.tag_label,
        eventDate: toIsoDate(row.event_date),
        mainEnabled: Boolean(row.main_enabled),
        iceEnabled: Boolean(row.ice_enabled),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function normalizeOrder(row) {
    return {
        id: row.id,
        eventId: row.event_id,
        name: row.name,
        mainChoice: row.main_choice || '',
        doenerOhneZwiebeln: Boolean(row.doener_ohne_zwiebeln),
        doenerFalafel: Boolean(row.doener_falafel),
        wantsIce: Boolean(row.wants_ice),
        createdAt: row.created_at
    };
}

function validateOrder(event, payload) {
    const name = String(payload.name || '').trim();
    const mainChoice = String(payload.mainChoice || '').trim();
    const allowedMain = new Set(['salami', 'schinken', 'vegetarisch', 'pizzadoener', 'doener', '']);

    if (!name) throw new Error('Bitte Namen eintragen.');
    if (!allowedMain.has(mainChoice)) throw new Error('Ungueltige Essensauswahl.');
    if (event.main_enabled && !mainChoice && !payload.wantsIce) {
        throw new Error('Bitte Essen oder Eis auswaehlen.');
    }
    if (!event.main_enabled && mainChoice) {
        throw new Error('Fuer diesen Tag ist keine Pizza/Doener-Auswahl aktiv.');
    }
    if (!event.ice_enabled && payload.wantsIce) {
        throw new Error('Fuer diesen Tag ist Eis nicht aktiv.');
    }

    return {
        name,
        mainChoice,
        doenerOhneZwiebeln: mainChoice === 'doener' && Boolean(payload.doenerOhneZwiebeln),
        doenerFalafel: mainChoice === 'doener' && Boolean(payload.doenerFalafel),
        wantsIce: Boolean(payload.wantsIce)
    };
}

router.use(cors());
router.use(express.json({ limit: '1mb' }));

router.use(async (req, res, next) => {
    try {
        await ensureTables();
        next();
    } catch (err) {
        console.error('Helferessen Tabellenfehler:', err);
        res.status(500).json({ error: 'Datenbank konnte nicht vorbereitet werden.' });
    }
});

router.get('/events', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT *
            FROM helferessen_events
            ORDER BY COALESCE(event_date, '2999-12-31') DESC, id DESC
        `);
        res.json(rows.map(normalizeEvent));
    } catch (err) {
        console.error('GET /events Fehler:', err);
        res.status(500).json({ error: 'Events konnten nicht geladen werden.' });
    }
});

router.post('/events', async (req, res) => {
    try {
        const tagLabel = String(req.body.tagLabel || '').trim();
        const eventDate = toIsoDate(req.body.eventDate);
        const mainEnabled = Boolean(req.body.mainEnabled);
        const iceEnabled = Boolean(req.body.iceEnabled);

        if (!tagLabel) {
            return res.status(400).json({ error: 'Bitte Tag/Bezeichnung eintragen.' });
        }
        if (!mainEnabled && !iceEnabled) {
            return res.status(400).json({ error: 'Bitte mindestens eine Option aktivieren.' });
        }

        const [result] = await db.query(
            `INSERT INTO helferessen_events (tag_label, event_date, main_enabled, ice_enabled)
             VALUES (?, ?, ?, ?)`,
            [tagLabel, eventDate || null, mainEnabled ? 1 : 0, iceEnabled ? 1 : 0]
        );

        const [rows] = await db.query('SELECT * FROM helferessen_events WHERE id=?', [result.insertId]);
        res.status(201).json(normalizeEvent(rows[0]));
    } catch (err) {
        console.error('POST /events Fehler:', err);
        res.status(500).json({ error: 'Event konnte nicht angelegt werden.' });
    }
});

router.get('/events/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM helferessen_events WHERE id=? LIMIT 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Planung nicht gefunden.' });
        res.json(normalizeEvent(rows[0]));
    } catch (err) {
        console.error('GET /events/:id Fehler:', err);
        res.status(500).json({ error: 'Planung konnte nicht geladen werden.' });
    }
});

router.get('/events/:id/orders', async (req, res) => {
    try {
        const [eventRows] = await db.query('SELECT * FROM helferessen_events WHERE id=? LIMIT 1', [req.params.id]);
        if (!eventRows.length) return res.status(404).json({ error: 'Planung nicht gefunden.' });

        const [orders] = await db.query(
            `SELECT *
             FROM helferessen_orders
             WHERE event_id=?
             ORDER BY created_at ASC, id ASC`,
            [req.params.id]
        );

        res.json({
            event: normalizeEvent(eventRows[0]),
            orders: orders.map(normalizeOrder)
        });
    } catch (err) {
        console.error('GET /events/:id/orders Fehler:', err);
        res.status(500).json({ error: 'Bestellungen konnten nicht geladen werden.' });
    }
});

router.post('/events/:id/orders', async (req, res) => {
    try {
        const [eventRows] = await db.query('SELECT * FROM helferessen_events WHERE id=? LIMIT 1', [req.params.id]);
        if (!eventRows.length) return res.status(404).json({ error: 'Planung nicht gefunden.' });
        const event = eventRows[0];
        if (event.status !== 'open') {
            return res.status(400).json({ error: 'Diese Planung ist geschlossen.' });
        }

        const order = validateOrder(event, req.body || {});
        const [result] = await db.query(
            `INSERT INTO helferessen_orders
                (event_id, name, main_choice, doener_ohne_zwiebeln, doener_falafel, wants_ice)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.params.id,
                order.name,
                order.mainChoice || null,
                order.doenerOhneZwiebeln ? 1 : 0,
                order.doenerFalafel ? 1 : 0,
                order.wantsIce ? 1 : 0
            ]
        );

        const [rows] = await db.query('SELECT * FROM helferessen_orders WHERE id=?', [result.insertId]);
        res.status(201).json(normalizeOrder(rows[0]));
    } catch (err) {
        console.error('POST /events/:id/orders Fehler:', err);
        res.status(400).json({ error: err.message || 'Bestellung konnte nicht gespeichert werden.' });
    }
});

router.delete('/orders/:id', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM helferessen_orders WHERE id=?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /orders/:id Fehler:', err);
        res.status(500).json({ error: 'Eintrag konnte nicht geloescht werden.' });
    }
});

module.exports = router;

if (require.main === module) {
    const app = express();
    app.use('/', router);
    const port = process.env.HELFERESSEN_PORT || 3004;
    app.listen(port, '0.0.0.0', () => console.log(`Helferessen-Server laeuft auf Port ${port}`));
}
