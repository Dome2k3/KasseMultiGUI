# Helferplan Änderungen - Dokumentation

## Übersicht der Implementierung

Alle geforderten Änderungen aus dem Anforderungsdokument wurden erfolgreich implementiert.

## 1. Layout-Verbesserungen

### 1.1 plan.html
- **Linkes Panel nach oben verschoben**: Das linke Panel mit Teams und Helfern ist jetzt sticky positioniert (bleibt beim Scrollen oben), damit im Landscape-Modus mehr von der Zeitleiste sichtbar ist
- **Sticky Headers**: Schichtnamen und Aktivitätsüberschriften (z.B. "Getränke", "Zapfen 1") bleiben beim horizontalen Scrollen sichtbar

### 1.2 plan-admin.html
- **Sticky Headers**: Aktivitätsüberschriften bleiben beim horizontalen Scrollen sichtbar
- **Linkes Panel ausgeblendet**: Das linke Panel mit Aktivitäten wurde ausgeblendet, da die Swimlanes ausreichend Informationen bieten

## 2. Neue HTML-Seiten

### 2.1 aufbau-abbau.html
Vollständige Verwaltung der Auf- und Abbautage:
- Bis zu 3 Aufbautage und 1 Abbautag konfigurierbar
- Für jeden Tag können bis zu 40 Helfer eingeteilt werden
- Die ersten Slots (orange markiert) sind für Erwachsene/Orga-Helfer reserviert (Mindestanzahl konfigurierbar)
- 4-Stunden-Schichten
- Dropdown-Auswahl für Helfer aus der Helferliste
- Automatische Filterung: Pflicht-Slots zeigen nur Erwachsene/Orga-Helfer
- Visuelle Rückmeldung bei besetzten Slots (grüne Markierung)

### 2.2 kuchen.html
Verwaltung der Kuchenspenden:
- Pro Turniertag (Freitag, Samstag, Sonntag) können mehrere Kuchen erfasst werden
- Anzahl der benötigten Kuchen pro Tag wird in den Admin-Einstellungen festgelegt
- Für jeden Kuchen:
  - Helfer-Auswahl aus der Helferliste
  - Eingabefeld für Kuchenname
  - Checkbox für "Enthält Nüsse"
  - Lösch-Button zum Entfernen
- Drei vertikale Spalten für die drei Turniertage
- Visuelle Markierung befüllter Einträge

## 3. Admin-Seite Erweiterungen (index.html)

### 3.1 Neue Einstellungs-Sektionen

#### Turniertage (bestehendes Feature, verbessert)
- Freitag, Samstag, Sonntag Datumsauswahl

#### Auf- und Abbau Einstellungen (NEU)
- Aufbau Tag 1-3: Datumsauswahl + Mindestanzahl Erwachsene/Orga (0-40)
- Abbau Tag 1: Datumsauswahl + Mindestanzahl Erwachsene/Orga (0-40)
- Separate Speicher-Funktion

#### Kuchen-Anzahl pro Turniertag (NEU)
- Freitag: Anzahl benötigter Kuchen (Standardwert: 10)
- Samstag: Anzahl benötigter Kuchen (Standardwert: 12)
- Sonntag: Anzahl benötigter Kuchen (Standardwert: 4)
- Separate Speicher-Funktion

### 3.2 Navigation
Alle Seiten haben nun eine einheitliche Navigation:
- Admin: Stammdaten
- Turnier-Planung
- Turnier-Admin
- Auf-/Abbau
- Kuchen

## 4. Backend API-Erweiterungen

### 4.1 Setup/Cleanup Shifts Endpoints
```
GET  /api/setup-cleanup-shifts       - Alle Auf-/Abbau-Schichten abrufen
POST /api/setup-cleanup-shifts       - Schicht erstellen/aktualisieren
DELETE /api/setup-cleanup-shifts/:id - Schicht leeren (helper_id = NULL)
```

### 4.2 Cakes Endpoints
```
GET  /api/cakes       - Alle Kuchenspenden abrufen
POST /api/cakes       - Kuchenspende erstellen/aktualisieren
DELETE /api/cakes/:id - Kuchenspende löschen
```

### 4.3 Datenbank-Tabellen
Die folgenden Tabellen werden beim Server-Start automatisch erstellt, falls nicht vorhanden:

