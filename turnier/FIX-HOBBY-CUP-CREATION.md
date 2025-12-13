# Fix: Hobby Cup Games Not Created After Qualification

## Problem

Nach dem Abschluss aller 16 Qualifikationsspiele im Swiss 144 Turnier:

1. **Hobby Cup Spiele wurden nicht erstellt**
   ```sql
   SELECT COUNT(*) FROM turnier_spiele WHERE phase_id = 65 AND runde = 1;
   -- Ergebnis: 0 (sollte 8 sein)
   ```

2. **Teams zeigen als "TBD"** statt der tatsächlichen Verlierer-Teams

## Root Cause

### Problem 1: Fehlende Hobby Cup Phase

Die `handleQualificationComplete` Funktion:
1. Suchte nach der Hobby Cup Phase per Name
2. Wenn nicht gefunden: Error-Log aber KEINE Spiel-Erstellung
3. Resultat: 0 Spiele in phase_id = 65

### Problem 2: Fehlende Defensive Checks

- Keine Validierung ob `verlierer_id` gesetzt wurde
- Keine Überprüfung ob Teams in DB existieren
- Keine Logs zum Debuggen von Pairing-Problemen

## Solution

### 1. Auto-Erstellung der Hobby Cup Phase

**Datei:** `turnier/turnier.js`, Zeilen 789-798

```javascript
// Check if Hobby Cup phase exists, create if not
let [hobbyCupPhase] = await db.query(
    'SELECT * FROM turnier_phasen WHERE turnier_id = ? AND phase_name = "Hobby Cup"',
    [turnierId]
);

// Create Hobby Cup phase if it doesn't exist
if (hobbyCupPhase.length === 0) {
    console.log(`Hobby Cup phase not found - creating it now`);
    const [result] = await db.query(
        'INSERT INTO turnier_phasen (turnier_id, phase_name, phase_typ, reihenfolge, beschreibung) VALUES (?, ?, ?, ?, ?)',
        [turnierId, 'Hobby Cup', 'trostrunde', 3, 'Hobby Cup for Qualification Losers']
    );
    hobbyCupPhase = [{ id: result.insertId, phase_name: 'Hobby Cup' }];
    console.log(`Created Hobby Cup phase with ID ${result.insertId}`);
}
```

### 2. Defensive Checks & Logging

**Datei:** `turnier/turnier.js`, Zeilen 669-676, 807-836

```javascript
// Check for missing winners/losers
if (winners.length === 0 && losers.length === 0) {
    console.error(`WARNING: No winners or losers found!`);
    console.error(`This might indicate that gewinner_id and verlierer_id are not set.`);
}

// Check for team count mismatch
if (winners.length !== losers.length) {
    console.warn(`WARNING: Winners (${winners.length}) and losers (${losers.length}) counts don't match.`);
}

// Verify loser teams exist in database
if (loserTeams.length !== losers.length) {
    const loserTeamIds = new Set(loserTeams.map(t => t.id));
    const missing = losers.filter(id => !loserTeamIds.has(id));
    console.error(`ERROR: Expected ${losers.length} loser teams but only found ${loserTeams.length}`);
    console.error(`Missing team IDs: ${missing.join(', ')}`);
}

// Detailed pairing logs
console.log(`Paired: ${loserTeams[i].team_name} (ID ${loserTeams[i].id}) vs ${loserTeams[i + 1].team_name} (ID ${loserTeams[i + 1].id})`);
```

## Verification

### 1. Nach Qualification-Abschluss

Erwartete Console-Logs:

```
=== Qualification round complete - processing winners and losers ===
Qualification complete: 16 games finished
  - Winners (advancing to Main Swiss): 16 teams -> 113, 115, 117, ...
  - Losers (going to Hobby Cup): 16 teams -> 114, 116, 118, ...

=== Creating Hobby Cup for 16 qualification losers ===
Retrieved 16 loser teams for Hobby Cup pairing
Paired: Team A (ID 114) vs Team B (ID 116)
Paired: Team C (ID 118) vs Team D (ID 120)
...
Created 8 Hobby Cup pairings
[Hobby Cup] Generated 8 games, assigned 0 to fields
Created 8 Hobby Cup pairings for 16 teams
=== Qualification processing complete ===
```

### 2. Datenbank-Checks

```sql
-- 1. Hobby Cup Phase existiert
SELECT * FROM turnier_phasen WHERE phase_name = 'Hobby Cup';
-- Erwartung: 1 Zeile

