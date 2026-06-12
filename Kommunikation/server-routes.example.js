/*
 * Beispielrouten fuer die spaetere Express-Integration.
 * Verwendung:
 *   const registerKommunikationRoutes = require('./Kommunikation/server-routes.example');
 *   registerKommunikationRoutes(app, db, nodemailer, process.env);
 */

function registerKommunikationRoutes(app, db, nodemailer, env) {
    app.get("/kommunikation/api/eintraege", (req, res) => {
        db.query(
            "SELECT * FROM kommunikation_eintraege ORDER BY versanddatum ASC, id ASC",
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows.map(mapRow));
            }
        );
    });

    app.post("/kommunikation/api/eintraege", (req, res) => {
        const item = req.body;
        const sql = `
            INSERT INTO kommunikation_eintraege
                (typ, event_name, event_start, event_end, titel, meta_email, empfaenger,
                 versanddatum, betreff, text_html, text_plain, status, prioritaet, verantwortung, bemerkung)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            item.typ || item.type || "mail",
            item.event_name || item.eventName,
            item.event_start || item.eventStart,
            item.event_end || item.eventEnd,
            item.titel || item.title,
            item.meta_email || item.metaEmail,
            JSON.stringify(item.empfaenger || item.recipients || []),
            item.versanddatum || item.sendDate,
            item.betreff || item.subject || item.title || null,
            item.text_html || item.bodyHtml || null,
            item.text_plain || item.bodyText || null,
            item.status || "draft",
            item.prioritaet || "normal",
            item.verantwortung || null,
            item.bemerkung || null
        ];

        db.query(sql, params, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, id: result.insertId });
        });
    });

    app.patch("/kommunikation/api/eintraege/:id/status", (req, res) => {
        db.query(
            "UPDATE kommunikation_eintraege SET status = ?, geschickt_am = IF(? = 'sent', NOW(), geschickt_am) WHERE id = ?",
            [req.body.status, req.body.status, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    app.post("/kommunikation/api/eintraege/:id/qs-mail", async (req, res) => {
        db.query("SELECT * FROM kommunikation_eintraege WHERE id = ?", [req.params.id], async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden" });

            const item = mapRow(rows[0]);
            const recipients = item.empfaenger || [];
            const transporter = nodemailer.createTransport({
                host: env.SMTP_HOST,
                port: parseInt(env.SMTP_PORT || "587", 10),
                secure: false,
                auth: {
                    user: env.SMTP_USER,
                    pass: env.SMTP_PASS
                }
            });

            const html = `
                <h2>QS fuer BVT-Kommunikation</h2>
                <p><strong>Nach Freigabe weiterleiten an:</strong> ${escapeHtml(recipients.join(", "))}</p>
                <p><strong>Event:</strong> ${escapeHtml(item.event_name)} (${item.event_start} bis ${item.event_end})</p>
                <p><strong>Geplanter Versand:</strong> ${item.versanddatum}</p>
                <hr>
                ${item.text_html || escapeHtml(item.text_plain || "")}
            `;

            try {
                await transporter.sendMail({
                    from: env.SMTP_SENDER || env.SMTP_USER,
                    to: item.meta_email,
                    subject: `[QS BVT] ${item.betreff || item.titel}`,
                    html,
                    text: `QS fuer ${item.titel}\nWeiterleiten an: ${recipients.join(", ")}\n\n${item.text_plain || ""}`
                });

                db.query(
                    `INSERT INTO kommunikation_versand_log
                        (eintrag_id, versand_art, mail_an, betreff, status, gesendet_am)
                     VALUES (?, 'qs_meta', ?, ?, 'sent', NOW())`,
                    [item.id, JSON.stringify([item.meta_email]), `[QS BVT] ${item.betreff || item.titel}`]
                );

                res.json({ success: true });
            } catch (mailErr) {
                res.status(500).json({ error: mailErr.message });
            }
        });
    });
}

function mapRow(row) {
    return {
        ...row,
        empfaenger: typeof row.empfaenger === "string" ? JSON.parse(row.empfaenger || "[]") : row.empfaenger
    };
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

module.exports = registerKommunikationRoutes;
