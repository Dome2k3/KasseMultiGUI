-- BVT Kommunikation
-- Erstellt Tabellen fuer Mailplanung, Meilensteine, QS-Freigabe und Versandhistorie.
-- Ausfuehren in der bestehenden MySQL-Datenbank, z.B. volleyball_turnier.

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
);

CREATE TABLE IF NOT EXISTS kommunikation_versand_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    eintrag_id INT NOT NULL,
    versand_art ENUM('qs_meta', 'final_empfaenger') NOT NULL,
    mail_an JSON NOT NULL,
    betreff VARCHAR(220) NOT NULL,
    status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
    fehler TEXT NULL,
    gesendet_am DATETIME NULL,
    erstellt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_kommunikation_versand_log_eintrag
        FOREIGN KEY (eintrag_id)
        REFERENCES kommunikation_eintraege(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kommunikation_vorlagen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    typ ENUM('mail', 'milestone') NOT NULL DEFAULT 'mail',
    betreff VARCHAR(220) NULL,
    text_html MEDIUMTEXT NULL,
    standard_empfaenger JSON NULL,
    standard_meta_email VARCHAR(255) NULL,
    aktiv TINYINT(1) NOT NULL DEFAULT 1,
    erstellt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aktualisiert_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kommunikation_erinnerungen_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    eintrag_id INT NOT NULL,
    erinnerung_am DATE NOT NULL,
    mail_an VARCHAR(255) NOT NULL,
    erstellt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_kommunikation_erinnerung (eintrag_id, erinnerung_am)
);

INSERT INTO kommunikation_eintraege
    (typ, event_name, event_start, event_end, titel, meta_email, empfaenger, versanddatum, betreff, text_html, text_plain, status, prioritaet, verantwortung)
VALUES
    (
        'mail',
        'BVT 39',
        '2027-07-02',
        '2027-07-04',
        'Grundabstimmung Stadt und Ordnungsamt',
        'tsv.auerbach.turnier@gmail.com',
        JSON_ARRAY('ordnungsamt@example.de', 'veranstaltungen@example.de'),
        '2027-01-15',
        'BVT 39 - Abstimmung Genehmigungen',
        'Hallo zusammen,<br><br>wir planen das BVT 39 von Freitag bis Sonntag und bitten um Rueckmeldung zu Genehmigungen, Sperrzeiten und Ansprechpartnern.<br><br>Viele Gruesse<br>Orga-Team',
        'Hallo zusammen,\n\nwir planen das BVT 39 von Freitag bis Sonntag und bitten um Rueckmeldung zu Genehmigungen, Sperrzeiten und Ansprechpartnern.\n\nViele Gruesse\nOrga-Team',
        'review',
        'kritisch',
        'Orga'
    ),
    (
        'milestone',
        'BVT 39',
        '2027-07-02',
        '2027-07-04',
        'Check: Strom, Wasser, Toiletten, Abfall',
        'tsv.auerbach.turnier@gmail.com',
        JSON_ARRAY(),
        '2027-03-15',
        NULL,
        'Interner Platzhalter: Infrastrukturpunkte pruefen und verantwortliche Personen eintragen.',
        'Interner Platzhalter: Infrastrukturpunkte pruefen und verantwortliche Personen eintragen.',
        'draft',
        'hoch',
        'Infrastruktur'
    );

-- Nuetzliche Abfrage fuer das Dashboard:
SELECT
    status,
    COUNT(*) AS anzahl
FROM kommunikation_eintraege
GROUP BY status
ORDER BY FIELD(status, 'draft', 'review', 'ready', 'sent', 'done', 'cancelled');
