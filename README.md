# BVT KasseMultiGUI

Web-App-Sammlung fuer das Bergstraesser Volleyball-Turnier (BVT). Das Projekt umfasst Kasse, Lager, Statistik, Teamverwaltung, Helferplanung, Turnierverwaltung, Kommunikation und Helferessen-Bestellungen.

Die Anwendung ist historisch gewachsen und besteht aus mehreren Frontends mit eigenen JavaScript-Dateien sowie mehreren Node/Express-Backends. Der Hauptserver liefert die klassischen Kassen-Seiten und bindet Teile der Teams- und Helferessen-API ein. Helferplan, Turnier und Teams koennen zusaetzlich als eigene Services laufen.

## Hauptfunktionen

### Kasse und Verkauf

- Verkaufsoberflaechen fuer Essen, Fruehstueck, Bierzelt, Pfand und weitere Bereiche.
- Produkte werden aus der Datenbank geladen und nach GUI/Kategorie gefiltert.
- Bonabschluss speichert Bons und Bonpositionen in MySQL.
- Kassenbon- und Kuechenbondruck ueber CUPS/`lp`.
- Automatische Bon-Rufnamen aus einer Keyword-Liste.
- Bonuebersicht und aktuelle Bons.
- Umsatzstatistik mit Mailversand.
- Lagerverwaltung und Gebinde-Konfiguration.
- Staffelpreise und Konfigurationsseiten fuer Gebinde/Produkte.

Wichtige Seiten:

- `index.html` - Startseite / Hauptnavigation
- `essen.html`, `fruehstueck.html`, `bierzelt.html`, `pfand.html` - Verkaufsoberflaechen
- `bons.html` - Bonuebersicht
- `statistik_sql.html` - Statistik
- `lager.html` - Lagerverwaltung
- `config_gebinde.html` - Gebinde-Konfiguration

### Teams

Die Teams-App verwaltet Anmeldungen, Warteliste/Nachruecker und Mailentwuerfe.

- Google-Sheet-Import mit konfigurierbarer Spreadsheet-ID, Tabellenblatt, Startzeile und optionaler Endzeile.
- Import aus `A:W` inklusive Zahlungsstatus, Level, Melder, Mailadresse, Telefonnummer, Teilnehmerzahl, Warteliste und Abmelde-/Ersatzteam-Informationen.
- Automatische Datenbank-Migration fuer fehlende Spalten.
- Teamuebersicht mit KPI-Kacheln, Filtern, einklappbarer Teamliste und separater Wartelisten-Tabelle.
- Zahlungslogik: bezahlte regulaere Teams werden automatisch als angemeldet importiert; Zahlung gilt ab 90 EUR als bezahlt.
- Nachruecker-Management mit Statuswerten `offen`, `angefragt`, `positive`, `abgemeldet`.
- Abmeldefunktion mit optionaler Uebernahme eines bezahlten Nachrueckers.
- Mailto-Entwuerfe fuer Abmeldung, Nachruecker, Bereitschaftsanfrage und Zahlungshinweise.
- WhatsApp-Link mit vorbereitetem Rueckfrage-Text fuer Nachruecker.

Wichtige Dateien:

- `teams/teams.html` - Teams-Dashboard
- `teams/teams.js` - Teams-API
- `teams/importTeams.js` - Google-Sheet-Import
- `teams/teams-config.json` - Import-Konfiguration
- `teams/teams.service` - systemd-Service-Beispiel fuer Port 3002

### Helferplan

Der Helferplan ist ein eigenes Modul fuer Helfer, Schichten, Auf-/Abbau, Kuchen, Statistik und Audit-Log.

