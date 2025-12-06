# Swiss Tournament System - Documentation

## Overview

The Swiss tournament system has been implemented to support tournaments with up to 144 teams, maintaining a controlled and fair competitive environment where all teams play until the end.

## Tournament Modes

### 1. Bracket Modes (Original)
- **Seeded**: Traditional bracket with teams seeded by position
- **Random**: Traditional bracket with random pairing

### 2. Swiss Standard
- All teams play each round until the end
- No elimination
- Teams paired based on current scores
- Rematch avoidance

### 3. Swiss 144 (Special Mode)
Designed for 144 teams with the following structure:
- **32 Bundesliga Teams (Class A)**: Top-seeded teams (seeds 1-32)
- **80 Regular Teams (Class B/C/E)**: Mid-seeded teams (seeds 33-112)
- **32 Hobby Teams (Class D)**: Lower-seeded teams (seeds 113-144)

## Swiss 144 Tournament Flow

### Phase 1: Qualification Round (Round 0)
- **Participants**: 32 Hobby/Class D teams
- **Format**: 16 matches (single elimination for this round only)
- **Field Assignment**: Fields 1-16
- **Duration**: 1 time slot
- **Results**:
  - 16 winners qualify for the main field
  - 16 losers move to Hobby Cup (separate parallel tournament)

### Phase 2: Main Field Setup
- **Participants**: 128 teams total
  - 32 Bundesliga teams (seeds 1-32)
  - 80 Regular teams (seeds 33-112)
  - 16 Qualification winners
- **Format**: Controlled Swiss System over 7 rounds

