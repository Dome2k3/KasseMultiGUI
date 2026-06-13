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
