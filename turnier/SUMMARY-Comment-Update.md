# Update Summary - Flexible Schiedsrichter-Zuweisung

## Anfrage von @Dome2k3

> bei Turnieranlage fragen, ob es extra Schiri Teams gibt. wenn ja, können diese angelegt werden. 
> Sonst als Default: schiedsrichter ist immer ein freies team aus den 144 Teams. 
> Am besten eins, das gerade verloren oder gewonnen hat, da diese nicht direkt dran kommen. 
> beim start des turniers einfach ein freies team, aus den nicht anstehenden/wartenden Spiele.

## Implementierte Lösung

### UI-Änderung: Neues Turnier erstellen

Im Dialog "Neues Turnier erstellen" wurde eine neue Checkbox hinzugefügt:

```
☐ Separate Schiedsrichter-Teams verwenden

Hilfetext: "Wenn nicht aktiviert, werden spielende Teams als Schiedsrichter 
eingesetzt (bevorzugt Teams, die gerade nicht warten)"
```

**Standard-Verhalten (Checkbox NICHT aktiviert):**
- Verwendet spielende Teams als Schiedsrichter
- Bevorzugt Teams, die gerade ein Spiel beendet haben (gewonnen oder verloren)
- Schließt Teams aus, die in wartenden/geplanten Spielen sind

**Optional (Checkbox aktiviert):**
- Verwendet dedizierte Schiedsrichter-Teams
- Teams müssen separat angelegt werden (wie bisher)

### Backend-Logik

Die `assignRefereeTeam()` Funktion wurde erweitert:

#### Modus 1: Separate Schiedsrichter-Teams (wenn aktiviert)
```javascript
// Sucht in turnier_schiedsrichter_teams Tabelle
// Findet verfügbare Schiedsrichter-Teams
// Setzt schiedsrichter_team_id
```

#### Modus 2: Spielende Teams als Schiedsrichter (Default)
```javascript
// Query findet Teams die:
// 1. Kürzlich gespielt haben (beendet-Status)
// 2. NICHT in wartenden/geplanten Spielen sind
// Sortiert nach: Letzte Spielzeit DESC, dann zufällig
// Setzt schiedsrichter_name (Team-Name)
```

### SQL Query für spielende Teams

```sql
SELECT DISTINCT t.id, t.team_name,
    MAX(s_finished.bestaetigt_zeit) as last_game_time
FROM turnier_teams t
LEFT JOIN turnier_spiele s_finished 
    ON (t.id = s_finished.team1_id OR t.id = s_finished.team2_id)
    AND s_finished.status = 'beendet'
LEFT JOIN turnier_spiele s_waiting 
    ON (t.id = s_waiting.team1_id OR t.id = s_waiting.team2_id)
    AND s_waiting.status IN ('geplant', 'bereit', 'wartend')
WHERE t.turnier_id = ? 
    AND t.status IN ('angemeldet', 'bestaetigt')
    AND s_waiting.id IS NULL  -- ⚠️ Wichtig: Team ist NICHT in wartendem Spiel
GROUP BY t.id
ORDER BY last_game_time DESC NULLS LAST, RAND()
LIMIT 1
```

**Wichtige Details:**
- `last_game_time DESC NULLS LAST`: Teams die gerade gespielt haben, kommen zuerst
- `s_waiting.id IS NULL`: Teams in wartenden Spielen werden ausgeschlossen
- `RAND()`: Bei Gleichstand zufällige Auswahl

## Beispiel-Szenario: Swiss 144 Turnier

**Ausgangssituation:**
- 144 Teams registriert
- Spiel 1-16 (Qualification) laufen parallel

**Ablauf:**

1. **Spiel 1 endet (10:15 Uhr)**
   - Team A gewinnt gegen Team B (2:1)
   - Status → "beendet"
   - `bestaetigt_zeit` = 10:15 Uhr

2. **Spiel 17 bekommt Feld zugewiesen (10:16 Uhr)**
   - System ruft `assignRefereeTeam(turnierId, spielId)` auf
   - Prüft: `separate_schiri_teams = false` (Default)
   - Query sucht freies Team:
     - Team B hat `last_game_time` = 10:15 Uhr (gerade gespielt)
     - Team B ist NICHT in wartendem Spiel
     - Team B wird ausgewählt

