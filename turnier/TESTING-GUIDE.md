# Testing Guide for Tournament Improvements

## Overview
This guide explains the recent improvements to the tournament management system and how to test them.

## Changes Implemented

### 1. Referee (Schiedsrichter) Column in Detail View ✓
**What changed:**
- Added "Schiedsrichter" column to the "Alle Spiele (Detailansicht)" table
- Displays referee information from either:
  - Dedicated referee teams (`schiedsrichter_team_name`)
  - Playing teams acting as referees (`schiedsrichter_name`)

**How to test:**
1. Open the tournament admin interface
2. Select a tournament
3. Navigate to "Spiele" tab
4. Check the "Alle Spiele (Detailansicht)" table
5. Verify there's a "Schiedsrichter" column showing referee assignments

### 2. Automatic Referee Assignment ✓
**What changed:**
- Referees are now assigned automatically when:
  - Games are created at tournament start
  - New round games are generated
  - Waiting games are assigned to freed fields

**How to test:**
1. Start a new tournament
2. Check that initial games have referees assigned
3. Complete a game that has a field assigned
4. Verify the next waiting game that gets assigned also gets a referee
5. Check server console for referee assignment messages

### 3. Bemerkung (Remark) Column ✓
**What changed:**
- Added "Bemerkung" column to display game notes
- Automatically adds "Eingegeben von Turnierleitung" when admin enters results

**How to test:**
1. Open the tournament admin interface
2. Navigate to "Spiele" tab
3. Edit a game result as admin (not via referee interface)
4. Save the result
5. Check the "Bemerkung" column shows "Eingegeben von Turnierleitung"

### 4. Game Assignment After Completion (Swiss 144 Mode) ✓
**What changed:**
- When a game finishes, the next waiting game is automatically assigned to the freed field
- Enhanced logging helps track the assignment process

**Critical Test for Swiss 144 Mode:**
```
Scenario: 27 fields, 144 teams, first round has 64 games
- Games 1-16: Qualification on fields 1-16
- Games 17-27: First main round games on fields 17-27
- Games 28-80: Waiting for fields (status='wartend')

Expected behavior:
When game #27 finishes → Game #28 should be assigned to field #27
```

**Testing Steps:**
1. Select BVT tournament (Swiss 144 mode)
2. Ensure you have 27 fields configured
3. Start the tournament (if not already started)
4. Complete game #27 by entering a result
5. **Watch the server console output** for these messages:
   ```
   [admin-ergebnis] Game #27 completed on field X, assigning next waiting game
   [assignNextWaitingGame] Freed field X, found Y waiting games
   [assignNextWaitingGame] ✓ Assigned waiting game #28 (ID: Z) to field X
   ```
