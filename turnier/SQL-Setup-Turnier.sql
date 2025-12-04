-- ============================================
-- TURNIER-MANAGEMENT SQL SCHEMA
-- Vollautomatisierter Turnierbaum für Beachvolleyball
-- ============================================

-- Turnier-Konfiguration (Haupteinstellungen)
CREATE TABLE IF NOT EXISTS turnier_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_name VARCHAR(255) NOT NULL,
    turnier_datum DATE NOT NULL,
    anzahl_teams INT NOT NULL DEFAULT 32,
    anzahl_felder INT NOT NULL DEFAULT 4,
    anzahl_klassen INT NOT NULL DEFAULT 3,
    klassen_namen JSON DEFAULT '["A", "B", "C"]',
    spielzeit_minuten INT NOT NULL DEFAULT 15,
    pause_minuten INT NOT NULL DEFAULT 5,
    startzeit TIME NOT NULL DEFAULT '09:00:00',
    endzeit TIME NOT NULL DEFAULT '18:00:00',
    modus ENUM('random', 'seeded') NOT NULL DEFAULT 'seeded',
    bestaetigungs_code VARCHAR(50) DEFAULT NULL,
    email_benachrichtigung BOOLEAN DEFAULT TRUE,
    smtp_host VARCHAR(255) DEFAULT NULL,
    smtp_port INT DEFAULT 587,
    smtp_user VARCHAR(255) DEFAULT NULL,
    smtp_pass VARCHAR(255) DEFAULT NULL,
    smtp_sender VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    aktiv BOOLEAN DEFAULT TRUE
);

-- Turnier-Teams (Anmeldungen zum Turnier)
CREATE TABLE IF NOT EXISTS turnier_teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    ansprechpartner VARCHAR(255),
    email VARCHAR(255),
    telefon VARCHAR(50),
    verein VARCHAR(255),
    klasse ENUM('A', 'B', 'C', 'D', 'E') DEFAULT 'A',
    setzposition INT DEFAULT 0,
    status ENUM('angemeldet', 'bestaetigt', 'abgemeldet', 'disqualifiziert') DEFAULT 'angemeldet',
    teilnehmerzahl INT DEFAULT 2,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    INDEX idx_turnier_teams (turnier_id, klasse)
);

-- Spielfelder
CREATE TABLE IF NOT EXISTS turnier_felder (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    feld_nummer INT NOT NULL,
    feld_name VARCHAR(100),
    aktiv BOOLEAN DEFAULT TRUE,
    blockiert_von DATETIME DEFAULT NULL,
    blockiert_bis DATETIME DEFAULT NULL,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    UNIQUE KEY unique_feld (turnier_id, feld_nummer)
);

-- Turnierphasen (Plan A, A1, A2, B1, B2, C1, C2, D, etc.)
CREATE TABLE IF NOT EXISTS turnier_phasen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    phase_name VARCHAR(50) NOT NULL,
    phase_typ ENUM('hauptrunde', 'gewinner', 'verlierer', 'finale', 'trostrunde') NOT NULL,
    reihenfolge INT NOT NULL DEFAULT 0,
    eltern_phase_id INT DEFAULT NULL,
    beschreibung VARCHAR(255),
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    FOREIGN KEY (eltern_phase_id) REFERENCES turnier_phasen(id) ON DELETE SET NULL,
    UNIQUE KEY unique_phase (turnier_id, phase_name)
);

-- Spiele / Begegnungen
CREATE TABLE IF NOT EXISTS turnier_spiele (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    phase_id INT NOT NULL,
    runde INT NOT NULL DEFAULT 1,
    spiel_nummer INT NOT NULL,
    team1_id INT DEFAULT NULL,
    team2_id INT DEFAULT NULL,
    feld_id INT DEFAULT NULL,
    geplante_zeit DATETIME DEFAULT NULL,
    tatsaechliche_startzeit DATETIME DEFAULT NULL,
    tatsaechliche_endzeit DATETIME DEFAULT NULL,
    ergebnis_team1 INT DEFAULT NULL,
    ergebnis_team2 INT DEFAULT NULL,
    satz1_team1 INT DEFAULT NULL,
    satz1_team2 INT DEFAULT NULL,
    satz2_team1 INT DEFAULT NULL,
    satz2_team2 INT DEFAULT NULL,
    satz3_team1 INT DEFAULT NULL,
    satz3_team2 INT DEFAULT NULL,
    gewinner_id INT DEFAULT NULL,
    verlierer_id INT DEFAULT NULL,
    status ENUM('geplant', 'bereit', 'laeuft', 'beendet', 'abgesagt', 'wartend_bestaetigung') DEFAULT 'geplant',
    naechstes_spiel_gewinner_id INT DEFAULT NULL,
    naechstes_spiel_verlierer_id INT DEFAULT NULL,
    schiedsrichter_name VARCHAR(255) DEFAULT NULL,
    bestaetigungs_code VARCHAR(50) DEFAULT NULL,
    bestaetigt_von_verlierer BOOLEAN DEFAULT FALSE,
    bestaetigt_zeit DATETIME DEFAULT NULL,
    bemerkung TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    FOREIGN KEY (phase_id) REFERENCES turnier_phasen(id) ON DELETE CASCADE,
    FOREIGN KEY (team1_id) REFERENCES turnier_teams(id) ON DELETE SET NULL,
    FOREIGN KEY (team2_id) REFERENCES turnier_teams(id) ON DELETE SET NULL,
    FOREIGN KEY (feld_id) REFERENCES turnier_felder(id) ON DELETE SET NULL,
    FOREIGN KEY (gewinner_id) REFERENCES turnier_teams(id) ON DELETE SET NULL,
    FOREIGN KEY (verlierer_id) REFERENCES turnier_teams(id) ON DELETE SET NULL,
    INDEX idx_turnier_spiele (turnier_id, phase_id, runde),
    INDEX idx_spiel_status (turnier_id, status),
    INDEX idx_spiel_zeit (turnier_id, geplante_zeit)
);