3. **Ergebnis:**
   ```
   Spiel #17
   📍 Feld 2
   👨‍⚖️ Team B (Schiedsrichter)
   Team C vs Team D
   ```

4. **Team B's Status:**
   - Ist Schiedsrichter für Spiel 17
   - Kann später wieder als Spieler in einem eigenen Spiel antreten
   - Wird dann wieder als Schiedsrichter verfügbar

## Datenbank-Änderungen

### Neue Spalte in `turnier_config`
```sql
ALTER TABLE turnier_config 
ADD COLUMN separate_schiri_teams BOOLEAN DEFAULT FALSE AFTER modus;
```

### Migration
Die Migration (`MIGRATION-Referee-Teams.sql`) wurde aktualisiert:
```sql
-- Step 0: Add separate_schiri_teams column to turnier_config
ALTER TABLE turnier_config 
ADD COLUMN IF NOT EXISTS separate_schiri_teams BOOLEAN DEFAULT FALSE AFTER modus;
```

## Frontend-Änderungen

### Turnier erstellen (turnier-admin.js)
```javascript
const separateSchiri = document.getElementById('new-turnier-separate-schiri').checked;

await fetch(`${API_BASE}/api/turniere`, {
    method: 'POST',
    body: JSON.stringify({
        // ... andere Felder
        separate_schiri_teams: separateSchiri
    })
});
```

### Anzeige (turnier-admin.js)
```javascript
// Unterstützt beide Modi
const schiriName = game.schiedsrichter_team_name || game.schiedsrichter_name || '';
const schiriDisplay = schiriName
    ? `<span class="game-card-schiri">👨‍⚖️ ${escapeHtml(schiriName)}</span>`
    : '<span class="game-card-schiri no-schiri">👨‍⚖️ Kein Schiedsrichter</span>';
```

## Vorteile der Implementierung

✅ **Flexibel**: Beide Modi unterstützt (separate Teams oder spielende Teams)  
✅ **Intelligent**: Bevorzugt Teams die gerade gespielt haben  
✅ **Fair**: Schließt Teams aus, die auf ihr nächstes Spiel warten  
✅ **Automatisch**: Keine manuelle Zuweisung notwendig  
✅ **Einfach**: Standard-Modus benötigt keine separaten Schiedsrichter-Teams  
✅ **Rückwärtskompatibel**: Bestehende Funktionalität bleibt erhalten  

## Testing-Empfehlung

### Test 1: Standard-Modus (spielende Teams)
1. Neues Turnier erstellen **ohne** Checkbox zu aktivieren
2. 144 Teams importieren
3. Turnier starten (Swiss 144)
4. Erstes Spiel beenden
5. Prüfen: Team das verloren hat, wird als Schiedsrichter für nächstes Spiel angezeigt

### Test 2: Separate Schiedsrichter-Teams
1. Neues Turnier erstellen **mit** aktivierter Checkbox
2. Schiedsrichter-Teams anlegen (Tab "Teams & Platzierung")
3. Turnier starten
4. Prüfen: Dedizierte Schiedsrichter-Teams werden zugewiesen

### Test 3: Anzeige
1. Beide Modi testen
2. Prüfen: Schiedsrichter-Name erscheint in Spielkarten
3. Prüfen: Keine visuellen Unterschiede zwischen den Modi

## Commits

- **eafeefe**: Add option to use playing teams as referees instead of separate referee teams
- **946583e**: Add documentation for playing teams as referees feature
- **1010a3b**: Add explicit fallback for undefined schiri name values

## Dokumentation

- **FEATURE-Playing-Teams-As-Referees.md**: Vollständige Feature-Dokumentation
- **MIGRATION-Referee-Teams.sql**: Aktualisiert mit neuem Feld
- **SQL-Setup-Turnier.sql**: Aktualisiert mit neuem Feld

## Fazit

Die Anforderung wurde vollständig umgesetzt:
- ✅ Bei Turnier-Erstellung wird gefragt, ob separate Schiri-Teams verwendet werden sollen
- ✅ Default-Verhalten: Spielende Teams als Schiedsrichter (bevorzugt Teams die gerade gespielt haben)
- ✅ Teams die in wartenden Spielen sind, werden ausgeschlossen
- ✅ Intelligente Auswahl basierend auf letzter Spielzeit
- ✅ Beide Modi werden nahtlos unterstützt
