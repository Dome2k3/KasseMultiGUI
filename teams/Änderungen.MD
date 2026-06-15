# Aenderungen Teams

## 2026-06-13

- Die Teams-Seite wurde optisch an die Kommunikationsseite angelehnt: Topbar, Hero-Bereich, KPI-Kacheln, Panels, Filter und eine breitere Teamuebersicht.
- Der Google-Sheet-Import ist jetzt konfigurierbar:
  - `teams-config.json` speichert Spreadsheet-ID, Tabellenblatt, Startzeile und optionale Endzeile.
  - Neue Endpunkte: `GET /import-config` und `PUT /import-config`.
  - Der Import-Button speichert die angezeigte Konfiguration und importiert danach mit diesen Werten.
- Der Import liest jetzt `A:W` statt nur `G:J`.
- Aus dem Google Sheet werden zusaetzlich importiert:
  - Spalte W als `bezahlstatus` und boolean `bezahlt`.
  - Spalten M bis P als Level:
    - M = Hobby
    - N = Wir geben alles
    - O = Wir aergern die Starken
    - P = Wir rocken das (Besten)
  - Spalte H wird zusaetzlich als `melder_vorname` fuer Mailanreden ausgewertet.
  - Nachruecker/Wartelisten-Eintraege werden aus Spalte A erkannt.
- Der Import ergaenzt fehlende Datenbankspalten automatisch:
  - `sheet_row`
  - `original_nummer`
  - `melder_vorname`
  - `bezahlstatus`
  - `bezahlt`
  - `level`
  - `warteliste`
- In der Teamuebersicht sind Zahlung, Level, Status, Melder, E-Mail, Sheet-Zeile und Teilnehmerzahl sichtbar.
- Das Nachruecker-Management beruecksichtigt den Zahlungsstatus:
  - Als naechster Nachruecker werden nur bezahlte Wartelisten-Teams vorgeschlagen.
  - Ein nicht bezahlter Nachruecker kann serverseitig nicht versehentlich fest eingetragen werden.
- Neue Abmelde-Funktion im Teams-Dashboard:
  - Team abmelden.
  - Optional naechsten bezahlten Nachruecker fest eintragen.
  - Vorgang wird als Transaktion gespeichert.
- Neue Mailentwuerfe:
  - Abmelde-Mail an das abgemeldete Team.
  - Nachruecker-Mail ohne Zahlungsinformationen.
  - Bereitschaftsanfrage an eine frei waehlbare Anzahl bezahlter Nachruecker.
  - Mails werden als `mailto:`-Entwuerfe im Standard-Mailprogramm geoeffnet.

## 2026-06-15

- Render-Fix fuer die Teams-Seite:
  - `server.js` liefert statische Dateien jetzt ueber `express.static(__dirname)` aus.
  - Die Teams-API bleibt vor der statischen Auslieferung gemountet, damit `/teams` JSON liefert und `/teams/teams.html` die HTML-Seite.
  - Der Hauptserver nutzt jetzt `mysql.createPool()` statt `mysql.createConnection()`, damit ein DB-Verbindungsfehler den Prozess beim Start nicht sofort beendet.
  - `package.json` enthaelt jetzt den `start`-Befehl fuer Render und die benoetigten Dependencies fuer Server, Teams-Import und Google Sheets.
  - Die Teams-Seite nutzt jetzt standardmaessig den API-Namespace `/teams/api`, damit `/teams/teams.html` und die API-Endpunkte nicht miteinander kollidieren.
  - Die bisherigen Root-Endpunkte bleiben als Fallback gemountet.
  - `importTeams.js` laedt `googleapis` erst beim Import. Dadurch startet `kasse.service`/`teams.service` auch dann, wenn das Modul auf dem Server fehlt.
  - `teams/package.json` enthaelt jetzt die Standalone-Dependencies fuer den Teams-Service.
