require('dotenv').config({ path: '/var/www/html/kasse/Umgebung.env' });

// MYSQL
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

// Drucker
const { SerialPort } = require('serialport'); // Für den SerialPort weiterhin CommonJS
const esc = '\x1B'; // ESC-Zeichen für Steuerbefehle
const setEncoding = esc + '\x1B\x74' + '\x02'; // CP850 aktivieren (falls benötigt)
const FEED = '\x1B\x64\x03'; // ESC d 3: Papierzufuhr (weiterer Abstand)
// ESC/POS-Befehl für den Abschneider
const CUT = '\x1B\x69'; // ESC i: Befehl zum Abschneiden

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// // 🔹 MySQL-Verbindung
// const db = mysql.createConnection({
//     host: "localhost",
//     user: "Kasse",
//     password: "Kasse",
//     database: "kasse"
// });


const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port:process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});


// // 🔹 Route zum Speichern der Daten
// app.post('/saveReceipts', (req, res) => {
//     console.log("Empfangener Request Body:", req.body);
//     const { receipts } = req.body;
//     if (!receipts || receipts.length === 0) {
//         console.error("Fehler: Kein einziger Datensatz zum Einfügen!");
//         return res.status(400).json({ error: "Keine Daten zum Einfügen" });
//     }
//
//     // Erzeuge ein Array von Arrays – jede innere Zeile entspricht einer Datenzeile für die DB.
//     const values = receipts.map(item => [
//         item.bonNumber,
//         item.product_id,  // Beachte: Hier muss die Produkt-ID übermittelt werden
//         item.quantity,
//         item.price
//     ]);
//
//     // Verwende eine parameterisierte Query, um alle Zeilen in einem INSERT zu schreiben
//     const sql = "INSERT INTO receipts (bonNumber, product_id, quantity, price) VALUES ?";
//     console.log("SQL Query:", sql, values);
//
//     db.query(sql, [values], function (err, result) {
//         if (err) {
//             console.error("Fehler beim SQL-Insert:", err);
//             return res.status(500).json({ error: "Fehler beim Speichern der Daten" });
//         }
//         console.log("Daten erfolgreich gespeichert.");
//         return res.status(200).json({ success: true, result });
//     });
// });

// Finalize Bon speichern und ID zurückgeben
app.post('/finalize-bon', (req, res) => {
    const { bonDetails } = req.body;
    if (!bonDetails || !bonDetails.items || bonDetails.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Ungültige Bon-Daten' });
    }

    const category = bonDetails.gui || bonDetails.category || 'essen';
    const totalAmount = parseFloat(bonDetails.totalAmount) || 0.0;
    const items = bonDetails.items; // [{name,quantity,total}, ...]

    db.query('INSERT INTO kasse_bon (total, category) VALUES (?, ?)', [totalAmount, category], (err, result) => {
        if (err) {
            console.error('Fehler beim Speichern des Bons:', err);
            return res.status(500).json({ success: false, message: 'Fehler beim Speichern' });
        }
        const bonId = result.insertId;
        const itemValues = items.map(i => [bonId, i.name, i.quantity, i.total]);

        db.query('INSERT INTO kasse_bon_items (bon_id, name, quantity, total) VALUES ?', [itemValues], async (err2) => {
            if (err2) {
                console.error('Fehler beim Speichern der Items:', err2);
                return res.status(500).json({ success: false, message: 'Fehler beim Speichern der Items' });
            }

            // Optional: Drucken hier aufrufen (printReceipt) - wie du es aktuell tust
            // await printReceipt({...bonDetails, id: bonId, timestamp: new Date().toLocaleString()});

            return res.json({ success: true, id: bonId });
        });
    });
});




// GET /items?gui=essen
app.get('/items', (req, res) => {
    const gui = req.query.gui; // z.B. 'essen','pfand',...
    let sql = 'SELECT id, name, preis, kategorie, gui  FROM kasse_produkte';
    const params = [];

    if (gui) {
        sql += ' WHERE gui = ? OR gui = "all"';
        params.push(gui);
    }
    sql += ' ORDER BY kategorie, name';

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Fehler bei /items:', err);
            return res.status(500).json({ error: 'Fehler beim Abrufen der Artikel' });
        }
        res.json(results);
    });
});