- Team- und Helferverwaltung mit Rollen.
- Helfer bearbeiten, Live-Suche, Team-/Rollenfilter und Feld `abwesend`.
- Abwesende Helfer werden in Statistik und Listen markiert.
- Turnier-Schichtplanung mit Timeline, Teamfarben, sticky Headers und klickbaren Team-Farbbadges zum Filtern.
- Admin-Ansicht fuer Aktivitaeten, Schichten und erlaubte Zeitbloecke.
- Auf-/Abbau-Planung mit bis zu drei Aufbau- und zwei Abbau-Tagen, Pflichtslots fuer Erwachsene/Orga und automatischer Speicherung.
- Kuchenverwaltung fuer Freitag, Samstag und Sonntag inklusive Kuchenname und Nuss-Hinweis.
- Statistik mit KPI-Cards, offenen Schichten, Gesamt-Schichten getrennt nach Turnier und Auf-/Abbau, Teamgruppen, Sortierung und einklappbaren Teams.
- PDF-Exporte fuer Plaene, Helferlisten, Statistik, Admins/Editoren und teamgefilterte Ansichten.
- Changelog/Audit-Log mit lesbaren Namen statt reinen IDs.
- Authentifizierung mit Sessions, Rollen und Rate-Limiting.

Wichtige Seiten:

- `helferplan/public/index.html` - Admin/Stammdaten und PDF-Export
- `helferplan/public/plan.html` - Turnier-Helferplanung
- `helferplan/public/plan-admin.html` - Aktivitaeten und Schichten administrieren
- `helferplan/public/aufbau-abbau.html` - Aufbau-/Abbauplanung
- `helferplan/public/kuchen.html` - Kuchenplanung
- `helferplan/public/helper-add.html` - Helfer verwalten
- `helferplan/public/statistik.html` - Statistik
- `helferplan/public/changelog.html` - Aenderungsprotokoll

### Turnierverwaltung

Die Turnierverwaltung bildet Beachvolleyball-Turniere mit verschiedenen Modi ab.

- Turniere anlegen und Modus direkt auswaehlen.
- Modi: gesetzt, zufaellig, Swiss und Swiss 144.
- Persistente Turnierauswahl im Browser.
- Teams und Platzierung verwalten.
- Spielverwaltung mit Statusfluss `wartend` -> `bereit` -> `laeuft` -> `beendet`.
- Feldzuweisung und automatische Nachrueckung wartender Spiele auf freie Felder.
- Ergebnis-Eingabe durch Turnierleitung mit Bemerkung.
- Schiedsrichter-Teams verwalten oder freie spielende Teams als Schiedsrichter verwenden.
- Vorschau der naechsten Spiele.
- Swiss-Standings mit Punkten, Buchholz und Seed-Tiebreaker.
- Mobile Schiedsrichter-Ansicht.

Swiss 144:

- Ausgelegt fuer bis zu 144 Teams.
- 32 Bundesliga-/Klasse-A-Teams, 80 regulaere Teams und 32 Hobby-/Klasse-D-Teams.
- Qualifikationsrunde fuer Hobby-Teams.
- Hauptfeld mit 128 Teams und sieben Swiss-Runden.
- Rematch-Vermeidung ueber Gegnerhistorie.
- Validierung beim Start, ob ausreichend Klasse-A- und Klasse-D-Teams vorhanden sind.

Wichtige Dateien:

- `turnier/turnier.js` - API und Turnierlogik
- `turnier/swiss-pairing.js` - Swiss-Pairing-Engine
- `turnier/public/index.html` - Admin-Oberflaeche
- `turnier/public/bracket.html` und `turnier/public/bracket-tree.html` - Turnierbaum-Ansichten
- `turnier/public/schiedsrichter.html` - mobile Schiedsrichteransicht
- `turnier/SQL-Setup-Turnier.sql` - Datenbankschema
- `turnier/SWISS_SYSTEM_README.md` - Detaildoku fuer Swiss/Swiss 144

### Kommunikation

Die Kommunikationszentrale ist ein Planungsdashboard fuer Mails und Meilensteine rund um das BVT.

- Dashboard mit KPIs, Gantt-Chart, Mail-/Meilensteinliste und QS-Vorschau.
- Eintraege fuer Mails oder organisatorische Meilensteine.
- Eventdaten, Meta-Mail, Empfaenger, Versanddatum, Text und Status pro Mail.
- QS-Ablauf: Mail wird zuerst an die Meta-Mail vorbereitet; echte Empfaenger sind fuer Weiterleitung vorbereitet.
- Bestehende Eintraege bearbeiten.
- Komplettes Jahr aus einem bestehenden Event kopieren; Termine werden relativ zum neuen Event-Freitag verschoben.
- Erinnerungsblock fuer faellige Eintraege.
- Server kann regelmaessig Erinnerungsmails versenden.

