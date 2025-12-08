# Dynamic Swiss Round Progression

## Overview

This feature enables asynchronous continuation of Swiss tournament rounds without waiting for all games in the current round to complete. Once a configurable threshold of teams have finished their games, the system automatically creates pairings for the next round and assigns them to available fields.

## Features

### 1. Partial Round Generation
- Creates next-round pairings when a threshold percentage of teams have finished
- Default threshold: 50% (configurable via `DYNAMIC_SWISS_THRESHOLD`)
- Prevents duplicate team assignments
- Maintains Swiss pairing rules and avoids rematches

### 2. Field Assignment
- Automatically assigns games to free fields
- Games without fields are marked as `wartend` (waiting)
- Prioritizes field assignment for earlier pairings

### 3. Referee Assignment
- Automatically assigns referee teams to games with fields
- Supports both dedicated referee teams and playing teams as referees

### 4. Hobby Cup Interleaving (Swiss 144)
- Creates Hobby Cup games for qualification losers
- Interleaves Hobby Cup games with main Swiss games
- Assigns available fields to both brackets

### 5. Full-Round Compatibility
- Integrates seamlessly with existing full-round completion
- Completes remaining pairings when round finishes
- Prevents duplicate game creation

## Configuration

### Environment Variables

Add these to your `.env` or `Umgebung.env` file:

```bash
# Enable detailed debug logging for Swiss progression
DEBUG_SWISS=true

# Set the threshold for dynamic progression (0.0 to 1.0)
# Default: 0.5 (50% of teams must finish before creating next round)
DYNAMIC_SWISS_THRESHOLD=0.5
```

### Threshold Recommendations

- **0.3 (30%)**: Very aggressive - creates pairings early, maximizes parallelism
- **0.5 (50%)**: Balanced - recommended default
- **0.7 (70%)**: Conservative - waits for most teams, reduces partial rounds
- **1.0 (100%)**: Disables dynamic progression - uses full-round mode only

## How It Works

### Process Flow

1. **Game Completion**: When a Swiss game completes, `progressSwissTournament()` is called
2. **Dynamic Check**: `tryDynamicSwissProgression()` is invoked for rounds 1+
3. **Threshold Check**: System checks if enough teams (≥ threshold) have finished
4. **Ready Teams**: Identifies teams that completed their current round game
5. **Unpaired Filter**: Filters out teams already paired in the next round
6. **Swiss Standings**: Updates standings with current scores and Buchholz
7. **Pairing Computation**: Uses `computeSwissPairings()` to pair ready teams
8. **Game Creation**: Creates games with field assignments via `createSwissGames()`
9. **Referee Assignment**: Assigns referees to games with fields
10. **Opponent Tracking**: Records opponent relationships

### Safety Mechanisms

- **Duplicate Prevention**: Checks if teams already have games in next round
- **Idempotent Design**: Can be called multiple times without creating duplicates
- **Rematch Avoidance**: Uses opponent history to prevent rematches
- **Fallback Mode**: If pairing fails, allows fallback with rematch warnings

## Database Changes

### Required Tables
All required tables already exist in the schema:
- `turnier_spiele` - Game records
- `turnier_teams` - Team standings and scores
- `team_opponents` - Opponent history
- `turnier_felder` - Field management
- `turnier_phasen` - Tournament phases

### Optional Indexes
For better performance with large tournaments, run the migration:

```sql
-- See MIGRATION-Dynamic-Swiss-Indexes.sql
ALTER TABLE turnier_spiele 
ADD INDEX idx_team_round_lookup (turnier_id, phase_id, runde, team1_id, team2_id);

ALTER TABLE turnier_spiele
ADD INDEX idx_finished_teams (turnier_id, phase_id, runde, status);
```

## API Functions

### Core Functions

#### `tryDynamicSwissProgression(turnierId, phaseId, currentRunde)`
Main entry point for dynamic progression. Called after each game completion in Swiss modes.

**Parameters:**
- `turnierId`: Tournament ID
- `phaseId`: Current phase ID
- `currentRunde`: Current round number

**Behavior:**
- Returns early if threshold not met
- Returns early if not enough unpaired teams
- Creates partial pairings and games

#### `getReadyTeamsForRound(turnierId, phaseId, currentRunde)`
Returns array of team IDs that have finished their game in the current round.

#### `getUnpairedTeamsInRound(turnierId, phaseId, nextRunde)`
Returns Set of team IDs that already have a game in the next round.

#### `createSwissGames(turnierId, phaseId, nextRunde, pairings, felder)`
Creates game records from pairings with field assignments, referee assignment, and opponent tracking.

**Returns:** Array of created games with metadata:
```javascript
[
  { spielId: 123, spielNummer: 45, feldId: 3, status: 'geplant' },
  { spielId: 124, spielNummer: 46, feldId: null, status: 'wartend' }
]
```

## Usage Examples

