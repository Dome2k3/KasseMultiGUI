const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

const localEnvPath = path.join(__dirname, "..", "Umgebung.env");
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : "/var/www/html/kasse/Umgebung.env" });

const DEFAULT_INPUT = path.join(
    process.env.USERPROFILE || "",
    ".codex",
    "attachments",
    "9e42db62-4311-4786-99ca-f019c6881f17",
    "pasted-text.txt"
);

const inputFile = process.argv.slice(2).find((argument) => !argument.startsWith("--")) || DEFAULT_INPUT;
const shouldApply = process.argv.includes("--apply");

const EVENT_NAME = process.env.BVT_KOMM_EVENT_NAME || "38. Bergsträßer Volleyballturnier 2026";
const EVENT_START = process.env.BVT_KOMM_EVENT_START || "2026-07-03";
const EVENT_END = process.env.BVT_KOMM_EVENT_END || "2026-07-05";
const DEFAULT_SEND_DATE = process.env.BVT_KOMM_SEND_DATE || "2026-06-12";
const META_EMAIL = process.env.BVT_KOMM_META_EMAIL || process.env.SMTP_USER || "tsv.auerbach.turnier@gmail.com";

const dbConfig = {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
};

async function main() {
    validateConfig();

    if (!fs.existsSync(inputFile)) {
        throw new Error(`Importdatei nicht gefunden: ${inputFile}`);
    }

    const raw = fs.readFileSync(inputFile, "utf8").replace(/^\uFEFF/, "");
    const rows = parseTsv(raw)
        .filter((row) => row.some((cell) => cell.trim()))
        .map(toEntry);

    console.log(`Gelesene Einträge: ${rows.length}`);
    console.log(`Modus: ${shouldApply ? "INSERT in Datenbank" : "Dry-Run, keine DB-Änderung"}`);

    if (!shouldApply) {
        printPreview(rows);
        console.log("\nZum echten Import ausführen mit: node Kommunikation\\import-kommunikation-2026.js --apply");
        return;
    }

    const db = await mysql.createConnection(dbConfig);
    try {
        await ensureTables(db);
        let inserted = 0;
        let skipped = 0;

        for (const entry of rows) {
            const exists = await entryExists(db, entry);
            if (exists) {
                skipped += 1;
                continue;
            }
            await insertEntry(db, entry);
            inserted += 1;
        }

        console.log(`Import abgeschlossen. Neu eingefügt: ${inserted}, übersprungen: ${skipped}`);
    } finally {
        await db.end();
    }
}

function validateConfig() {
    const missing = Object.entries(dbConfig)
        .filter(([, value]) => value === undefined || value === "")
        .map(([key]) => key);

    if (missing.length) {
        throw new Error(`Fehlende DB-Konfiguration in Umgebung.env: ${missing.join(", ")}`);
    }
}