#### helferplan_setup_cleanup_shifts
- id (INT, PK, Auto-Increment)
- day_type (ENUM: 'Aufbau', 'Abbau')
- start_time (DATETIME)
- end_time (DATETIME)
- helper_id (INT, FK zu helpers, NULL erlaubt)

#### helferplan_cakes
- id (INT, PK, Auto-Increment)
- donation_day (ENUM: 'Freitag', 'Samstag', 'Sonntag')
- helper_id (INT, FK zu helpers, NULL erlaubt)
- cake_type (VARCHAR(100))
- contains_nuts (TINYINT(1), Default: 0)

## 5. Technische Details

### 5.1 Verwendete Patterns
- Alle neuen Seiten folgen dem gleichen Pattern wie plan.html
- Verwendung von Dropdown-Selects für Helfer-Auswahl
- Konsistente API-Nutzung (fetch mit API_URL)
- Settings werden zentral über /api/settings verwaltet
- Gut annotierter Code mit deutschen Kommentaren

### 5.2 Styling
- Konsistentes Design mit bestehendem System
- Responsive Layout
- Farbliche Kennzeichnung:
  - Orange: Pflicht-Slots (Erwachsen/Orga erforderlich)
  - Grün: Befüllte Slots
  - Standard: Noch zu befüllende Slots
- Navigation mit aktiver Seiten-Markierung

### 5.3 Dependencies
- package.json aktualisiert: mysql2 statt mariadb (passend zum Code)
- Alle JavaScript-Dateien validiert (keine Syntax-Fehler)

## 6. Verwendung

### 6.1 Einrichtung
1. Admin-Seite (index.html) öffnen
2. Turniertage festlegen (Freitag, Samstag, Sonntag)
3. Auf-/Abbau-Tage und Mindesthelfer konfigurieren
4. Kuchen-Anzahl pro Tag festlegen

### 6.2 Auf-/Abbau Planung
1. Seite "Auf-/Abbau" öffnen
2. Für jeden Tag werden automatisch Slots generiert (basierend auf Einstellungen)
3. Helfer über Dropdown auswählen
4. Automatische Speicherung bei Auswahl

### 6.3 Kuchen-Planung
1. Seite "Kuchen" öffnen
2. Für jeden Tag werden Zeilen generiert (basierend auf Einstellungen)
3. Helfer auswählen, Kuchenname eintragen, Nüsse-Option setzen
4. Automatische Speicherung nach Änderungen
5. Optional: Einträge über "Kuchen entfernen" löschen

## 7. Bugfix: Zeitblock-Validierung (Dezember 2024)

### Problem
Nach dem Neuanlegen von Aktivitäten und Schichten sowie der Konfiguration von erlaubten Zeitblöcken über plan-admin.html konnten keine Helfer zugewiesen werden. Der Fehler "Die ausgewählte Zeit liegt außerhalb der zulässigen Schichtblöcke." trat immer auf, auch wenn die Zeitblöcke korrekt konfiguriert waren.

### Ursache
Die Backend-Validierung in `helferplan.js` (POST /api/tournament-shifts) behandelte Stunden-Indizes fälschlicherweise als Date-Objekte:
- Die `allowed_time_blocks` werden als Stunden-Indizes gespeichert (z.B., `{start: 2, end: 6}` bedeutet Stunde 2 bis Stunde 6)
- Der Code versuchte, Date-Objekte direkt aus diesen Zahlen zu erstellen: `new Date(block.start)`
- Dies führte zu ungültigen Datumsberechnungen und die Validierung schlug immer fehl

### Lösung
Die Zeitblock-Validierung wurde korrigiert, um Stunden-Indizes korrekt zu verarbeiten:
1. Event-Startdatum wird aus den Settings abgerufen (event_friday, Standardwert: 2024-07-19)
2. Event-Start wird als Freitag 12:00 UTC berechnet
3. Der Stunden-Index der Schicht wird berechnet: `Math.round((shiftStart - eventStart) / (1000 * 60 * 60))`
4. Dieser Index wird mit den erlaubten Blöcken verglichen: `shiftHourIndex >= block.start && shiftHourIndex < block.end`

### Technische Details
- **Datei geändert**: `helferplan/helferplan.js` (Zeilen 401-425)
- **Debug-Logging hinzugefügt**: Bei Validierungsfehlern werden der berechnete Stunden-Index und die erlaubten Blöcke protokolliert
- **Kompatibilität**: Die Logik stimmt jetzt mit der Frontend-Validierung in `plan.js` überein

