require('dotenv').config({ path: '/var/www/html/kasse/Umgebung.env' });

const nodemailer = require("nodemailer");

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
    if (!isPortOpen) {
        console.error('Port ist nicht geöffnet!');
        return;
    }
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
    const { date, startTime, endTime, category } = req.query;

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
    if (category) {
        whereClause += whereClause ? " AND " : "WHERE ";
        whereClause += "b.category = ?";
        params.push(category);
    }

    const bonStatsQuery = `
        SELECT
            DATE(b.created_at) AS date,
            COUNT(b.id) AS total_bons,
            SUM(b.total) AS total_revenue,
            AVG(b.total) AS avg_bon_value
        FROM kasse_bon b
            ${whereClause}
        GROUP BY DATE(b.created_at)
        ORDER BY DATE(b.created_at) DESC;
    `;

    const productStatsQuery = `
        SELECT
            bi.name AS product_name,
            SUM(bi.quantity) AS total_sold,
            SUM(bi.total) AS total_revenue
        FROM kasse_bon_items bi
                 JOIN kasse_bon b ON bi.bon_id = b.id
            ${whereClause}
        GROUP BY bi.name
        ORDER BY total_sold DESC
            LIMIT 20;
    `;

    const intervalStatsQuery = `
        SELECT
            CONCAT(HOUR(b.created_at), ':', LPAD(FLOOR(MINUTE(b.created_at) / 15) * 15, 2, '0')) AS \`interval\`,
            bi.name AS product_name,
            SUM(bi.quantity) AS total_sold
        FROM kasse_bon b
                 JOIN kasse_bon_items bi ON b.id = bi.bon_id
            ${whereClause}
        GROUP BY \`interval\`, bi.name
        ORDER BY \`interval\`, bi.name;
    `;

    const categoryStatsQuery = `
        SELECT
            b.category,
            COUNT(b.id) AS total_bons,
            SUM(b.total) AS total_revenue,
            AVG(b.total) AS avg_bon_value
        FROM kasse_bon b
            ${whereClause}
        GROUP BY b.category
        ORDER BY total_revenue DESC
            LIMIT 20;
    `;

    // Helper für parallele Queries
    function runQuery(query, params) {
        return new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    }

    Promise.all([
        runQuery(bonStatsQuery, params),
        runQuery(productStatsQuery, params),
        runQuery(intervalStatsQuery, params),
        runQuery(categoryStatsQuery, params),
    ])
        .then(([bonStats, productStats, intervalStats, categoryStats]) => {
            res.json({ bonStats, productStats, intervalStats, categoryStats });
        })
        .catch(error => {
            console.error("Fehler bei Statistik-API:", error);
            res.status(500).json({ error: "Fehler beim Abrufen der Statistikdaten" });
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

// ➤ API-Route: Statistik per Mail versenden (mit Einzelposten/Produkte UND Gesamtstatistik)
app.post("/send-statistics-email", async (req, res) => {
    const { email, date, startTime, endTime, category } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "E-Mail fehlt" });

    // Filter bauen
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
    if (category) {
        whereClause += whereClause ? " AND " : "WHERE ";
        whereClause += "b.category = ?";
        params.push(category);
    }

    // 1. Gesamtstatistik (bonStats)
    const bonStatsQuery = `
        SELECT
            DATE(b.created_at) AS date,
            COUNT(b.id) AS total_bons,
            SUM(b.total) AS total_revenue,
            AVG(b.total) AS avg_bon_value
        FROM kasse_bon b
            ${whereClause}
        GROUP BY DATE(b.created_at)
        ORDER BY DATE(b.created_at) DESC;
    `;

    // 2. Kategorie-Statistik
    const categoryStatsQuery = `
        SELECT
            b.category,
            COUNT(b.id) AS total_bons,
            SUM(b.total) AS total_revenue,
            AVG(b.total) AS avg_bon_value
        FROM kasse_bon b
            ${whereClause}
        GROUP BY b.category
        ORDER BY total_revenue DESC
            LIMIT 20;
    `;

    // 3. Einzelposten nach Kategorie
    const itemStatsQuery = `
        SELECT
            b.category,
            bi.name AS product_name,
            SUM(bi.quantity) AS total_sold,
            SUM(bi.total) AS total_revenue
        FROM kasse_bon_items bi
                 JOIN kasse_bon b ON bi.bon_id = b.id
            ${whereClause}
        GROUP BY b.category, bi.name
        ORDER BY b.category, total_sold DESC
            LIMIT 200;
    `;

    function runQuery(query, params) {
        return new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
    }

    let bonStats, categoryStats, itemStats;
    try {
        [bonStats, categoryStats, itemStats] = await Promise.all([
            runQuery(bonStatsQuery, params),
            runQuery(categoryStatsQuery, params),
            runQuery(itemStatsQuery, params)
        ]);
    } catch (err) {
        console.error("Fehler beim Lesen Statistikdaten:", err);
        return res.status(500).json({ success: false, message: "Fehler beim Abrufen der Statistik" });
    }

    if ((!categoryStats || categoryStats.length === 0) && (!bonStats || bonStats.length === 0)) {
        return res.json({ success: false, message: "Keine Daten für diesen Zeitraum." });
    }

    // -- MAILTEXT AUFBAUEN (Klartext für Fallback) --
    let mailText = ``;

    // Gesamtstatistik als Text
    mailText += `Gesamtstatistik\n\n`;
    mailText += `Datum                | Bons | Umsatz (€) | ⌀ Bon (€)\n`;
    mailText += `---------------------|------|------------|----------\n`;
    bonStats.forEach(row => {
        // Datum als String formatieren!
        let dateStr = row.date ? (typeof row.date === "string" ? row.date : row.date.toISOString().slice(0,10)) : "";
        mailText +=
            dateStr.padEnd(20, " ") + " | " +
            String(row.total_bons).padStart(4, " ") + " | " +
            (parseFloat(row.total_revenue).toFixed(2).toString()).padStart(10, " ") + " | " +
            (parseFloat(row.avg_bon_value).toFixed(2).toString()).padStart(8, " ") + "\n";
    });

    mailText += `\n\nTagesstatistik nach Kategorie\n\n`;
    mailText += `Kategorie                | Bons | Umsatz (€) | ⌀ Bon (€)\n`;
    mailText += `-------------------------|------|------------|----------\n`;
    categoryStats.forEach(row => {
        mailText +=
            (row.category || "").padEnd(25, " ") + " | " +
            String(row.total_bons).padStart(4, " ") + " | " +
            (parseFloat(row.total_revenue).toFixed(2).toString()).padStart(10, " ") + " | " +
            (parseFloat(row.avg_bon_value).toFixed(2).toString()).padStart(8, " ") + "\n";
    });

    // Einzelposten gruppieren
    const itemsByCat = {};
    itemStats.forEach(row => {
        if (!itemsByCat[row.category]) itemsByCat[row.category] = [];
        itemsByCat[row.category].push(row);
    });

    mailText += "\n\n-----------------------------\n";
    mailText += "Einzelposten nach Kategorie:\n";
    mailText += "-----------------------------\n\n";
    categoryStats.forEach(catRow => {
        const cat = catRow.category;
        mailText += `Kategorie: ${cat}\n`;
        if (!itemsByCat[cat] || itemsByCat[cat].length === 0) {
            mailText += "  (keine Produkte)\n";
            return;
        }
        mailText += "  Einzelposten                 | Anzahl | Umsatz (€)\n";
        mailText += "  -----------------------------|--------|-----------\n";
        itemsByCat[cat].forEach((item) => {
            mailText += "  " +
                (item.product_name || "").padEnd(28, " ") + "| " +
                String(item.total_sold).padStart(6, " ") + " | " +
                (parseFloat(item.total_revenue).toFixed(2).toString()).padStart(9, " ") + "\n";
        });
        mailText += "\n";
    });

    // -- MAILHTML AUFBAUEN (Schön für moderne Clients) --
    let mailHtml = `
    <h2 style="margin-bottom:4px;">Gesamtstatistik</h2>
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; margin-top:8px; margin-bottom:18px;">
      <tr style="background:#eee;">
        <th>Datum</th>
        <th>Bons</th>
        <th>Umsatz&nbsp;(&euro;)</th>
        <th>&Oslash;&nbsp;Bon&nbsp;(&euro;)</th>
      </tr>
      ${bonStats.map(row => {
        let dateStr = row.date ? (typeof row.date === "string" ? row.date : row.date.toISOString().slice(0,10)) : "";
        return `
        <tr>
          <td>${dateStr}</td>
          <td align="right">${row.total_bons}</td>
          <td align="right">${parseFloat(row.total_revenue).toFixed(2)}</td>
          <td align="right">${parseFloat(row.avg_bon_value).toFixed(2)}</td>
        </tr>
      `;
    }).join("")}
    </table>
    <hr>
    <h2 style="margin-bottom:4px;">Tagesstatistik nach Kategorie</h2>
    <div>
        <b>Datum:</b> ${date || "Alle"}<br>
        ${startTime && endTime ? `<b>Zeitraum:</b> ${startTime} - ${endTime}<br>` : ""}
        ${category ? `<b>Kategorie:</b> ${category}<br>` : ""}
    </div>
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; margin-top:8px; margin-bottom:18px;">
      <tr style="background:#eee;">
        <th>Kategorie</th>
        <th>Bons</th>
        <th>Umsatz&nbsp;(&euro;)</th>
        <th>&Oslash;&nbsp;Bon&nbsp;(&euro;)</th>
      </tr>
      ${categoryStats.map(row => `
        <tr>
          <td>${row.category}</td>
          <td align="right">${row.total_bons}</td>
          <td align="right">${parseFloat(row.total_revenue).toFixed(2)}</td>
          <td align="right">${parseFloat(row.avg_bon_value).toFixed(2)}</td>
        </tr>
      `).join("")}
    </table>
    <hr>
    <h2 style="margin-bottom:4px;">Einzelposten nach Kategorie</h2>
    `;

    categoryStats.forEach(catRow => {
        const cat = catRow.category;
        mailHtml += `<h3 style="margin-bottom:2px;">${cat}</h3>`;
        if (!itemsByCat[cat] || itemsByCat[cat].length === 0) {
            mailHtml += `<i>(keine Produkte)</i>`;
            return;
        }
        mailHtml += `
        <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; margin-bottom:18px;">
          <tr style="background:#eee;">
            <th>Einzelposten</th>
            <th>Anzahl</th>
            <th>Umsatz&nbsp;(&euro;)</th>
          </tr>
          ${itemsByCat[cat].map(item => `
            <tr>
              <td>${item.product_name}</td>
              <td align="right">${item.total_sold}</td>
              <td align="right">${parseFloat(item.total_revenue).toFixed(2)}</td>
            </tr>
          `).join("")}
        </table>
        `;
    });

    // -- MAIL SENDEN --
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.SMTP_SENDER || process.env.SMTP_USER,
            to: email,
            subject:  `Statistik für ${date || "Alle Tage"}: Gesamt, Kategorie und Einzelposten`,
            text: mailText, // Fallback (Plaintext)
            html: mailHtml  // Schöne HTML-Mail!
        });

        res.json({ success: true });
    } catch (err) {
        console.error("E-Mail-Versand fehlgeschlagen:", err);
        res.json({ success: false, message: "Fehler beim E-Mail-Versand (" + err.message + ")" });
    }
});


