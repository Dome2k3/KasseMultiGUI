# Feature: Spielende Teams als Schiedsrichter

## Übersicht

Diese neue Funktion ermöglicht es, zwischen zwei Modi für die Schiedsrichter-Zuweisung zu wählen:

1. **Separate Schiedsrichter-Teams** (Optional)
2. **Spielende Teams als Schiedsrichter** (Standard/Default)

## Verwendung

### Bei Turnier-Erstellung

Im Dialog "Neues Turnier erstellen" gibt es eine neue Checkbox:

```
☐ Separate Schiedsrichter-Teams verwenden
```

**Hilfetext:** "Wenn nicht aktiviert, werden spielende Teams als Schiedsrichter eingesetzt (bevorzugt Teams, die gerade nicht warten)"

### Modus 1: Separate Schiedsrichter-Teams (Checkbox aktiviert)

- Funktioniert wie zuvor
- Dedizierte Schiedsrichter-Teams müssen im Tab "Teams & Platzierung" angelegt werden
- Diese Teams werden automatisch freien Spielen zugewiesen

### Modus 2: Spielende Teams als Schiedsrichter (Standard, Checkbox nicht aktiviert)

**Automatische Auswahl-Logik:**

1. **Bevorzugte Teams:** Teams die gerade ein Spiel beendet haben (Status "beendet")
2. **Ausschlusskriterium:** Teams die in wartenden/geplanten/bereiten Spielen sind
3. **Sortierung:** 
   - Zuerst: Teams die kürzlich gespielt haben (nach `bestaetigt_zeit`)
   - Dann: Zufällige Auswahl

**Vorteile:**
- Keine separaten Schiedsrichter-Teams notwendig
- Teams die gerade fertig sind, können andere Spiele leiten
- Teams die auf ihr nächstes Spiel warten, sind ausgeschlossen
- Automatische faire Verteilung

## Technische Implementation

### Datenbank

**Neues Feld in `turnier_config`:**
```sql
separate_schiri_teams BOOLEAN DEFAULT FALSE
```

### Backend (`assignRefereeTeam` Funktion)

```javascript
// 1. Prüfe Turnier-Konfiguration
const useSeparateSchiri = config[0].separate_schiri_teams;

if (useSeparateSchiri) {
    // Mode 1: Verwende dedizierte Schiedsrichter-Teams
    // Suche in turnier_schiedsrichter_teams
    // Setze schiedsrichter_team_id
} else {
    // Mode 2: Verwende spielende Teams
    // Suche Teams die:
    //   - kürzlich gespielt haben (beendet)
    //   - NICHT in wartenden Spielen sind
    // Setze schiedsrichter_name
}
```

### Frontend

**Anzeige im Spiel-Card:**
```javascript
const schiriName = game.schiedsrichter_team_name || game.schiedsrichter_name;
```

Beide Modi werden transparent unterstützt.

## Query-Logik für spielende Teams

```sql
SELECT DISTINCT t.id, t.team_name,
    MAX(s_finished.bestaetigt_zeit) as last_game_time
FROM turnier_teams t
-- Join mit beendeten Spielen
LEFT JOIN turnier_spiele s_finished 
    ON (t.id = s_finished.team1_id OR t.id = s_finished.team2_id)
    AND s_finished.status = 'beendet'
-- Join mit wartenden Spielen (zum Ausschluss)
LEFT JOIN turnier_spiele s_waiting 
    ON (t.id = s_waiting.team1_id OR t.id = s_waiting.team2_id)
    AND s_waiting.status IN ('geplant', 'bereit', 'wartend')
WHERE t.turnier_id = ? 
    AND t.status IN ('angemeldet', 'bestaetigt')
    AND s_waiting.id IS NULL  -- Team ist NICHT in wartendem Spiel
GROUP BY t.id
ORDER BY last_game_time DESC NULLS LAST, RAND()
LIMIT 1
```

## Beispiel-Szenario

**Swiss 144 Turnier mit 144 Teams:**

1. **Spiel 1-16:** Qualification matches laufen
2. **Spiel 1 endet:** Team A gewinnt gegen Team B
3. **Spiel 17 wird Feld zugewiesen:** 
   - System sucht freies Team
   - Team B (gerade verloren, nicht in wartendem Spiel) wird als Schiedsrichter gewählt
   - Team B wird als `schiedsrichter_name` in Spiel 17 eingetragen

4. **Anzeige:**
   ```
   Spiel #17
   📍 Feld 2
   👨‍⚖️ Team B (Schiedsrichter)
   Team C vs Team D
   ```

## Migration

Bestehende Turniere:
- Standard-Wert ist `separate_schiri_teams = FALSE`
- Verhält sich wie neuer Default (spielende Teams)
- Um dedizierte Schiedsrichter-Teams zu verwenden, muss das Feld auf `TRUE` gesetzt werden

## Vorteile

✅ **Flexibilität:** Beide Modi unterstützt  
✅ **Einfacher:** Kein Bedarf für separate Schiedsrichter-Teams (Standard)  
✅ **Fair:** Teams die gerade nicht spielen werden eingesetzt  
✅ **Automatisch:** Keine manuelle Zuweisung notwendig  
✅ **Rückwärtskompatibel:** Bestehende Funktionen bleiben erhalten  

## Einschränkungen

- Wenn KEINE Teams verfügbar sind (alle in wartenden Spielen), bleibt das Feld leer
- Teams die noch nie gespielt haben, haben Priorität nach zufälligen Teams
- Bei sehr vielen gleichzeitigen Spielen kann es zu wenigen verfügbaren Teams kommen

## Empfehlung

**Für Swiss 144 Turniere (144 Teams):**
- ✅ **Standard-Modus empfohlen** (Checkbox nicht aktiviert)
- Genug Teams vorhanden, die als Schiedsrichter fungieren können
- Teams die verloren/gewonnen haben sind sofort verfügbar

**Für kleinere Turniere (< 32 Teams):**
- ⚠️ Separate Schiedsrichter-Teams können sinnvoller sein
- Weniger Teams verfügbar für Rotation

## Testing

1. **Neues Turnier ohne Checkbox:** 
   - Turnier starten
   - Spiel beenden
   - Prüfen: Freies Team wird als Schiedsrichter angezeigt

2. **Neues Turnier mit Checkbox:**
   - Schiedsrichter-Teams anlegen
   - Turnier starten
   - Prüfen: Dedizierte Teams werden zugewiesen

3. **Anzeige:**
   - Beide Modi zeigen Schiedsrichter-Namen korrekt an
   - Keine visuellen Unterschiede in der UI
