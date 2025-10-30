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

## 7. Zusammenfassung

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
