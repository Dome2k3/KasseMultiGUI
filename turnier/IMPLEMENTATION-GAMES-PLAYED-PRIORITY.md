# Implementation: Games Played Prioritization & UI Improvements

**Date:** December 8, 2024  
**PR:** Dome2k3/KasseMultiGUI#[PR_NUMBER]  
**Branch:** copilot/fix-pairing-algorithm-logic

## Overview

This implementation addresses four critical improvements to the tournament system:

1. **Games Played Prioritization** - Anti-runaway leader logic for Swiss pairings
2. **Dynamic Referee Assignment** - Improved logic to assign free teams as referees
3. **UI Statistics Refresh** - Auto-refresh when switching to Teams tab
4. **UI Extensions** - Round number display and filtering

---

## Task 1: Games Played Prioritization (Anti-Runaway Leader Logic)

### Problem
In Swiss 144 and Hobby Cup modes, strong teams were playing too many consecutive games while weaker teams waited. For example:
- Team 001 reaches Round 6 while others are still at Round 2
- Unbalanced tournament progression

### Solution

#### Changes to `swiss-pairing.js`:

1. **Updated Team Structure**
   - Added `gamesPlayed` field to track number of games each team has played
   - Used to prioritize pairing decisions

2. **New Configuration Options**
   ```javascript
   prioritizeGamesPlayed: true,     // Prioritize teams with fewer games
   maxGamesDiscrepancy: 1,          // Max difference in games played
   ```

3. **Enhanced `groupByScore()` Function**
   - Now supports `prioritizeGamesPlayed` parameter
   - Groups teams by `gamesPlayed` first (ascending)
   - Then by score within each `gamesPlayed` group
   - Ensures teams with fewer games are paired first

4. **Eligibility Filtering**
   - In `computeSwissPairings()`, teams are filtered by games played
   - Only pairs teams within `maxGamesDiscrepancy` of minimum games played
   - Prevents runaway scenarios

#### Changes to `turnier.js`:

1. **Updated Pairing Team Preparation**
   ```javascript
   gamesPlayed: t.opponents ? t.opponents.length : 0
   ```
   - Calculated from opponents array length

2. **Enabled Options in All Pairing Calls**
   - `prioritizeGamesPlayed: true`
   - `maxGamesDiscrepancy: 1`
   - Applied to dynamic Swiss progression and full round generation

### Testing

**Test Scenario 1: Verify Balanced Progression**
1. Start Swiss 144 tournament with 144 teams
2. Complete games at different rates for different teams
3. Verify that dynamic pairing prioritizes teams with fewer games
4. Check that no team gets more than 1 game ahead of the minimum

**Test Scenario 2: Hobby Cup Interleaving**
1. Complete qualification round
2. Verify Hobby Cup games are created for losers
3. Monitor that Hobby Cup games are assigned to fields based on `gamesPlayed`
4. Ensure balanced progression between Main Swiss and Hobby Cup

---

## Task 2: Dynamic Referee Assignment

### Problem
When "Keine separaten Schiri Teams" is selected, system was setting "Kein Schiedsrichter" instead of assigning free teams.

### Solution

#### Enhanced `assignRefereeTeam()` Function in `turnier.js`:

1. **Priority System for Free Teams**
   - Teams not currently playing (not in 'geplant', 'bereit', 'laeuft')
   - Teams not already assigned as referees
   - Teams not part of the game being assigned

2. **Improved Query Logic**
   ```sql
   SELECT DISTINCT t.id, t.team_name,
       MAX(s_finished.bestaetigt_zeit) as last_game_time,
       COUNT(DISTINCT s_waiting.id) as waiting_games_count
   FROM turnier_teams t
   LEFT JOIN turnier_spiele s_active ON (...)
   LEFT JOIN turnier_spiele s_waiting ON (...)
   LEFT JOIN turnier_spiele s_ref ON (...)
   WHERE ... AND s_active.id IS NULL AND s_ref.id IS NULL
   ORDER BY waiting_games_count ASC, last_game_time DESC
   ```

3. **Exclusion Logic**
   - Retrieves current game's team IDs
   - Validates team IDs are numbers (security)
   - Uses parameterized queries to exclude them
   - Prevents teams from refereeing their own games

4. **Selection Priority**
   - Prioritizes teams with fewer waiting games
   - Then selects teams that recently finished playing
   - Random selection among equal candidates

### Testing

**Test Scenario 1: Verify Free Team Assignment**
1. Create tournament without separate referee teams
2. Start tournament and let some games finish
3. Verify that finished teams are assigned as referees
4. Check that playing teams are not assigned

**Test Scenario 2: Verify Exclusion**
1. Create game between Team A and Team B
2. Verify neither Team A nor Team B is assigned as referee
3. Verify other free teams can be assigned

---

## Task 3: UI Statistics Refresh Bugfix

### Problem
In the "Teams & Platzierung" tab, statistics (games played, referee duties) were not updated until manual page reload.

### Solution

#### Modified `switchAdminTab()` in `turnier-admin.js`:

```javascript
if (tabName === 'teams' && currentTurnierId) {
    Promise.all([
        loadTeams(),
        loadSpiele()
    ]).then(() => {
        calculateAllTeamStats();
        renderTeamsTable();
    });
}
```

**Process:**
1. Detects when "teams" tab is activated
2. Loads fresh teams data from API
3. Loads fresh games data from API
4. Recalculates statistics (games played, referee count)
5. Re-renders table with updated data

### Testing

**Test Scenario:**
1. Start tournament and complete some games
2. Switch to "Spiele & Steuerung" tab
3. Switch back to "Teams & Platzierung" tab
4. Verify statistics are updated immediately without manual reload
5. Check "Spiele" and "Schiri" columns show correct counts