Wichtige Dateien:

- `Kommunikation/index.html` - Dashboard
- `Kommunikation/kommunikation.js` - Frontend-Logik
- `Kommunikation/SQL-Kommunikation.sql` - Tabellen
- `Kommunikation/server-routes.example.js` - Beispielrouten

### Helferessen-Bestellung

Kleine Unter-App fuer Essensbestellungen an Aufbau- und Abbautagen.

- Admin-Seite zum Anlegen von Tagen/Planungen.
- Optionen fuer Partypizza/Doener und Eis aktivierbar.
- QR-Code und oeffentlicher Link fuer die Bestellung.
- Oeffentliche Bestellseite ohne Passwort.
- Auswahl: Salami, Schinken, Vegetarisch, Pizzadoener, Doener oder Pommes.
- Doener-Zusatzoptionen: ohne Zwiebeln und Falafel.
- Optional Eis, wenn fuer den Tag aktiviert.
- Bestehende Eintraege anzeigen und per Bestaetigung loeschen.
- Zusammenfassung fuer Bestellung und WhatsApp.
- API legt `helferessen_events` und `helferessen_orders` automatisch an.

Wichtige Dateien:

- `HelferessenBestellung/index.html` - Admin-Seite
- `HelferessenBestellung/bestellung.html` - oeffentliche Bestellseite
- `HelferessenBestellung/helferessen.js` - API

## Projektstruktur

```text
.
├── server.js                         # Hauptserver fuer Kasse, Kommunikation, Teams-Mount, Helferessen
├── config.js                         # Frontend-API-URLs fuer Produktion/lokal
├── package.json                      # Hauptserver-Dependencies
├── kasse.service                     # systemd-Service fuer Hauptserver
├── HelferessenBestellung/            # Helferessen-App
├── Kommunikation/                    # Kommunikationsplanung
├── helferplan/                       # Helferplan-Service und Frontend
├── teams/                            # Teamverwaltung und Google-Sheet-Import
├── turnier/                          # Turnierverwaltung
├── *.html / *.js / *.css             # Kassen- und Verwaltungsseiten im Hauptordner
└── SQL-/Migration-Dateien            # Datenbank-Setups und Migrationen
```

## Start und Betrieb

### Voraussetzungen

- Node.js
- MySQL/MariaDB
- CUPS/`lp`, wenn Bons gedruckt werden sollen
- Google-Service-Account, wenn der Teams-Import aus Google Sheets genutzt wird
- Optional: systemd fuer den Produktionsbetrieb auf dem Raspberry Pi/Server

### Hauptserver lokal starten

```bash
npm install
npm start
```

Der Hauptserver verwendet standardmaessig Port `3000`:

```text
http://localhost:3000
```

### Separate Module starten

Helferplan:

```bash
cd helferplan
npm install
npm start
```

Turnierverwaltung:

```bash
cd turnier
npm install
npm start
```

Teams standalone:

```bash
cd teams
npm install
node teams.js
```

### Produktion mit systemd

Im Repository liegen Service-Beispiele:

- `kasse.service` startet `/var/www/html/kasse/server.js` auf Port 3000.
- `teams/teams.service` startet `/var/www/html/kasse/teams/teams.js` auf Port 3002.

Nach Codeaenderungen an Backend-Dateien muss der jeweilige Node-Prozess neu gestartet werden, z.B.:

```bash
sudo systemctl restart kasse
sudo systemctl status kasse
```

Bei reinen HTML/CSS/Frontend-JS-Aenderungen reicht meistens ein Browser-Reload, sofern keine Backend-Logik geaendert wurde.

## Konfiguration

### Frontend-API-URLs

`config.js` setzt die API-Ziele fuer die Browser-Frontends:

