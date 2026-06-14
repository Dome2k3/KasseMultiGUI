// importTeams.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function resolveKeyFile() {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
        return process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    }
    const candidates = [
        '/etc/secrets/bvt_team_importer.json',
        '/etc/secrets/bvt_team_importer',
        path.join(__dirname, 'bvt_team_importer.json')
    ];
    return candidates.find((f) => fs.existsSync(f)) || candidates[candidates.length - 1];
}

const DEFAULT_IMPORT_CONFIG = {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '1TA4WG5B73yDE1iN8x1vvtQ30yfVdWnorqeHr7lMFErk',
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Anmeldungen 2026',
    startRow: Number(process.env.GOOGLE_SHEET_START_ROW || 3),
    endRow: process.env.GOOGLE_SHEET_END_ROW || ''
};

const LEVEL_COLUMNS = [
    { index: 12, label: 'Hobby' },
    { index: 13, label: 'Wir geben alles' },
    { index: 14, label: 'Wir aergern die Starken' },
    { index: 15, label: 'Wir rocken das (Besten)' }
];

function normalizeConfig(config = {}) {
    const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || config.spreadsheetUrl || DEFAULT_IMPORT_CONFIG.spreadsheetId);
    const sheetName = String(config.sheetName || DEFAULT_IMPORT_CONFIG.sheetName).trim();
    const startRow = Math.max(1, Number(config.startRow || DEFAULT_IMPORT_CONFIG.startRow || 3));
    const endRowRaw = String(config.endRow || DEFAULT_IMPORT_CONFIG.endRow || '').trim();
    const endRow = endRowRaw ? Math.max(startRow, Number(endRowRaw)) : '';

    if (!spreadsheetId) {
        throw new Error('Keine gueltige Google-Spreadsheet-ID konfiguriert.');
    }
    if (!sheetName) {
        throw new Error('Kein Tabellenblatt konfiguriert.');
    }

    return { spreadsheetId, sheetName, startRow, endRow };
}

function extractSpreadsheetId(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : raw;
}

function quoteSheetName(sheetName) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
}

function buildRange(config) {
    const end = config.endRow || '';
    return `${quoteSheetName(config.sheetName)}!A${config.startRow}:W${end}`;
}

function text(value) {
    return String(value || '').trim();
}

function normalizeText(value) {
    return text(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function isTruthySheetValue(value) {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    if (['false', 'falsch', 'nein', 'no', '0', '-'].includes(normalized)) return false;
    return true;
}

function parsePaymentStatus(value) {
    const raw = text(value);
    const normalized = normalizeText(raw);
    const negative = /(nicht|unbezahlt|offen|nein|no|false|ausstehend)/.test(normalized);
    const positive = /(bezahlt|ja|yes|true|x|ok)/.test(normalized);
    return {
        status: raw || 'unbekannt',
        paid: positive && !negative
    };
}

function parseLevel(row) {
    const selected = LEVEL_COLUMNS
        .filter(({ index }) => isTruthySheetValue(row[index]))
        .map(({ label }) => label);

    return selected.join(', ') || 'nicht angegeben';
}

function extractFirstName(value) {
    const cleaned = text(value)
        .replace(/^(hallo|hi|liebe|lieber|frau|herr)\s+/i, '')
        .replace(/[,\.;:].*$/, '')
        .trim();
    return cleaned.split(/\s+/)[0] || cleaned || '';
}

function parseOriginalNumber(value) {
    const firstPart = text(value).split(',')[0].replace(/[\[\]]/g, '').trim();
    return firstPart || text(value);
}

function isWaitlist(value) {
    const normalized = normalizeText(value);
    return normalized.includes('nachrucker') || normalized.includes('nachruecker') || normalized.includes('warteliste');
}

async function ensureTeamColumns(db) {
    const [columns] = await db.query('SHOW COLUMNS FROM teams');
    const existing = new Set(columns.map((column) => column.Field));
    const additions = [
        ['sheet_row', 'INT NULL'],
        ['original_nummer', 'VARCHAR(80) NULL'],
        ['melder_vorname', 'VARCHAR(120) NULL'],
        ['bezahlstatus', 'VARCHAR(120) NULL'],
        ['bezahlt', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ['level', 'VARCHAR(180) NULL'],
        ['warteliste', 'TINYINT(1) NOT NULL DEFAULT 0']
    ];

    for (const [name, definition] of additions) {
        if (!existing.has(name)) {
            await db.query(`ALTER TABLE teams ADD COLUMN ${name} ${definition}`);
        }
    }
}

module.exports = async function importTeams(db, importConfig = {}) {
    const config = normalizeConfig(importConfig);
    const keyFile = resolveKeyFile();

    await ensureTeamColumns(db);

    const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const range = buildRange(config);
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range
    });

    const rows = response.data.values || [];
    console.log(`Import: ${rows.length} Zeilen aus ${config.sheetName} geladen.`);

    await db.query('SET FOREIGN_KEY_CHECKS=0');
    await db.query('TRUNCATE TABLE teams');
    await db.query('ALTER TABLE teams AUTO_INCREMENT = 1');
    await db.query('SET FOREIGN_KEY_CHECKS=1');

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const name = text(row[6]);          // G
        const anmelder = text(row[7]);      // H
        const email = text(row[9]);         // J
        const payment = parsePaymentStatus(row[22]); // W
        const waitlist = isWaitlist(row[0]);

        if (!name) continue;

        await db.query(
            `INSERT INTO teams
                (name, anmelder, email, status, teilnehmerzahl, sheet_row, original_nummer, melder_vorname, bezahlstatus, bezahlt, level, warteliste)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                anmelder,
                email,
                waitlist ? 'nachruecker' : 'neutral',
                0,
                config.startRow + index,
                parseOriginalNumber(row[0]),
                extractFirstName(anmelder),
                payment.status,
                payment.paid ? 1 : 0,
                parseLevel(row),
                waitlist ? 1 : 0
            ]
        );
    }

    console.log('Import abgeschlossen.');
    return {
        importedRows: rows.length,
        range,
        config
    };
};

module.exports.DEFAULT_IMPORT_CONFIG = DEFAULT_IMPORT_CONFIG;
module.exports.normalizeConfig = normalizeConfig;
module.exports.ensureTeamColumns = ensureTeamColumns;