-- Gemeldete Ergebnisse (zur Überprüfung)
CREATE TABLE IF NOT EXISTS turnier_ergebnis_meldungen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spiel_id INT NOT NULL,
    gemeldet_von ENUM('schiedsrichter', 'team1', 'team2', 'admin') NOT NULL,
    melder_name VARCHAR(255),
    melder_email VARCHAR(255),
    ergebnis_team1 INT NOT NULL,
    ergebnis_team2 INT NOT NULL,
    satz1_team1 INT DEFAULT NULL,
    satz1_team2 INT DEFAULT NULL,
    satz2_team1 INT DEFAULT NULL,
    satz2_team2 INT DEFAULT NULL,
    satz3_team1 INT DEFAULT NULL,
    satz3_team2 INT DEFAULT NULL,
    bestaetigungs_code_eingabe VARCHAR(50) DEFAULT NULL,
    status ENUM('gemeldet', 'bestaetigt', 'abgelehnt', 'ueberschrieben') DEFAULT 'gemeldet',
    geprueft_von VARCHAR(255) DEFAULT NULL,
    geprueft_zeit DATETIME DEFAULT NULL,
    bemerkung TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (spiel_id) REFERENCES turnier_spiele(id) ON DELETE CASCADE,
    INDEX idx_meldung_status (spiel_id, status)
);

-- Zwischenplatzierung (nach x Runden)
CREATE TABLE IF NOT EXISTS turnier_zwischenstand (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    team_id INT NOT NULL,
    nach_runde INT NOT NULL,
    platzierung INT NOT NULL,
    siege INT DEFAULT 0,
    niederlagen INT DEFAULT 0,
    punkte_dafuer INT DEFAULT 0,
    punkte_dagegen INT DEFAULT 0,
    punkt_differenz INT DEFAULT 0,
    saetze_gewonnen INT DEFAULT 0,
    saetze_verloren INT DEFAULT 0,
    satz_differenz INT DEFAULT 0,
    direkte_vergleich_punkte INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES turnier_teams(id) ON DELETE CASCADE,
    UNIQUE KEY unique_zwischenstand (turnier_id, team_id, nach_runde),
    INDEX idx_platzierung (turnier_id, nach_runde, platzierung)
);

-- Endplatzierung
CREATE TABLE IF NOT EXISTS turnier_endplatzierung (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    team_id INT NOT NULL,
    endplatzierung INT NOT NULL,
    klasse_endplatzierung VARCHAR(10) DEFAULT NULL,
    siege INT DEFAULT 0,
    niederlagen INT DEFAULT 0,
    punkte_dafuer INT DEFAULT 0,
    punkte_dagegen INT DEFAULT 0,
    bemerkung TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES turnier_teams(id) ON DELETE CASCADE,
    UNIQUE KEY unique_endplatzierung (turnier_id, team_id),
    INDEX idx_endplatzierung (turnier_id, endplatzierung)
);

-- E-Mail Benachrichtigungen Log
CREATE TABLE IF NOT EXISTS turnier_email_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    team_id INT DEFAULT NULL,
    spiel_id INT DEFAULT NULL,
    email_typ ENUM('spielankuendigung', 'ergebnis', 'platzierung', 'erinnerung', 'sonstiges') NOT NULL,
    empfaenger_email VARCHAR(255) NOT NULL,
    betreff VARCHAR(255) NOT NULL,
    nachricht TEXT NOT NULL,
    gesendet_zeit DATETIME DEFAULT CURRENT_TIMESTAMP,
    erfolgreich BOOLEAN DEFAULT FALSE,
    fehler_nachricht TEXT DEFAULT NULL,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES turnier_teams(id) ON DELETE SET NULL,
    FOREIGN KEY (spiel_id) REFERENCES turnier_spiele(id) ON DELETE SET NULL
);

-- Audit Log für Änderungen
CREATE TABLE IF NOT EXISTS turnier_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    benutzer VARCHAR(255) DEFAULT 'system',
    aktion VARCHAR(100) NOT NULL,
    tabelle VARCHAR(100),
    datensatz_id INT,
    alte_werte JSON DEFAULT NULL,
    neue_werte JSON DEFAULT NULL,
    ip_adresse VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    INDEX idx_audit_zeit (turnier_id, created_at)
);

-- Standard-Phasen für ein 32er-Turnier einfügen (Beispiel)
-- Diese werden bei Turniererstellung automatisch generiert