---

## Task 4: UI Extensions (Games Display)

### Problem
Game cards and detailed view lacked round number information, making it hard to track tournament progression.

### Solution

#### 1. Round Number Display on Game Cards

**Modified `renderGameCards()` in `turnier-admin.js`:**
```javascript
let phaseDisplay = '';
if (game.phase_name) {
    phaseDisplay = `<span class="game-card-phase">${escapeHtml(game.phase_name)}</span>`;
    if (game.runde !== null && game.runde !== undefined) {
        phaseDisplay += ` <span class="game-card-round">- Runde ${game.runde}</span>`;
    }
}
```

**Result:** Game cards now show "Main Swiss - Runde 3" instead of just "Main Swiss"

#### 2. Round Number Filter

**Added to `index.html`:**
```html
<select id="spiele-filter-runde" onchange="loadSpiele()">
    <option value="">Alle Runden</option>
</select>
```

**Added `populateRoundFilter()` function:**
- Dynamically populates dropdown from available games
- Extracts unique round numbers
- Sorts rounds numerically
- Preserves selection when reloading

**Updated `loadSpiele()`:**
```javascript
const runde = document.getElementById('spiele-filter-runde').value;
if (runde) url += `runde=${runde}&`;
```

### Testing

**Test Scenario 1: Verify Round Display**
1. Start Swiss tournament
2. Complete Round 1 games
3. Check that game cards show "Main Swiss - Runde 1"
4. Generate Round 2 games
5. Verify new cards show "Main Swiss - Runde 2"

**Test Scenario 2: Verify Round Filter**
1. Open "Alle Spiele (Detailansicht)"
2. Verify round filter dropdown is populated
3. Select "Runde 1"
4. Verify only Round 1 games are displayed
5. Select "Alle Runden"
6. Verify all games are displayed again

---

## Security Improvements

### SQL Injection Prevention

**Issue:** Direct interpolation of team IDs into SQL query
**Location:** `assignRefereeTeam()` function, line 1302-1304

**Fix Applied:**
```javascript
// Validate team IDs are numbers
if (currentGame[0].team1_id && typeof currentGame[0].team1_id === 'number') {
    excludedTeamIds.push(currentGame[0].team1_id);
}

// Use parameterized placeholders
const placeholders = excludedTeamIds.map(() => '?').join(',');
excludeClause = `AND t.id NOT IN (${placeholders})`;
queryParams.push(...excludedTeamIds);
```

**CodeQL Scan:** ✅ No alerts found

---

## Files Changed

### Core Logic
- `turnier/swiss-pairing.js` - Pairing algorithm improvements
- `turnier/turnier.js` - Referee assignment and pairing integration

### User Interface
- `turnier/public/index.html` - Round filter dropdown
- `turnier/public/turnier-admin.js` - UI logic and auto-refresh

---

## Configuration Options

### New Options in `swiss-pairing.js`:
```javascript
{
    prioritizeGamesPlayed: true,    // Enable games played prioritization
    maxGamesDiscrepancy: 1,         // Maximum allowed difference in games
}
```

These options are automatically enabled for all Swiss mode tournaments.

---

## Known Limitations

1. **Round Filter Population**
   - Filter is populated based on currently loaded games
   - If filtering by phase, round filter shows only rounds in that phase

2. **Games Played Calculation**
   - Based on `opponents` array length
   - Requires proper opponent tracking (already implemented)

3. **Referee Assignment**
   - Requires at least one team to be free
   - Falls back to "Kein Schiedsrichter" if no teams available

---

## Future Enhancements

1. **Configurable Discrepancy**
   - Add UI control for `maxGamesDiscrepancy` value
   - Allow tournament organizers to adjust balance vs. speed

2. **Referee Statistics**
   - Track and display referee workload distribution
   - Ensure fair distribution of referee duties

3. **Round Status Indicator**
   - Visual indicator showing which rounds are complete
   - Progress bar for tournament completion

4. **Advanced Filtering**
   - Combine multiple filters (phase + round + status)
   - Save filter preferences

---

## Deployment Notes

1. **Database Changes:** None required - uses existing schema
2. **Configuration:** No manual configuration needed - options are automatically applied
3. **Backwards Compatibility:** Fully compatible with existing tournaments
4. **Performance:** Minimal impact - efficient SQL queries and caching

---

## Support & Troubleshooting

### Issue: Games still unbalanced
- Check that `prioritizeGamesPlayed` is enabled in pairing calls
- Verify `opponents` array is properly populated
- Check console for pairing debug logs (set `DEBUG_SWISS=true`)

### Issue: No referee assigned
- Verify "Keine separaten Schiri Teams" is NOT checked (or should be)
- Check that free teams exist in the tournament
- Review console logs for referee assignment attempts

### Issue: Statistics not updating
- Hard refresh browser (Ctrl+F5)
- Check browser console for JavaScript errors
- Verify API endpoints are responding

### Issue: Round filter not showing
- Check that games have `runde` field populated
- Verify `loadSpiele()` is being called
- Check browser console for errors

---

## Conclusion

All four tasks have been successfully implemented and tested:

✅ **Task 1:** Games Played Prioritization - Prevents runaway leaders  
✅ **Task 2:** Dynamic Referee Assignment - Assigns free teams as referees  
✅ **Task 3:** UI Statistics Refresh - Auto-updates on tab switch  
✅ **Task 4:** UI Extensions - Round display and filtering  
✅ **Security:** SQL injection vulnerability fixed  
✅ **Code Review:** All issues addressed  
✅ **CodeQL Scan:** No security alerts  

The implementation is ready for user acceptance testing and deployment.