// Server starten
//app.listen(3000, () => console.log("Server läuft auf http://localhost:3000"));

// SerialPort zum Drucken
const port = new SerialPort({
    path: 'COM4',
    baudRate: 9600
});

let isPortOpen = false;
port.on('open', () => {
    console.log('Port COM4 geöffnet');
    isPortOpen = true;
});
port.on('error', (err) => {
    console.error('Fehler:', err.message);
});

// Sleep-Funktion, um eine Verzögerung zu erzeugen (in Millisekunden)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Sonderzeichen ersetzen
function replaceSpecialChars(text) {
    return text
        .replace(/€/g, "[EUR]")
        .replace(/ü/g, "ue")
        .replace(/Ü/g, "UE")
        .replace(/ö/g, "oe")
        .replace(/ä/g, "ae")
        .replace(/ß/g, "ss");
}

// Hilfsfunktion: Daten schreiben und auf drain warten
function writeData(data) {
    return new Promise((resolve, reject) => {
        port.write(data, (err) => {
            if (err) {
                return reject(err);
            }
            port.drain((err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    });
}

// Funktion zum Drucken und Schneiden des Kassenbons
async function printCashReceipt(bonDetails) {
    if (!isPortOpen) {
        console.error('Port ist nicht geöffnet!');
        return;
    }
    let receiptText = `
*** Kassenbon ***

Bon Nr. ${bonDetails.id}
${bonDetails.timestamp}

--------------------------
Artikel                Preis
--------------------------
${bonDetails.items.map((item, index) => {
        const priceMatch = item.match(/€(\d+\.\d+)/);
        const price = priceMatch ? priceMatch[1] : '0.00';
        let itemText = `${index + 1}. ${item.replace(/^\d+\.\s*/, '')}`;
        // Hier den Preis nur einmal anzeigen – falls nötig, kannst du den Preis-Teil anpassen
        return `${itemText}`;
    }).join('\n')}

--------------------------
Gesamt: €${bonDetails.total}
--------------------------

Der Foerderverein dankt dir fuer 
deinen Einkauf!Save the Date:
BVT 38 - 3.-5. Juli 2026!
\n
`;
    receiptText = replaceSpecialChars(receiptText);
    try {
        await writeData(receiptText);
        console.log("Kassenbon erfolgreich gesendet");
        await writeData(FEED);
        console.log("Papierzufuhr für Küchenbon durchgeführt");
        await writeData(CUT);
        console.log("Kassenbon abgeschnitten");
    } catch (err) {
        console.error("Fehler beim Kassenbon: " + err.message);
    }
}

// Funktion zum Drucken und Schneiden des Küchenbons
async function printKitchenReceipt(bonDetails, kitchenItems) {
    let kitchenReceipt = `
*** KÜCHE ***

Bon Nr. ${bonDetails.id}
${bonDetails.timestamp}

--------------------------
Artikel
--------------------------
${kitchenItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}
--------------------------
\n\n
`;
    kitchenReceipt = replaceSpecialChars(kitchenReceipt);
    try {
        await writeData(kitchenReceipt);
        console.log("Küchenbon erfolgreich gesendet");
        // Papierzufuhr (Leerraum) hinzufügen
        await writeData(FEED);
        console.log("Papierzufuhr für Küchenbon durchgeführt");
        await writeData(CUT);
        console.log("Küchenbon abgeschnitten");
    } catch (err) {
        console.error("Fehler beim Küchenbon: " + err.message);
    }
}

// Funktion zum Drucken und Schneiden des Flammkuchenbons
async function printFlammkuchenReceipt(bonDetails) {
    if (!isPortOpen) {
        console.error('Port ist nicht geöffnet!');
        return;
    }

    // console.log("bonDetails.items (Original):", bonDetails.items);

    // Filtere die Items, die 'Flammkuchen' im Namen haben
    const flammkuchenItems = bonDetails.items.filter(item => item.includes('Flammkuchen'));

    // console.log("Flammkuchen-Artikel gefunden:", flammkuchenItems);

    if (flammkuchenItems.length === 0) {
        console.warn("Kein Flammkuchen in der Bestellung – Bon wird NICHT erstellt!");
    } else {
        console.log("Flammkuchen-Bon wird gedruckt...");
        // Hier dein Code zum Drucken des Flammkuchen-Bons
    }

    if (flammkuchenItems.length > 0) {
        let flammkuchenReceipt = `
*** FLAMMKUCHEN ***

Bon Nr. ${bonDetails.id}
${bonDetails.timestamp}

--------------------------
Flammkuchen
--------------------------
${flammkuchenItems.map((item, index) => `${index + 1}. ${item}`).join('\n')}

--------------------------
\n\n\n\n
`;
        flammkuchenReceipt = replaceSpecialChars(flammkuchenReceipt);
        try {
            await writeData(flammkuchenReceipt);
            console.log("Flammkuchenbon erfolgreich gesendet");
            // Papierzufuhr (Leerraum) hinzufügen
            await writeData(FEED);
            console.log("Papierzufuhr für Flammkuchenbon durchgeführt");
            await writeData(CUT);
            console.log("Flammkuchenbon abgeschnitten");
        } catch (err) {
            console.error("Fehler beim Flammkuchenbon: " + err.message);
        }
    }
}

// Funktion zum Drucken aller Bons
async function printReceipt(bonDetails) {
    if (!isPortOpen) {
        console.error('Port ist nicht geöffnet!');
        return;
    }
    const flammkuchenItems = bonDetails.items.filter(item => item.includes('Flammkuchen'));
    const kitchenItems = bonDetails.items.filter(item => !item.includes('Flammkuchen'));

    // Bon für die Kasse drucken
    await printCashReceipt(bonDetails);

    // Drucke die Küche, falls es solche Artikel gibt
    if (kitchenItems.length > 0) {
        await printKitchenReceipt(bonDetails, kitchenItems);
    }

    // Drucke den Flammkuchen-Bon
    if (flammkuchenItems.length > 0) {
        await printFlammkuchenReceipt(bonDetails, flammkuchenItems);
    }
}

// ➤ API-Route zum Drucken aus dem Client (script.js)
// POST-Route für Druckanforderung
app.post('/print', (req, res) => {
    const { bonDetails } = req.body;
    if (!bonDetails) {
        return res.status(400).json({ error: "Bon Details fehlen" });
    }
    // console.log("Druckauftrag erhalten:", bonDetails);
    printReceipt(bonDetails);
    return res.status(200).json({ success: true });
});




// 🔹 Route zur Abrufung von Verkaufsstatistiken mit optionalem Zeitfilter
app.get("/statistics", (req, res) => {
    const { date, startTime, endTime } = req.query;

    let whereClause = "";
    let params = [];

    if (date) {
        whereClause += "WHERE DATE(b.created_at) = ?";
        params.push(date);
    }

    if (startTime && endTime) {
        whereClause += whereClause ? " AND " : "WHERE ";
        whereClause += "TIME(b.created_at) BETWEEN ? AND ?";
        params.push(startTime, endTime);
    }

    const statsQuery = `
        SELECT
            DATE(b.created_at) AS date,
            COUNT(b.id) AS total_bons,
            SUM(b.totalAmount) AS total_revenue,
            (SUM(b.totalAmount) / COUNT(b.id)) AS avg_bon_value
        FROM kasse_bon b
            ${whereClause}
        GROUP BY DATE(b.created_at)
        ORDER BY DATE(b.created_at) DESC;
    `;

    db.query(statsQuery, params, (err, bonStats) => {
        if (err) {
            console.error("Fehler beim Abrufen der Statistik:", err);
            return res.status(500).json({ error: "Fehler beim Abrufen der Statistik" });
        }

        const productStatsQuery = `
            SELECT
                bi.name AS product_name,
                SUM(bi.quantity) AS total_sold,
                SUM(bi.total) AS total_revenue
            FROM kasse_bon_items bi
                     JOIN bon b ON bi.bon_id = b.id
                ${whereClause}
            GROUP BY bi.name
            ORDER BY total_sold DESC
                LIMIT 20;
        `;

        db.query(productStatsQuery, params, (err, productStats) => {
            if (err) {
                console.error("Fehler beim Abrufen der Produktstatistik:", err);
                return res.status(500).json({ error: "Fehler beim Abrufen der Produktstatistik" });
            }

            const intervalStatsQuery = `
                SELECT
                    CONCAT(HOUR(b.created_at), ':', LPAD(FLOOR(MINUTE(b.created_at) / 15) * 15, 2, '0')) AS \`interval\`,
                    bi.name AS product_name,
                    SUM(bi.quantity) AS total_sold
                FROM kasse_bon b
                         JOIN bon_items bi ON b.id = bi.bon_id
                    ${whereClause}
                GROUP BY \`interval\`, bi.name
                ORDER BY \`interval\`, bi.name;
            `;

            db.query(intervalStatsQuery, params, (err, intervalStats) => {
                if (err) {
                    console.error("Fehler beim Abrufen der Intervallstatistik:", err);
                    return res.status(500).json({ error: "Fehler beim Abrufen der Intervallstatistik" });
                }

                res.json({ bonStats, productStats, intervalStats });
            });
        });
    });
});

// ➤ API-Route: Bons mit Artikeln laden
app.get("/bons", (req, res) => {
    const query = `
        SELECT b.id, b.total AS totalAmount, b.created_at, b.category,
               bi.name, bi.quantity, bi.total
        FROM kasse_bon b
                 JOIN kasse_bon_items bi ON b.id = bi.bon_id
        ORDER BY b.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Fehler beim Abrufen der Bons:", err);
            return res.status(500).json({ error: "Fehler beim Abrufen der Bons" });
        }

        // Struktur: Bons mit Artikelliste zusammenbauen
        const bons = {};
        results.forEach(row => {
            if (!bons[row.id]) {
                bons[row.id] = {
                    id: row.id,
                    created_at: row.created_at,
                    totalAmount: row.totalAmount,
                    category: row.category, // Neu!
                    items: []
                };
            }
            bons[row.id].items.push({
                name: row.name,
                // price: row.price, // Entfernen!
                quantity: row.quantity,
                total: row.total
            });
        });

        // Objekt → Array
        const bonsArray = Object.values(bons);
        res.json(bonsArray);
    });
});

// GET /recent-bons?gui=essen
app.get('/recent-bons', (req, res) => {
    const gui = req.query.gui; // optional
    let where = '';
    const params = [];
    if (gui) {
        where = 'WHERE category = ?';
        params.push(gui);
    }

    const sql = `
        SELECT b.id, b.total AS totalAmount, b.category, b.created_at,
               bi.name, bi.quantity, bi.total AS item_total
        FROM (
                 SELECT id FROM kasse_bon
                                    ${where}
                 ORDER BY created_at DESC
                     LIMIT 10
             ) AS latest_bons
                 JOIN kasse_bon b ON b.id = latest_bons.id
                 LEFT JOIN kasse_bon_items bi ON b.id = bi.bon_id
        ORDER BY b.created_at DESC, bi.name
    `;

    db.query(sql, params, (err, rows) => {
        if (err) {
            console.error('Fehler bei /recent-bons:', err);
            return res.status(500).json({ error: 'Fehler beim Abrufen' });
        }

        const bons = {};
        rows.forEach(row => {
            if (!bons[row.id]) bons[row.id] = {
                id: row.id,
                totalAmount: row.totalAmount,
                category: row.category,
                created_at: row.created_at,
                items: []
            };
            if (row.name) bons[row.id].items.push({
                name: row.name,
                quantity: row.quantity,
                total: row.item_total
            });
        });

        res.json(Object.values(bons)); // Kein slice
    });
});


app.listen(3000, () => console.log("Statistik-Server läuft auf http://localhost:3000"));