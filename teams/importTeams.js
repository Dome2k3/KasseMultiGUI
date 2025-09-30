// importTeams.js
const { google } = require('googleapis');
const path = require('path');

/**
 * Importiert Teams aus Google Sheets und überschreibt die Tabelle.
 * Erwartet: Spalten G (Name), H (Anmelder), J (E-Mail), ab Zeile 3.
 * Überschreibt die Tabelle `teams` komplett.
 */

// Spreadsheet konfigurieren
const SPREADSHEET_ID = '1TA4WG5B73yDE1iN8x1vvtQ30yfVdWnorqeHr7lMFErk';
const RANGE = 'Anmeldungen 2025!G3:J161'; // Spalte G-H-J

module.exports = async function importTeams(db) {
    // Service-Account Datei laden
    const keyFile = path.join(__dirname, 'bvt_team_importer.json');

    // Authentifizierung für Google Sheets API
    const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Daten abrufen
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE
    });

    const rows = response.data.values || [];
    console.log(`Import: ${rows.length} Zeilen geladen.`);

    // Tabelle leeren
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    await db.query('TRUNCATE TABLE teams');
    await db.query('ALTER TABLE teams AUTO_INCREMENT = 1');
    await db.query('SET FOREIGN_KEY_CHECKS=1');

    // Zeilen einfügen
    for (const r of rows) {
        const name = (r[0] || '').toString().trim();     // G
        const anmelder = (r[1] || '').toString().trim(); // H
        const email = (r[3] || '').toString().trim();    // J

        if (!name) continue; // leere Zeilen überspringen

        await db.query(
            `INSERT INTO teams (name, anmelder, email, status, teilnehmerzahl)
       VALUES (?, ?, ?, ?, ?)`,
            [name, anmelder, email, 'neutral', 0]
        );
    }

    console.log('Import abgeschlossen.');
};