### Beispiel
Für erlaubte Blöcke `[{start: 0, end: 2}, {start: 2, end: 6}]`:
- Stunde 0-5 (Freitag 12:00-18:00) sind erlaubt
- Stunde 6+ (Freitag 18:00+) sind gesperrt
- Eine Schicht um 14:00 (Stunde 2) wird jetzt korrekt als erlaubt erkannt

## 8. Bugfix: Changelog-Einträge bereinigt (April 2026)

### Problem
Im Änderungsprotokoll (changelog.html) zeigten manche Einträge nur IDs statt Namen (z.B. „Helfer: ID: 95" statt „Ina (ID: 95)") und gelöschte Einträge enthielten interne Felder (`helper_name`, `team_color`, `created_at`, `updated_at`, `is_override`), die für den Nutzer nicht aussagekräftig sind.

### Ursachen
1. **Typenvergleich-Fehler**: Die ID-Suche (`helpers.find(h => h.id === helperId)`) verwendete strikte Gleichheit (`===`). Da die IDs aus JSON-Daten als Strings ankommen, die Vergleichswerte aus der API aber Zahlen sind, schlug der Vergleich immer fehl.
2. **Zu viele Felder**: Die Funktion `renderDataFields` zeigte alle gespeicherten Felder an, auch technische/interne Felder wie `created_at`, `updated_at`, `helper_name`, `team_color` und `is_override`.

### Lösung
- **Datei geändert**: `helferplan/public/changelog.html`
- `getHelperNameById`, `getTeamNameById`, `getActivityNameById`: IDs werden jetzt per `parseInt()` in Zahlen umgewandelt, bevor sie verglichen werden.
- `FIELDS_TO_SKIP`-Set eingeführt: `id`, `helper_name`, `team_color`, `created_at`, `updated_at`, `is_override` werden in `renderDataFields` und `renderDataChanges` übersprungen.
- Fallback-Anzeige für unbekannte IDs vereinheitlicht: `(ID: X)` statt `ID: X`.

### Beispiel vorher
```
Aktivität: ID: 24
Helfer: ID: 95
helper_name: leer
team_color: leer
created_at: 2026-04-30T09:16:17.000Z
updated_at: 2026-04-30T09:16:17.000Z
Überschreibung: 0
```

### Beispiel nachher
```
Aktivität: Flammkuchen 1 (ID: 24)
Helfer: Ina (ID: 95)
```

## 9. Zusammenfassung

Alle Anforderungen wurden vollständig implementiert:
- ✅ Layout-Verbesserungen (Sticky Headers, optimiertes Panel)
- ✅ Auf-/Abbau-Verwaltung mit allen geforderten Features
- ✅ Kuchen-Verwaltung mit allen geforderten Features
- ✅ Backend-API vollständig
- ✅ Datenbank-Tabellen mit Auto-Initialisierung
- ✅ Admin-Seite erweitert und gut strukturiert
- ✅ Navigation auf allen Seiten
- ✅ Konsistenter Code-Stil
- ✅ Gut dokumentiert und annotiert
- ✅ Zeitblock-Validierung korrigiert (Dezember 2024)
- ✅ Changelog-Einträge bereinigt (April 2026)
- ✅ Rückfrage vor dem Entfernen von Personen in aufbau-abbau.html und kuchen.html (Mai 2026)

## 10. Zeitstempel-Protokoll (letzte Helferplan-Patches)