function parseTsv(raw) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < raw.length; index += 1) {
        const char = raw[index];
        const next = raw[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "\t" && !inQuotes) {
            row.push(cell.trim());
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    if (cell.length || row.length) {
        row.push(cell.trim());
        rows.push(row);
    }

    return rows.map((cells) => {
        const normalized = [...cells];
        while (normalized.length < 3) normalized.push("");
        return normalized.slice(0, 3);
    });
}

function toEntry(cells) {
    const [recipientRaw, titleRaw, bodyRaw] = cells;
    const recipients = extractRecipients(recipientRaw);
    const isMail = recipients.length > 0;
    const title = titleRaw || recipientRaw || "Kommunikationspunkt";
    const body = bodyRaw || titleRaw || recipientRaw || "";
    const plain = body.trim();

    return {
        typ: isMail ? "mail" : "milestone",
        event_name: EVENT_NAME,
        event_start: EVENT_START,
        event_end: EVENT_END,
        titel: title.trim().slice(0, 220),
        meta_email: META_EMAIL,
        empfaenger: recipients,
        versanddatum: DEFAULT_SEND_DATE,
        betreff: isMail ? title.trim().slice(0, 220) : null,
        text_html: plainToHtml(plain),
        text_plain: plain,
        status: "draft",
        prioritaet: isMail ? "normal" : "hoch",
        verantwortung: guessOwner(recipientRaw, title),
        bemerkung: `Import aus pasted-text.txt am 2026-06-12. Originalkontakt: ${recipientRaw || "-"}`
    };
}

function extractRecipients(raw) {
    const normalized = raw
        .replace(/\s+at\s+/gi, "@")
        .replace(/[;,]/g, "\n")
        .split(/\s*\n\s*/)
        .map((part) => part.trim().replace(/\s+/g, ""))
        .filter(Boolean);

    return [...new Set(normalized.filter((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)))];
}

function plainToHtml(text) {
    return escapeHtml(text)
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function guessOwner(recipientRaw, title) {
    const combined = `${recipientRaw} ${title}`.toLowerCase();
    if (combined.includes("kai") || combined.includes("lehmann")) return "Kai";
    if (combined.includes("lisa")) return "Lisa";
    if (combined.includes("dominik")) return "Dominik";
    return "Orga";
}

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS kommunikation_eintraege (
            id INT AUTO_INCREMENT PRIMARY KEY,
            typ ENUM('mail', 'milestone') NOT NULL DEFAULT 'mail',
            event_name VARCHAR(160) NOT NULL,
            event_start DATE NOT NULL,
            event_end DATE NOT NULL,
            titel VARCHAR(220) NOT NULL,
            meta_email VARCHAR(255) NOT NULL,
            empfaenger JSON NULL,
            versanddatum DATE NOT NULL,
            betreff VARCHAR(220) NULL,
            text_html MEDIUMTEXT NULL,
            text_plain MEDIUMTEXT NULL,
            status ENUM('draft', 'review', 'ready', 'sent', 'done', 'cancelled') NOT NULL DEFAULT 'draft',
            prioritaet ENUM('normal', 'hoch', 'kritisch') NOT NULL DEFAULT 'normal',
            verantwortung VARCHAR(120) NULL,
            bemerkung TEXT NULL,
            geschickt_am DATETIME NULL,
            erstellt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            aktualisiert_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_kommunikation_versanddatum (versanddatum),
            INDEX idx_kommunikation_status (status),
            INDEX idx_kommunikation_typ (typ)
        )
    `);
}

async function entryExists(db, entry) {
    const [rows] = await db.execute(
        `SELECT id
           FROM kommunikation_eintraege
          WHERE event_name = ?
            AND titel = ?
            AND versanddatum = ?
            AND text_plain = ?
          LIMIT 1`,
        [entry.event_name, entry.titel, entry.versanddatum, entry.text_plain]
    );
    return rows.length > 0;
}

async function insertEntry(db, entry) {
    await db.execute(
        `INSERT INTO kommunikation_eintraege
            (typ, event_name, event_start, event_end, titel, meta_email, empfaenger,
             versanddatum, betreff, text_html, text_plain, status, prioritaet, verantwortung, bemerkung)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            entry.typ,
            entry.event_name,
            entry.event_start,
            entry.event_end,
            entry.titel,
            entry.meta_email,
            JSON.stringify(entry.empfaenger),
            entry.versanddatum,
            entry.betreff,
            entry.text_html,
            entry.text_plain,
            entry.status,
            entry.prioritaet,
            entry.verantwortung,
            entry.bemerkung
        ]
    );
}

function printPreview(rows) {
    rows.forEach((entry, index) => {
        const recipients = entry.empfaenger.length ? entry.empfaenger.join(", ") : "Meilenstein/Notiz";
        console.log(`${String(index + 1).padStart(2, "0")}. [${entry.typ}] ${entry.titel} -> ${recipients}`);
    });
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