### Example 1: Standard Swiss Tournament
```javascript
// Tournament with 32 teams, 4 fields
// Round 1: 16 games created at start
// As games finish, when 16 teams (50%) are done:
//   - Create 8 games for Round 2 with ready teams
//   - Assign 4 to fields, 4 to waiting
// When Round 1 fully completes:
//   - Create remaining 8 games for remaining teams
```

### Example 2: Swiss 144 Tournament
```javascript
// Qualification: 32 teams, 16 games
// When qualification completes:
//   - 16 winners marked for main Swiss
//   - 16 losers paired for Hobby Cup Round 1
// Main Swiss Round 1: 128 teams, 64 games
// As Round 1 progresses (64 teams done = 50%):
//   - Create 32 Round 2 games for ready teams
//   - Interleave with Hobby Cup games
// Fields assigned dynamically to both brackets
```

## Monitoring and Debugging

### Debug Logs

When `DEBUG_SWISS=true`, the system logs:

```
[Dynamic Swiss] Round 1: 16/32 teams finished (threshold: 16)
[Dynamic Swiss] Threshold reached - pairing 16 teams for round 2
[Dynamic Swiss] Generated 8 pairings for round 2 { rematchCount: 0 }
[Dynamic Swiss] Created 8 games for round 2
  - Game #45: field=3, status=geplant
  - Game #46: field=4, status=geplant
  - Game #47: field=null, status=wartend
  ...
[Hobby Cup] Generated 8 games, assigned 2 to fields
```

### Monitoring Queries

Check progress of dynamic progression:

```sql
-- See games created dynamically vs full-round
SELECT runde, 
       COUNT(*) as total_games,
       SUM(CASE WHEN status = 'geplant' THEN 1 ELSE 0 END) as on_fields,
       SUM(CASE WHEN status = 'wartend' THEN 1 ELSE 0 END) as waiting
FROM turnier_spiele
WHERE turnier_id = ?
GROUP BY runde
ORDER BY runde;

-- Check which teams are ready but unpaired
SELECT t.id, t.team_name, t.swiss_score
FROM turnier_teams t
WHERE t.turnier_id = ?
  AND t.id IN (
    SELECT DISTINCT team1_id FROM turnier_spiele 
    WHERE turnier_id = ? AND runde = 1 AND status = 'beendet'
  )
  AND t.id NOT IN (
    SELECT DISTINCT team1_id FROM turnier_spiele 
    WHERE turnier_id = ? AND runde = 2 AND team1_id IS NOT NULL
    UNION
    SELECT DISTINCT team2_id FROM turnier_spiele 
    WHERE turnier_id = ? AND runde = 2 AND team2_id IS NOT NULL
  )
ORDER BY t.swiss_score DESC, t.buchholz DESC;
```

## Testing

### Manual Testing Checklist

1. **Basic Swiss Tournament**
   - [ ] Create tournament with `modus='swiss'`, 32 teams
   - [ ] Start tournament
   - [ ] Complete 8 games (16 teams = 50%)
   - [ ] Verify 8 Round 2 games created dynamically
   - [ ] Complete remaining Round 1 games
   - [ ] Verify remaining Round 2 games created

2. **Swiss 144 Tournament**
   - [ ] Create tournament with `modus='swiss_144'`, 144 teams
   - [ ] Start tournament (creates qualification + main games)
   - [ ] Complete qualification games
   - [ ] Verify Hobby Cup games created
   - [ ] Complete 64 Main Swiss Round 1 games (50%)
   - [ ] Verify Round 2 games created dynamically

3. **Edge Cases**
   - [ ] Odd number of teams (bye handling)
   - [ ] All teams finish simultaneously
   - [ ] Threshold exactly at minimum
   - [ ] No free fields available

## Troubleshooting

### Issue: No dynamic games created
**Check:**
- `DEBUG_SWISS=true` to see log messages
- Threshold is appropriate (not too high)
- Tournament mode is `swiss` or `swiss_144`
- Current round is ≥ 1 (not round 0)

### Issue: Duplicate games for teams
**Check:**
- Safety checks in `createSwissGames()` should prevent this
- Check logs for "Skipping duplicate" messages
- Verify `team_opponents` table is populated

### Issue: Rematches occurring
**Check:**
- Swiss standings are being updated correctly
- Opponent tracking in `team_opponents` table
- `allowFallback` option in pairing config
- Check rematchCount in debug logs

## Performance Considerations

- **Small tournaments (< 50 teams)**: Minimal impact, indexes optional
- **Medium tournaments (50-100 teams)**: Recommended to add indexes
- **Large tournaments (100+ teams)**: Indexes strongly recommended
- **Very large tournaments (200+ teams)**: Consider increasing threshold to reduce DB load

## Future Enhancements

Potential improvements for future versions:
- Adaptive thresholds based on field availability
- Priority queuing for high-score teams
- Machine learning for optimal threshold calculation
- Real-time field reallocation
- Multi-phase parallel progression

## Support

For issues or questions:
1. Enable `DEBUG_SWISS=true` and check logs
2. Review this documentation
3. Check database indexes are created
4. Verify environment variables are set correctly