### Round 1 - Dutch/FIDE Seeding
To prevent top teams from meeting early:
- Split field into two halves: Top 64 (seeds 1-64) vs Bottom 64 (seeds 65-128)
- Pairing examples:
  - Team 1 (Bundesliga #1) plays Team 65
  - Team 32 (Bundesliga #32) plays Team 96
  - Team 64 plays Team 128
- **Field Assignment**: 
  - Fields 17-27 (11 fields) get first matches
  - Remaining 53 matches wait for fields

### Rounds 2-7 - Score-Based Pairing
After each round:
1. Update standings (1 point per win)
2. Calculate Buchholz scores (sum of opponents' scores)
3. Group teams by score
4. Pair within score groups using:
   - **Half-split heuristic**: Stronger teams in group play weaker teams
   - **Rematch avoidance**: Never pair teams that already played
   - **Greedy repair**: Fix rematches by swapping pairs
   - **Iterative backtracking**: Fallback if repair fails

## Field Assignment Strategy

### Initial Assignment (Round 0 + Round 1)
- **Fields 1-16**: Qualification matches (16 games)
- **Fields 17-27**: First 11 main field matches (parallel with qualification)
- **Waiting queue**: Remaining 53 main field matches

### Dynamic Assignment (Rounds 2-7)
As games complete:
1. Field becomes available
2. Next waiting game assigned automatically
3. Game status changes from "wartend" to "geplant"
4. Teams are notified (if email enabled)

## Pairing Algorithm Details

### Round 1: Dutch Seeding
```javascript
sorted_teams = sort_by_seed(teams)  // 1-128
top_half = sorted_teams[0:64]      // Seeds 1-64
bottom_half = sorted_teams[64:128]  // Seeds 65-128

pairings = []
for i in range(64):
    pairings.add(top_half[i] vs bottom_half[i])
```

### Rounds 2+: Swiss Pairing
```javascript
// 1. Group teams by score
score_groups = group_by_score(teams)

// 2. Pair within each group
for group in score_groups:
    sort_by_buchholz_and_seed(group)
    
    // Half-split: top half plays bottom half when possible
    top = group[0:len(group)/2]
    bottom = group[len(group)/2:end]
    
    for team_a in top:
        find best opponent from bottom who:
            - hasn't played team_a before
            - minimizes rating difference (balanced game)
```

### Rematch Avoidance
- **Tracking**: `team_opponents` table stores all previous matches
- **Greedy Repair**: Try swapping pairs to eliminate rematches
  - Example: (A,B) + (C,D) → (A,C) + (B,D) if valid
- **Iterative Backtracking**: Try different pairing orders with time limit
- **Fallback**: If no perfect solution in time limit, minimize rematches

## Standings Calculation

### After Each Game
1. **Winner**: +1 point to `swiss_score`
2. **Loser**: 0 points added
3. **Buchholz Update**: For each team, sum opponents' scores
4. **Ranking**: Sort by:
   1. Swiss score (descending)
   2. Buchholz (descending - tiebreaker)
   3. Initial seed (ascending - second tiebreaker)

### API Endpoints
- **Get Swiss Standings**: `GET /api/turniere/:id/swiss-standings`
- **Current Games**: `GET /api/turniere/:id/spiele?runde=X`
- **Upcoming Games**: `GET /api/turniere/:id/vorschau`

## Configuration Requirements

### For Swiss 144 Mode
- **Teams**: 140-144 teams (flexible range for withdrawals)
- **Fields**: Minimum 16 (recommended 27)
- **Classes**: Must have Class A (Bundesliga) and Class D (Hobby) teams
- **Time Slots**: Calculate based on:
  - Qualification: 1 slot
  - Round 1: ~6 slots (64 matches on 27 fields = 3 slots + buffer)
  - Rounds 2-7: ~4-5 slots each

### Performance Settings
- **Pairing Time Limit**: 3 seconds (configurable)
- **Repair Time Limit**: 1.5 seconds (configurable)
- **Max Iterations**: 20,000 (configurable)

## Usage Example

### Creating a Swiss 144 Tournament
1. **Setup**:
   - Tournament Mode: "Swiss 144"
   - Teams: Import 144 teams with proper classes
   - Fields: Configure 27 fields (minimum 16)

2. **Team Assignment**:
   - Assign seeds 1-32 to Bundesliga teams (Class A)
   - Assign seeds 33-112 to regular teams
   - Assign seeds 113-144 to Hobby teams (Class D)

3. **Start Tournament**:
   - Click "Start Tournament"
   - System automatically:
     - Creates 16 qualification matches
     - Creates Round 1 main field pairings
     - Assigns fields optimally

4. **During Tournament**:
   - Referees submit results via mobile view
   - System auto-assigns next games to freed fields
   - After each complete round, next round auto-generates
   - View standings in real-time

## Technical Implementation

### Key Files
- `swiss-pairing.js`: Core pairing engine
- `turnier.js`: Tournament logic and API
- `SQL-Setup-Turnier.sql`: Database schema with Swiss fields

### Database Tables
- `turnier_teams`: Extended with `swiss_score`, `buchholz`, `initial_seed`
- `team_opponents`: Tracks all match history for rematch avoidance
- `turnier_spiele`: Games with `runde` field for Swiss rounds

### Security
- All endpoints use rate limiting
- Input validation on team counts and scores
- Opponent tracking prevents manipulation
- Audit logging for all changes

## Best Practices

1. **Pre-Tournament**:
   - Import all teams before starting
   - Verify class assignments (A for Bundesliga, D for Hobby)
   - Test field availability

2. **During Tournament**:
   - Complete all games in a round before advancing
   - Verify results before confirmation
   - Monitor standings for errors

3. **Post-Tournament**:
   - Export final standings
   - Calculate final rankings with Buchholz tiebreakers
   - Archive results

## Troubleshooting

### Issue: Rematches Still Occur
- **Cause**: Time limit exceeded or impossible pairing
- **Solution**: Increase time limits in config or reduce team count

### Issue: Qualification Not Complete
- **Cause**: Not all 16 quali games finished
- **Solution**: Check for missing results, complete manually if needed

### Issue: Slow Pairing Generation
- **Cause**: Large number of constraints
- **Solution**: Normal for later rounds; wait or increase time limits

## Future Enhancements

- Hobby Cup automatic generation
- Multi-day tournament support
- Live standings display
- Automated email notifications for next round
- Export to common Swiss formats (Swissmaster, etc.)
