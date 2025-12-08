# Test-Funktion: Mehrere Spiele auf einmal abschließen

## ⚠️ TEMPORÄRE TEST-FUNKTION - VOR PRODUKTIVEINSATZ ENTFERNEN

Diese Funktion ermöglicht es, mehrere Spiele gleichzeitig mit einem 2:0 Ergebnis abzuschließen, um das Testen des Turnierverlaufs zu beschleunigen (besonders für das Schweizer System und Rundenübergänge).

## Verwendung

### Endpunkt
```
POST /api/turniere/:turnierId/test/batch-complete-games
```

### Parameter
- `turnierId` (Pfad-Parameter): ID des Turniers
- `count` (Body-Parameter, optional): Anzahl der abzuschließenden Spiele (Standard: 10)

### Beispiel-Anfragen

#### Erste 10 Spiele abschließen (Standard)
```bash
curl -X POST http://localhost:3004/api/turniere/1/test/batch-complete-games \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Erste 5 Spiele abschließen
```bash
curl -X POST http://localhost:3004/api/turniere/1/test/batch-complete-games \
  -H "Content-Type: application/json" \
  -d '{"count": 5}'
```

#### Mit dem mitgelieferten Bash-Skript
```bash
# Erste 10 Spiele für Turnier 1 abschließen
./test-batch-complete.example.sh 1 10

# Erste 15 Spiele für Turnier 2 abschließen
./test-batch-complete.example.sh 2 15
```

### Antwort-Beispiel
```json
{
  "success": true,
  "message": "5 games completed with 2:0 for testing",
  "completed": 5,
  "games": [
    {
      "spiel_nummer": 1,
      "team1": "Team Alpha",
      "team2": "Team Beta",
      "ergebnis": "2:0"
    },
    ...
  ]
}
```

## Was macht die Funktion?

1. Holt die ersten X noch nicht abgeschlossenen Spiele (sortiert nach Runde und Spielnummer)
2. Setzt das Ergebnis jedes Spiels auf **2:0** (Team 1 gewinnt)
   - Satz 1: 25:20
   - Satz 2: 25:20
3. Markiert das Ergebnis mit Kommentar: "TEST: Automatisch abgeschlossen für Testdurchlauf"
4. Löst automatisch den Turnierverlauf aus (Erstellung der nächsten Runde falls erforderlich)
5. Weist wartende Spiele zu freigewordenen Feldern zu
6. Schreibt Einträge ins Audit-Log

## Vorteile für das Testen

- ✅ Schnelles Vorankommen durch Runde 1 zum Testen der Runde 2 Generierung
- ✅ Testen des Swiss-Pairing-Systems mit abgeschlossenen Spielen
- ✅ Testen der dynamischen Rundenprogression
- ✅ Keine manuelle Ergebniseingabe für jedes Spiel nötig
- ✅ Überprüfung der Feldzuweisungslogik

## Wichtige Hinweise

- ⚠️ Dies ist eine **NUR ZUM TESTEN** gedachte Funktion
- ⚠️ Muss vor dem Produktiveinsatz **ENTFERNT** werden
- ⚠️ **KEINE AUTHENTIFIZIERUNG** - Endpunkt ist völlig ungeschützt
- ⚠️ Ergebnisse sind klar als Testdaten markiert
- ⚠️ Schließt immer mit Team 1 gewinnt 2:0 ab
- ⚠️ Schließt nur Spiele mit beiden Teams zugewiesen ab
- ⚠️ Count-Parameter ist auf 1-100 Spiele pro Anfrage begrenzt

## Anwendungsfall

**Problem:** Du möchtest schnell sehen, ob Runde 2 korrekt eingeleitet wird.

**Lösung:** Statt in jedes einzelne Spiel zu gehen und ein Ergebnis zu hinterlegen, kannst du mit dieser Funktion die ersten X Spiele auf einmal abschließen:

```bash
# Schließe die ersten 10 Spiele ab, um Runde 2 zu starten
curl -X POST http://localhost:3004/api/turniere/1/test/batch-complete-games \
  -H "Content-Type: application/json" \
  -d '{"count": 10}'
```

Das spart Zeit beim Testen und du kannst dich auf die Überprüfung der Rundenübergänge konzentrieren!

## Entfernungs-Checkliste

Vor dem Produktiveinsatz entfernen:
- [ ] Endpunkt `/api/turniere/:turnierId/test/batch-complete-games` aus turnier.js
- [ ] "TESTING FUNCTIONS" Abschnitt aus turnier.js (Zeilen ~2850-2960)
- [ ] Diese Dokumentationsdatei (TESTING-ANLEITUNG-DE.md)
- [ ] Englische Dokumentation (TESTING-BATCH-COMPLETE.md)
- [ ] Beispiel-Skript (test-batch-complete.example.sh)
