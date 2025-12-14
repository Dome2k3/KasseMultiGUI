# Fix für Journal-Fehler im Turnier-System

## Zusammenfassung der behobenen Fehler

Dieser Fix behebt drei kritische Fehler, die in den systemd-Logs aufgetreten sind:

### 1. SQL-Syntaxfehler: `NULLS LAST` nicht unterstützt in MariaDB

**Problem:** 
```
Error: You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'LIMIT 1' at line 19
```

**Ursache:** 
MariaDB unterstützt die PostgreSQL-Syntax `NULLS LAST` nicht.

**Lösung:**
Die ORDER BY-Klausel wurde geändert von:
```sql
ORDER BY waiting_games_count ASC, last_game_time DESC NULLS LAST, RAND()
```
zu:
```sql
ORDER BY waiting_games_count ASC, last_game_time IS NULL, last_game_time DESC, RAND()
```

In MariaDB sortiert `last_game_time IS NULL` NULL-Werte ans Ende (0 für nicht-NULL, 1 für NULL).

### 2. Fehlende Spalte `spiel_id` in der Tabelle `team_opponents`

**Problem:**
```
Error: Unknown column 'spiel_id' in 'INSERT INTO'
sqlMessage: "Unknown column 'spiel_id' in 'INSERT INTO'"
```

**Ursache:**
Die `spiel_id`-Spalte wurde im SQL-Schema definiert, aber die bestehende Datenbank wurde nicht migriert.

**Lösung:**
Eine neue Migrationsdatei wurde erstellt: `MIGRATION-Add-Spiel-ID-Team-Opponents.sql`

**Um diesen Fix anzuwenden, führen Sie die Migration aus:**
```bash
mysql -u [username] -p [database_name] < /var/www/html/kasse/turnier/MIGRATION-Add-Spiel-ID-Team-Opponents.sql
```

### 3. ValidationError: X-Forwarded-For Header ohne Trust Proxy

**Problem:**
```
ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false (default).
code: 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR'
```

**Ursache:**
Die Anwendung läuft hinter einem Reverse Proxy (nginx), aber Express war nicht konfiguriert, dem Proxy zu vertrauen.

**Lösung:**
Die folgende Zeile wurde zu `turnier.js` hinzugefügt:
```javascript
app.set('trust proxy', 1);
```

Dies ermöglicht es `express-rate-limit`, die echten Client-IPs aus dem X-Forwarded-For-Header korrekt zu identifizieren.

## Installation

### 1. Code aktualisieren
```bash
cd /var/www/html/kasse/turnier
git pull
```

### 2. Migration ausführen (nur einmal nötig)
```bash
mysql -u your_mysql_user -p your_database_name < MIGRATION-Add-Spiel-ID-Team-Opponents.sql
```

### 3. Service neu starten
```bash
sudo systemctl restart turnier
```

### 4. Überprüfen, ob die Fehler behoben sind
```bash
sudo journalctl -u turnier -n 50 --follow
```

## Erwartetes Ergebnis

Nach Anwendung dieser Fixes sollten folgende Fehler nicht mehr auftreten:
- ✅ Keine SQL-Syntaxfehler mehr mit "LIMIT 1' at line 19"
- ✅ Keine "Unknown column 'spiel_id'" Fehler mehr
- ✅ Keine ValidationError bzgl. X-Forwarded-For mehr

## Hinweise

- Die Migration ist idempotent - sie kann mehrfach ausgeführt werden ohne Probleme
- Die `trust proxy`-Einstellung ist sicher, da sie nur den ersten Proxy vertraut
- Alle Fixes sind rückwärtskompatibel