-- 2. Hobby Cup Spiele wurden erstellt
SELECT COUNT(*) FROM turnier_spiele WHERE phase_id = 65 AND runde = 1;
-- Erwartung: 8 (16 Verlierer → 8 Paare)

-- 3. Teams sind gesetzt (nicht NULL)
SELECT spiel_nummer, team1_id, team2_id, status
FROM turnier_spiele 
WHERE phase_id = 65 AND runde = 1;
-- Erwartung: Alle team1_id und team2_id sind NOT NULL

-- 4. Team-Namen anzeigen
SELECT s.spiel_nummer, t1.team_name as team1, t2.team_name as team2
FROM turnier_spiele s
LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
WHERE s.phase_id = 65 AND s.runde = 1
ORDER BY s.spiel_nummer;
-- Erwartung: Team-Namen statt "TBD"
```

### 3. Test mit Batch Complete

```bash
# Starte Swiss 144 Turnier
# POST /api/turniere/1/start

# Komplettiere 16 Qualification Spiele
./turnier/test-batch-complete.example.sh 1 16

# Überprüfe Ergebnis
mysql -u user -p -D kasse -e "SELECT COUNT(*) FROM turnier_spiele WHERE phase_id = 65 AND runde = 1;"
```

## Troubleshooting

### Problem: Hobby Cup hat 0 Spiele

**Mögliche Ursachen:**

1. **`verlierer_id` nicht gesetzt**
   ```sql
   SELECT spiel_nummer, team1_id, team2_id, gewinner_id, verlierer_id
   FROM turnier_spiele
   WHERE phase_id = 63 AND runde = 0 AND status = 'beendet';
   ```
   → Alle `verlierer_id` müssen gesetzt sein

2. **`losers` Array ist leer**
   → Check Console-Logs: "Losers (going to Hobby Cup): 0 teams"
   → Bedeutet: `verlierer_id` ist NULL in Qualification-Spielen

3. **Hobby Cup Phase fehlt**
   → Mit diesem Fix: Phase wird automatisch erstellt
   → Check Logs: "Created Hobby Cup phase with ID X"

### Problem: Teams zeigen als "TBD"

**Mögliche Ursachen:**

1. **Loser-Teams nicht in DB gefunden**
   → Check Log: "ERROR: Expected 16 loser teams but only found X"
   → Bedeutet: Team-IDs existieren nicht in turnier_teams

2. **Team-IDs sind NULL**
   → Check SQL:
   ```sql
   SELECT team1_id, team2_id FROM turnier_spiele WHERE phase_id = 65;
   ```
   → Wenn NULL: Problem beim Erstellen der Spiele

3. **Pairing-Fehler**
   → Check Logs: "Paired: TeamName (ID X) vs TeamName (ID Y)"
   → Wenn keine Logs: Pairing-Loop nicht ausgeführt

## Testing Checklist

- [ ] Console-Logs zeigen "Created Hobby Cup phase" (wenn Phase fehlt)
- [ ] Console-Logs zeigen "16 teams" für Winners und Losers
- [ ] Console-Logs zeigen "Retrieved 16 loser teams"
- [ ] Console-Logs zeigen 8x "Paired: TeamA vs TeamB"
- [ ] SQL: 8 Spiele in phase_id = 65
- [ ] SQL: Alle team1_id und team2_id sind NOT NULL
- [ ] SQL: Team-Namen werden angezeigt (nicht TBD)

## Security

✅ **CodeQL Check:** Keine Alerts  
✅ **SQL Injection:** Sichere Prepared Statements  
✅ **Error Handling:** Defensive Checks und Early Returns  
✅ **Performance:** O(1) Lookups mit Set statt O(n²) mit nested find()

## Deployment

### Für bestehende Turniere

Die Hobby Cup Phase wird automatisch erstellt, wenn sie fehlt. Keine Migration nötig.

### Für neue Turniere

Code ist rückwärtskompatibel mit `startSwiss144Tournament`, das die Phase auch erstellt.

## Files Changed

- **turnier/turnier.js** (Zeilen 669-836)
  - Auto-Erstellung Hobby Cup Phase
  - Defensive Checks für Winners/Losers
  - Validierung von Team-Daten
  - Detaillierte Pairing-Logs
  - Performance-Optimierung

- **turnier/FIX-HOBBY-CUP-CREATION.md** (NEU)
  - Diese Dokumentation