| Zeitstempel (UTC) | Änderung |
| --- | --- |
| 2026-05-11T08:45:00Z | **Enforce 2h-compatible coverage blocks, fix new-lane block editing, and apply slot team color updates immediately** |
| 2026-05-11T09:14:44Z | Folgearbeiten gestartet: zusätzliche Absicherung für Helferplan-Admin/Plan angefordert |
| 2026-05-11T09:14:44Z | `plan-admin.html` Runtime-Fehler behoben (`totalHours is not defined` in `generateTimeline`) |
| 2026-05-11T09:14:44Z | 2h-Validierung erweitert: 1h-Lücken zwischen zwei 2h-Bedarfsbereichen werden blockiert; isolierter 1h-Slot zwischen gesperrten Slots bleibt erlaubt |
| 2026-05-11T09:14:44Z | `plan.js` Slot-Dauer beim Eintragen dynamisch (1h/2h) umgesetzt, damit 1h-Slots nicht mehr optisch als 2h über `X` laufen und Teamfarbe sofort sichtbar bleibt |
| 2026-05-11T09:55:01Z | `plan-admin.html` Bearbeitung stabilisiert: Bedarf wird beim Klicken/Ziehen in 2h-Blöcken umgeschaltet, wiederholte Validierungs-Popups bei ungültigen Zwischenzuständen beendet und Admin-Anpassungen dadurch wieder möglich |
| 2026-05-11T11:56:55Z | **Fix 1a** `plan-admin.html`: Neue Aktivitäten (leere `allowed_time_blocks`) können jetzt im Admin-Modus gesperrt/entsperrt werden. Beim ersten Sperren wird die volle Zeitabdeckung (0–54h) initialisiert und dann der gewählte 2h-Block entfernt. |
| 2026-05-11T11:56:55Z | **Fix 1b** `plan-admin.html`: Validierungs-Popup "Bedarfszeiten müssen in 2h-Blöcken planbar sein" beim Bearbeiten alter Schichten entfernt – Admins können beliebige Block-Konfigurationen setzen. |
| 2026-05-11T11:56:55Z | **Feature** `plan.js`: Auf `plan.html` werden jetzt je Schicht nur noch 2h-ausgerichtete Slots freigegeben. Stunden, die kein gültiger 2h-Block-Start innerhalb eines freien Laufs sind (z.B. 13 Uhr bei Laufstart 12 Uhr), erscheinen als gesperrt (grau/X) und können nicht belegt werden. Am Ende eines ungeraden Laufs ist ein einzelner 1h-Slot weiterhin zulässig (z.B. Jugendschicht-Sonderfall). |
| 2026-05-26T08:43:00Z | **Feature** `helper-add.html` + `helferplan.js`: Neue Funktion "Bestehende Helfer bearbeiten" auf der Seite `helper-add.html` hinzugefügt. Editoren und Admins können nun Name, Team und Rolle bestehender Helfer direkt über ein Bearbeitungs-Modal ändern. Backend: neuer Endpunkt `PUT /api/helpers/:id` mit Audit-Log. Navigation: Link "Helfer verwalten" auf allen Seiten sichtbar (kein `display:none` mehr). |
| 2026-05-26T09:47:00Z | **Feature** `helper-add.html`: Live-Suchfilter für die Helferliste hinzugefügt — Textfeld (enthält-Suche/Wildcards), Team-Dropdown, Rollen-Dropdown und Trefferanzahl-Anzeige über der Tabelle. |
| 2026-05-26T09:47:00Z | **Feature** `changelog.html`: Jeder Eintrag zeigt jetzt ein Badge mit dem betroffenen Datensatz-Namen und der ID (z.B. `Max Müller (ID: 42)`). Schicht-Einträge lösen den Helfernamen auf, Settings-Einträge den lesbaren Schlüsselnamen. `escapeHtml` für sichere HTML-Ausgabe ergänzt. |
| 2026-05-26T09:47:00Z | **Feature** `index.html` + `main.js`: Zwei neue PDF-Export-Typen ergänzt: „Alle Helfer" (tabellarische Liste, nach Team filterbar) und „Statistik: Admins / Editoren" (Tabelle mit Name, E-Mail, Editor/Admin-Status, letzter Aktivität). |
| 2026-05-26T09:47:00Z | **Feature** `plan.html` + `plan.js`: Team-Farbbadges in der Teams-Legende sind jetzt anklickbar und filtern den Helfer-Pool direkt. Aktives Team erhält einen blauen Highlight-Ring (via `data-teamId`). Hover-Animation und Hinweis „(anklicken zum Filtern)" in der Überschrift ergänzt. |
| 2026-05-27T10:30:00Z | **Feature** `aufbau-abbau.html` + `kuchen.html`: Rückfrage vor dem Entfernen einer Person eingebaut. In `aufbau-abbau.html` erscheint ein Bestätigungs-Dialog bevor ein Helfer per Klick auf den Namensbadge aus einem Slot entfernt wird. In `kuchen.html` erscheint der Dialog, wenn im Bearbeitungs-Dropdown die Option „-- Helfer wählen --" gewählt wird (um versehentliches Entfernen bei großen Listen zu verhindern). |
