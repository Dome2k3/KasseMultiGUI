# Turnier System Improvements - Changelog

## Übersicht der Änderungen

Diese Version bringt wichtige Verbesserungen für das Turnier-Management-System, insbesondere für Swiss System 144 Turniere.

## 1. 👨‍⚖️ Schiedsrichter-Team Management

### Neue Features:
- **Schiedsrichter-Teams erstellen und verwalten**: Neuer Bereich im Tab "Teams & Platzierung"
- **Automatische Zuweisung**: Wenn ein Spiel ein Feld zugewiesen bekommt, wird automatisch ein verfügbares Schiedsrichter-Team zugeordnet
- **Verfügbarkeits-Status**: Schiedsrichter-Teams können als "verfügbar" oder "nicht verfügbar" markiert werden
- **Anzeige in Spielkarten**: Jede Spielkarte zeigt das zugewiesene Schiedsrichter-Team an

### Verwendung:
1. Navigieren Sie zum Tab "👥 Teams & Platzierung"
2. Im Bereich "👨‍⚖️ Schiedsrichter-Teams" klicken Sie auf "+ Schiedsrichter-Team hinzufügen"
3. Geben Sie Team-Name, Ansprechpartner und Telefon ein
4. Das Team wird automatisch Spielen zugewiesen, wenn diese auf Felder gesetzt werden

### Technische Details:
- Neue Tabelle: `turnier_schiedsrichter_teams`
- Neue Spalte in `turnier_spiele`: `schiedsrichter_team_id`
- API-Endpunkte:
  - `GET /api/turniere/:turnierId/schiedsrichter` - Liste aller Schiedsrichter-Teams
  - `POST /api/turniere/:turnierId/schiedsrichter` - Neues Team erstellen
  - `PUT /api/turniere/:turnierId/schiedsrichter/:schiriId` - Team aktualisieren
  - `DELETE /api/turniere/:turnierId/schiedsrichter/:schiriId` - Team löschen

## 2. 💾 Persistente Turnier-Auswahl

### Feature:
Das ausgewählte Turnier bleibt über Seitenaufrufe hinweg erhalten.

### Verwendung:
- Wählen Sie ein Turnier aus dem Dropdown
- Bei erneutem Laden der Seite wird das gleiche Turnier automatisch ausgewählt
- Funktioniert über Browser-LocalStorage

### Technische Details:
- Speichert `selectedTurnierId` in `localStorage`
- Automatische Wiederauswahl beim Seitenload

## 3. 🎮 Neues Turnier mit Modus erstellen

### Feature:
Beim Erstellen eines neuen Turniers kann direkt der Modus ausgewählt werden.

### Verfügbare Modi:
- **Gesetzt (Lostöpfe) - Bracket**: Klassisches Bracket mit Setzpositionen
- **Zufällig - Bracket**: Zufällige Auslosung
- **Swiss System (Standard)**: Alle Teams spielen bis zum Ende
- **Swiss System 144**: 32 Quali-Teams + 128 Hauptfeld (7 Runden)

### Verwendung:
1. Klicken Sie auf "+ Neues Turnier"
2. Wählen Sie den gewünschten Modus aus dem Dropdown
3. Füllen Sie die weiteren Felder aus und klicken Sie "Erstellen"

## 4. ℹ️ Tooltips für Steuerungsbuttons

### Feature:
Alle Buttons im Bereich "🎮 Turnier-Steuerung" haben jetzt Tooltips mit Erklärungen.

### Button-Erklärungen:
- **▶️ Turnier starten**: Erstellt automatisch alle Spiele basierend auf dem gewählten Modus
- **📍 Felder zuweisen**: Weist allen wartenden Spielen automatisch ein freies Feld zu
- **📊 Platzierung berechnen**: Berechnet Zwischenplatzierung nach einer bestimmten Runde
- **🏆 Endplatzierung**: Berechnet die finale Platzierung nach Turnier-Ende
- **🔄 Reset**: Löscht ALLE Spiele und Ergebnisse (Teams bleiben erhalten)

### Verwendung:
Fahren Sie mit der Maus über einen Button, um die Erklärung zu sehen.

## 5. ✅ Swiss 144 Start-Validierung

### Feature:
Beim Start eines Swiss 144 Turniers wird automatisch geprüft, ob die richtigen Team-Verteilungen vorliegen.

### Validierungen:
- Mindestens 32 Teams in Klasse D (Hobby)
- Mindestens 32 Teams in Klasse A (Bundesliga/gesetzte Teams)
- Fehlerhafte Konfiguration wird mit klarer Fehlermeldung abgelehnt

### Fehlermeldungen:
```
"Swiss 144 benötigt mindestens 32 Hobby-Teams (Klasse D). 
Aktuell: X. Bitte fügen Sie weitere Teams hinzu oder ändern Sie die Klasse."
```

## 6. 🔄 Dynamische Feldzuweisung