- `window.API_URL` - Hauptserver/Kasse
- `window.API_URL_TEAMS` - Teams-API
- `window.API_URL_HELFERESSEN` - Helferessen-API
- `window.API_URL_HELFERPLAN` - Helferplan-API
- `window.API_URL_TURNIER` - Turnier-API

Fuer lokale Entwicklung koennen die lokalen URLs in `config.js` wieder aktiviert werden.

### Umgebungsvariablen

Der Hauptserver laedt `Umgebung.env` aus dem Projektordner oder aus `/var/www/html/kasse/Umgebung.env`.

Typische Werte:

```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_DATABASE=...
PRINTER_NAME=TM-T20III
KOMM_REMINDER_ENABLED=true
```

Je nach Modul koennen weitere Variablen fuer Mailversand, Authentifizierung, Google-Service-Account und CORS erforderlich sein. Siehe dazu die jeweiligen Moduldateien und Unterordner-Dokumentationen.

## Wichtige API-Bereiche

Hauptserver:

- `GET /items` - Produkte nach GUI laden
- `POST /finalize-bon` - Bon speichern und drucken
- `POST /print` - Bon drucken
- `GET /statistics` - Statistikdaten
- `GET /bons` und `GET /recent-bons` - Bons abrufen
- `GET/POST/PUT/DELETE /lager` - Lager
- `GET/POST/PUT/DELETE /config-gebinde` - Gebinde-Konfiguration
- `/kommunikation/api/...` - Kommunikationseintraege, Status und Jahr kopieren

Gemountete APIs:

- `/teams/api/...` - Teams-Dashboard und Import
- `/HelferessenBestellung/api/...` - Helferessen-Bestellungen

Separate Services:

- Helferplan: eigene API im Ordner `helferplan/`
- Turnier: eigene API im Ordner `turnier/`

## Datenbank

Das Projekt nutzt MySQL/MariaDB. Einige Module legen Tabellen oder fehlende Spalten beim Start automatisch an bzw. migrieren sie:

- Helferessen erstellt `helferessen_events` und `helferessen_orders`.
- Teams ergaenzt benoetigte Spalten fuer Import, Zahlungsstatus, Warteliste und Nachruecker.
- Helferplan erstellt/erweitert Tabellen fuer Helfer, Schichten, Auf-/Abbau, Kuchen, Settings, Auth und Audit-Log.
- Turnier bringt SQL-Setup- und Migrationsdateien im Ordner `turnier/` mit.
- Kommunikation bringt `Kommunikation/SQL-Kommunikation.sql` mit.

Vor produktiven Migrationen immer ein Datenbank-Backup erstellen.

## Tests und Checks

Aktuell gibt es nur punktuelle Tests:

```bash
cd helferplan
npm test
```

Fuer die meisten Module erfolgt die Pruefung manuell im Browser:

- Hauptnavigation oeffnen
- API-Ziele aus `config.js` pruefen
- Speichern/Laden in der jeweiligen Maske testen
- Bei Backend-Aenderungen Service neu starten
- Logs per `journalctl` oder Server-Konsole kontrollieren

## Nuetzliche Logs

Bei systemd-Betrieb:

```bash
sudo journalctl -u kasse -f
sudo journalctl -u teams -f
```

Wenn weitere Services fuer Helferplan oder Turnier eingerichtet sind, analog mit deren Service-Namen.

## Weiterfuehrende Dokumentation

- `teams/Änderungen.MD`
- `HelferessenBestellung/Änderungen.MD`
- `helferplan/ÄNDERUNGEN.md`
- `helferplan/AUTH_README.md`
- `turnier/QUICK-START.md`
- `turnier/SWISS_SYSTEM_README.md`
- `Kommunikation/README.md`

## Offene Punkte

- Beim Bonabschluss Bar/Karte sauber abfragen.
- Bon-Buttons weiter optimieren/verkleinern.
- Kommunikation optional weiter ausbauen: Kontakte/Behoerden als eigene Tabelle, Vier-Augen-Freigabe, Anhaenge und finaler Direktversand nach Freigabe.
