# Helferplan Improvements - Implementation Summary

## Übersicht
Diese Implementierung verbessert die Helferplan-Verwaltung mit neuen Features für die Auf-/Abbau-Planung, Kuchen-Spenden und PDF-Export-Funktionalität.

## 1. Auf-/Abbau-Planung (aufbau-abbau.html)

### Neue Features:
- **Spalten-Layout**: Alle 4 Tage (3 Aufbau-Tage + 1 Abbau-Tag) werden nebeneinander in Spalten angezeigt
- **Kompakte Darstellung**: Alle Schichten pro Tag stehen untereinander in einer nummerierten Liste (1-40)
- **Team-Farben**: Zugewiesene Helfer werden mit ihrer Team-Hintergrundfarbe angezeigt
- **Team-Filter**: 
  - "Team-Ansicht filtern": Blendet Helfer anderer Teams aus (Dimmed-Effekt)
  - "Helfer-Auswahl filtern": Zeigt nur Helfer des ausgewählten Teams in den Dropdowns
- **Zähler**: Jeder Tag zeigt "x von 40" Helfer im Header
- **4-Stunden-Schichten**: Unterstützung für 4h-Schichten (wird durch Backend-Konfiguration gesteuert)
- **Erwachsene/Orga-Markierung**: Die ersten x Slots sind orange markiert und nur für Erwachsene/Orga verfügbar

### Technische Details:
- Verwendet Minute-Offsets (0-39) zur eindeutigen Identifikation der 40 Slots pro Tag
- Lazy Loading: Dropdowns werden nur bei Bedarf angezeigt, sonst Helfer-Namen mit Team-Farben
- Click-to-edit: Klick auf Helfer-Namen zeigt Dropdown zum Ändern/Entfernen

## 2. Kuchen-Spenden (kuchen.html)

### Neue Features:
- **Kompaktes Layout**: Kuchenname und "Enthält Nüsse"-Checkbox in einer Zeile
- **Team-Farben**: Zugewiesene Helfer werden mit ihrer Team-Hintergrundfarbe angezeigt
- **Team-Filter**: 
  - "Team-Ansicht filtern": Blendet Helfer anderer Teams aus (Dimmed-Effekt)
  - "Helfer-Auswahl filtern": Zeigt nur Helfer des ausgewählten Teams in den Dropdowns
- **Zähler**: Jeder Tag zeigt "x von y" Kuchen im Header (y = konfigurierte Anzahl)
- **Spalten-Layout**: 3 Tage nebeneinander (Freitag, Samstag, Sonntag)

### Technische Details:
- Auto-Save: Änderungen werden automatisch beim Verlassen des Feldes gespeichert
- Lazy Loading: Dropdowns werden nur bei Bedarf angezeigt

## 3. PDF-Export (index.html Admin-Seite)

### Neue Features:
- **Export-Typen**:
  - Turnier-Planung: Exportiert alle Turnier-Schichten gruppiert nach Aktivität
  - Auf-/Abbau: Exportiert Setup/Teardown-Schichten gruppiert nach Tag
  - Kuchen: Exportiert Kuchen-Spenden gruppiert nach Tag
- **Team-Filter**: Optional kann ein Team ausgewählt werden, um nur dessen Helfer zu exportieren
- **Seitenformat**: Wählbar zwischen Querformat (Landscape) und Hochformat (Portrait)
- **Kompakte Darstellung**: PDFs sind so optimiert, dass sie möglichst auf eine Seite passen

### Technische Details:
- Verwendet jsPDF library (CDN: cdnjs.cloudflare.com)
- PDF-Generierung erfolgt client-side (keine Server-Last)
- Automatischer Seitenumbruch bei zu vielen Einträgen
- Dateiname enthält Team-Name (falls gefiltert)

## 4. Gemeinsame Features

### Code-Wiederverwendung:
- Team-Filter-Logik ähnlich wie in plan.js
- Team-Farben-Darstellung konsistent über alle Seiten
- Luminanz-Berechnung für automatische Textfarbe (hell/dunkel) auf Team-Hintergrund

### Filter-Funktionalität:
1. **Team-Ansicht-Filter**: Dimmt alle Helfer, die nicht zum ausgewählten Team gehören (opacity: 0.3)
2. **Helfer-Auswahl-Filter**: Zeigt nur Helfer des ausgewählten Teams in Dropdowns

## 5. Dateiänderungen

### Geänderte Dateien:
- `helferplan/public/aufbau-abbau.html`: Komplett überarbeitet mit neuem Layout und Filtern
- `helferplan/public/kuchen.html`: Komplett überarbeitet mit kompaktem Layout und Filtern
- `helferplan/public/index.html`: PDF-Export-Sektion hinzugefügt + jsPDF library
- `helferplan/public/js/main.js`: PDF-Export-Funktionen hinzugefügt

### Neue Dateien:
- `.gitignore`: Verhindert, dass node_modules committed werden

## 6. Verwendete Libraries

- **jsPDF 2.5.1**: Client-side PDF-Generierung (via CDN)
  - Keine zusätzlichen npm-Pakete erforderlich
  - Keine Backend-Änderungen notwendig

## 7. Kompatibilität

- **Browser-Kompatibilität**: Moderne Browser (Chrome, Firefox, Safari, Edge)
- **Mobile-Friendly**: Responsive Design mit overflow-x: auto für Spalten-Layout
- **Backward-Compatible**: Keine Breaking Changes am Backend oder Datenbank-Schema
- **Existing Data**: Funktioniert mit bestehenden Daten ohne Migration

## 8. Testing-Empfehlungen

### Manuelle Tests:
1. **Auf-/Abbau-Seite**:
   - [ ] Alle 4 Tage werden korrekt angezeigt
   - [ ] Team-Filter funktionieren (Ansicht + Auswahl)
   - [ ] Helfer-Zuweisungen speichern korrekt
   - [ ] Team-Farben werden korrekt angezeigt
   - [ ] Zähler "x von 40" aktualisieren sich

2. **Kuchen-Seite**:
   - [ ] Alle 3 Tage werden korrekt angezeigt
   - [ ] Team-Filter funktionieren (Ansicht + Auswahl)
   - [ ] Kuchen-Details speichern korrekt
   - [ ] Team-Farben werden korrekt angezeigt
   - [ ] Zähler "x von y" aktualisieren sich

3. **PDF-Export**:
   - [ ] Turnier-Export funktioniert
   - [ ] Auf-/Abbau-Export funktioniert
   - [ ] Kuchen-Export funktioniert
   - [ ] Team-Filter im Export funktioniert
   - [ ] Landscape/Portrait-Auswahl funktioniert
   - [ ] PDFs enthalten alle Daten korrekt

## 9. Bekannte Einschränkungen

1. **Slot-Identifikation**: Verwendet Minute-Offsets zur Identifikation der 40 Slots pro Tag. Dies ist eine pragmatische Lösung ohne Schema-Änderung. Für eine Produktionsumgebung könnte eine `slot_index`-Spalte in der Datenbank hinzugefügt werden.

2. **PDF-Formatierung**: Bei sehr vielen Einträgen kann das PDF mehrere Seiten umfassen. Die Optimierung für eine Seite ist "best effort".

3. **Client-Side PDF**: Die PDF-Generierung erfolgt client-side, was bedeutet, dass sehr große Exports bei älteren Geräten langsam sein könnten.

## 10. Nächste Schritte

1. Manuelle Tests durchführen
2. Feedback vom Benutzer einholen
3. Ggf. Anpassungen vornehmen
4. Code Review