6. The frontend should auto-refresh and show game #28 in the active games
7. Verify game #28 has:
   - Field assignment (should be field #27)
   - Status 'bereit' or 'geplant'
   - A referee assigned

## Detailed Testing Procedure

### Prerequisites
- Node.js installed
- MySQL database configured
- Tournament system running on port 3003 (or configured port)

### Setup
```bash
cd /home/runner/work/KasseMultiGUI/KasseMultiGUI/turnier
npm install
node turnier.js
```

### Test Case 1: Referee Display
1. Open browser to `http://localhost:3003`
2. Navigate to admin interface
3. Select any tournament
4. Go to "Spiele" tab
5. **Expected:** See "Schiedsrichter" column in the table
6. **Expected:** Some games show referee names

### Test Case 2: Referee Assignment on Game Creation
1. Create a new Swiss tournament with at least 8 teams
2. Start the tournament
3. Check the database or admin interface
4. **Expected:** All initial games have referees assigned
5. **SQL Check:**
   ```sql
   SELECT spiel_nummer, team1_id, team2_id, feld_id, 
          schiedsrichter_name, schiedsrichter_team_id, status
   FROM turnier_spiele 
   WHERE turnier_id = ? AND runde = 1
   ORDER BY spiel_nummer;
   ```
6. **Expected:** Games with fields should have schiedsrichter_name or schiedsrichter_team_id

### Test Case 3: Admin Remark
1. Select a tournament with active games
2. Click edit (✏️) on a game
3. Enter a result (e.g., 2:1)
4. Add a custom bemerkung: "Test game"
5. Save
6. **Expected:** Bemerkung shows "Test game | Eingegeben von Turnierleitung"

### Test Case 4: Game Assignment Flow (Swiss 144)
**This is the critical test for the reported issue**

1. Ensure BVT tournament exists with:
   - Mode: swiss_144
   - 144 teams
   - 27 fields
2. Check initial game state:
   ```sql
   SELECT COUNT(*) as count, status, 
          COUNT(CASE WHEN feld_id IS NOT NULL THEN 1 END) as with_field
   FROM turnier_spiele 
   WHERE turnier_id = ? AND runde = 1
   GROUP BY status;
   ```
   **Expected:**
   - 11 games with status='geplant' and field assigned (games 17-27)
   - 53 games with status='wartend' and no field (games 28-80)
   - 16 games with status='geplant' for qualification (games 1-16)

3. Complete game #27:
   - Find game #27 in the admin interface
   - Click edit
   - Enter result: 2:0
   - Save

4. **Immediately check server console** for:
   ```
   [admin-ergebnis] Game #27 completed on field XX, assigning next waiting game
   [assignNextWaitingGame] Freed field XX, found Y waiting games
   [assignNextWaitingGame] ✓ Assigned waiting game #28 (ID: ZZ) to field XX
   ```

5. Check the admin interface (should auto-refresh):
   - Game #27 should appear in "Letzte Spiele" (history)
   - Game #28 should appear in "Aktive Spiele"
   - Game #28 should show field #27
   - Game #28 should have a referee

6. **If game #28 doesn't appear:**
   - Check server console for error messages
   - Check if assignNextWaitingGame was called
   - Verify in database:
     ```sql
     SELECT spiel_nummer, team1_id, team2_id, feld_id, status,
            schiedsrichter_name, schiedsrichter_team_id
     FROM turnier_spiele 
     WHERE turnier_id = ? AND spiel_nummer = 28;
     ```
   - Expected: feld_id should be set, status should be 'bereit'

### Test Case 5: Multiple Game Completions
1. Continue from Test Case 4
2. Complete game #28 (which should now be on field #27)
3. **Expected:** Game #29 gets assigned to field #27
4. Repeat for several more games
5. Verify the assignment chain works correctly

## Troubleshooting

### Issue: Game #28 doesn't appear after completing game #27

**Check 1: Server logs**
Look for these messages in the console:
- `[admin-ergebnis] Game #XX completed...`
- `[assignNextWaitingGame] Freed field...`

**Check 2: Database state**
```sql
-- Check waiting games
SELECT spiel_nummer, team1_id, team2_id, feld_id, status
FROM turnier_spiele 
WHERE turnier_id = ? AND status = 'wartend'
ORDER BY spiel_nummer;

-- Check if game #28 exists and has both teams
SELECT * FROM turnier_spiele 
WHERE turnier_id = ? AND spiel_nummer = 28;
```

**Check 3: Frontend refresh**
- Manually refresh the browser (F5)
- Check browser console for errors
- Verify loadSpiele() was called after saving

**Check 4: Game completion logic**
```sql
-- Verify game #27 was marked as completed
SELECT id, spiel_nummer, status, feld_id, gewinner_id
FROM turnier_spiele 
WHERE turnier_id = ? AND spiel_nummer = 27;
```
Expected: status='beendet', gewinner_id should be set

### Issue: No referee assigned to game

**Check 1: Tournament configuration**
```sql
SELECT separate_schiri_teams FROM turnier_config WHERE id = ?;
```

**Check 2: Available referees**
- If separate_schiri_teams=1, check turnier_schiedsrichter_teams table
- If separate_schiri_teams=0, check if there are free teams

**Check 3: Server logs**
Look for referee assignment messages during game creation

### Issue: Admin remark not showing

**Check 1: Database**
```sql
SELECT bemerkung FROM turnier_spiele WHERE id = ?;
```

**Check 2: Frontend**
- Verify the "Bemerkung" column exists in the table
- Check if the field is included in the SQL query

## Expected Server Log Output

When everything works correctly, you should see:

```
[admin-ergebnis] Game #27 completed on field 27, assigning next waiting game
[assignNextWaitingGame] Freed field 27, found 53 waiting games
[assignNextWaitingGame] ✓ Assigned waiting game #28 (ID: 345) to field 27
```

Then for the next game:

```
[admin-ergebnis] Game #28 completed on field 27, assigning next waiting game
[assignNextWaitingGame] Freed field 27, found 52 waiting games
[assignNextWaitingGame] ✓ Assigned waiting game #29 (ID: 346) to field 27
```

## Success Criteria

✅ All tests pass when:
1. Schiedsrichter column shows referee information
2. New games get referees automatically
3. Admin-entered results show "Eingegeben von Turnierleitung"
4. Game #28 appears immediately after completing game #27
5. Game #29 appears after completing game #28
6. All assigned games have referees
7. Server logs show proper assignment flow

## Notes

- The system is designed to handle Swiss system tournaments with many teams
- Field assignment is dynamic - as fields become free, waiting games are assigned
- Referee assignment can use either dedicated referee teams or playing teams as referees
- The frontend auto-refreshes after saving results (no manual refresh needed)