### Feature:
Wenn ein Spiel beendet wird, wird automatisch das nächste wartende Spiel dem frei gewordenen Feld zugewiesen.

### Ablauf:
1. Spiel wird als "beendet" markiert
2. System sucht das nächste wartende Spiel (status='wartend', beide Teams vorhanden)
3. Feld wird zugewiesen, Status wird auf 'bereit' gesetzt
4. Schiedsrichter-Team wird automatisch zugewiesen

### Technische Details:
- Funktion: `assignNextWaitingGame(turnierId, freedFieldId)`
- Wird automatisch nach Spielabschluss aufgerufen

## 7. 👁️ Vorschau - Nächste 10 Spiele

### Feature:
Der Bereich "Vorschau - Nächste 10 Spiele" zeigt die nächsten wartenden Spiele an.

### Anzeige:
- Nur Spiele mit beiden Teams vorhanden
- Sortiert nach Spiel-Nummer
- Zeigt Phase, Teams und zugewiesenes Schiedsrichter-Team

### Technische Details:
- API: `GET /api/turniere/:turnierId/vorschau?limit=10`
- Filter: `status='wartend' AND feld_id IS NULL AND team1_id IS NOT NULL AND team2_id IS NOT NULL`

## 8. 🎮 Verbesserte Spiel-Status-Übergänge

### Neue Status-Übergänge:
1. **wartend** → Spiel ohne Feld, wartet auf Zuweisung
2. **geplant** → Feld zugewiesen, aber noch nicht bereit (Legacy)
3. **bereit** → Feld zugewiesen, Spiel kann starten
4. **läuft** → Spielbogen wurde abgeholt, Spiel läuft
5. **beendet** → Spiel ist abgeschlossen

### Neue UI-Elemente:
- **▶️ Button**: Bei Spielen mit Status "bereit" erscheint ein "▶️"-Button
- Klick markiert das Spiel als "läuft" (Spielbogen abgeholt)
- Automatische Zeitstempel-Aktualisierung (`tatsaechliche_startzeit`)

### Technische Details:
- API: `PATCH /api/turniere/:turnierId/spiele/:spielId/status`
- Payload: `{ "status": "laeuft" }`

## 9. 🐛 Bug-Fixes

### SQL Foreign Key Constraint Fehler behoben:
- **Problem**: `turnier_spiele` hatte Foreign Key zu `turnier_schiedsrichter_teams`, aber die Tabelle wurde zu spät erstellt
- **Lösung**: Reihenfolge der Tabellen-Erstellung geändert
- **Resultat**: Swiss 144 Turniere können jetzt fehlerfrei gestartet werden

## Migration für bestehende Datenbanken

Wenn Sie bereits eine Datenbank haben, führen Sie die Migration aus:

```bash
mysql -u username -p database_name < turnier/MIGRATION-Referee-Teams.sql
```

## Testing

### Manuelle Tests:
1. **Schiedsrichter-Teams**:
   - Team erstellen
   - Team als nicht verfügbar markieren
   - Prüfen ob bei Spielzuweisung nur verfügbare Teams verwendet werden

2. **Persistente Auswahl**:
   - Turnier auswählen
   - Seite neu laden
   - Prüfen ob Turnier noch ausgewählt ist

3. **Swiss 144 Validierung**:
   - Turnier mit weniger als 32 Hobby-Teams erstellen
   - Start versuchen
   - Erwartung: Fehlerhafte Nachricht

4. **Spiel-Status**:
   - Spiel mit Status "bereit" suchen
   - "▶️" Button klicken
   - Prüfen ob Status auf "läuft" wechselt

5. **Vorschau**:
   - Turnier starten
   - Prüfen ob "Vorschau - Nächste 10 Spiele" die wartenden Spiele anzeigt

## Bekannte Einschränkungen

1. **Schiedsrichter-Rotation**: Aktuell wird ein zufälliges verfügbares Team gewählt. Für fortgeschrittene Rotation-Algorithmen muss die Logik erweitert werden.

2. **Hobby Cup**: Die automatische Erstellung der Hobby Cup Spiele für Qualification-Verlierer ist noch nicht implementiert.

3. **Mehrsprachigkeit**: UI ist aktuell nur auf Deutsch.

## Weitere Verbesserungsvorschläge

1. **Email-Benachrichtigungen**: Schiedsrichter-Teams per Email benachrichtigen
2. **Mobile App**: Schiedsrichter-Ansicht als Native App
3. **Live-Updates**: WebSocket-Integration für Echtzeit-Updates
4. **Statistiken**: Schiedsrichter-Statistiken (Anzahl geleiteter Spiele)
5. **Präferenzen**: Schiedsrichter-Präferenzen für bestimmte Spielklassen

## Support

Bei Fragen oder Problemen:
- GitHub Issues: https://github.com/Dome2k3/KasseMultiGUI/issues
- Dokumentation: `/turnier/SWISS_SYSTEM_README.md`