// Alle Lager-Einträge anzeigen
app.get('/lager', (req, res) => {
    db.query('SELECT * FROM lager_bestand ORDER BY produkt_name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Einzelnen Lager-Eintrag holen
app.get('/lager/:id', (req, res) => {
    db.query('SELECT * FROM lager_bestand WHERE id = ?', [req.params.id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(rows[0]);
    });
});

// Neuen Lager-Eintrag anlegen
app.post('/lager', (req, res) => {
    const { produkt_name, menge, einheit } = req.body;
    if (!produkt_name || !menge || !einheit) return res.status(400).json({ error: 'Fehlende Felder' });
    db.query('INSERT INTO lager_bestand (produkt_name, menge, einheit) VALUES (?, ?, ?)', [produkt_name, menge, einheit], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Lager-Eintrag bearbeiten
app.put('/lager/:id', (req, res) => {
    const { produkt_name, menge, einheit } = req.body;
    db.query('UPDATE lager_bestand SET produkt_name = ?, menge = ?, einheit = ? WHERE id = ?', [produkt_name, menge, einheit, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Lager-Eintrag löschen
app.delete('/lager/:id', (req, res) => {
    db.query('DELETE FROM lager_bestand WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// Alle Gebinde anzeigen
app.get('/config-gebinde', (req, res) => {
    db.query('SELECT * FROM config_gebinde ORDER BY produkt_name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Einzelnes Gebinde holen
app.get('/config-gebinde/:id', (req, res) => {
    db.query('SELECT * FROM config_gebinde WHERE id = ?', [req.params.id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(rows[0]);
    });
});

// Neues Gebinde eintragen
app.post('/config-gebinde', (req, res) => {
    const { produkt_name, gebinde_groesse } = req.body;
    if (!produkt_name || !gebinde_groesse) return res.status(400).json({ error: 'Fehlende Felder' });
    db.query('INSERT INTO config_gebinde (produkt_name, gebinde_groesse) VALUES (?, ?)', [produkt_name, gebinde_groesse], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Gebinde bearbeiten
app.put('/config-gebinde/:id', (req, res) => {
    const { produkt_name, gebinde_groesse } = req.body;
    db.query('UPDATE config_gebinde SET produkt_name = ?, gebinde_groesse = ? WHERE id = ?', [produkt_name, gebinde_groesse, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Gebinde löschen
app.delete('/config-gebinde/:id', (req, res) => {
    db.query('DELETE FROM config_gebinde WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});



app.listen(3000, () => console.log("Statistik-Server läuft auf http://localhost:3000"));
