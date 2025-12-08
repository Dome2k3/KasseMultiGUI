# Testing: Batch Complete Games

## ⚠️ TEMPORARY TESTING FEATURE - TO BE REMOVED BEFORE PRODUCTION

This feature allows quickly completing multiple games for testing purposes to speed up the testing of tournament progression (especially Swiss system round transitions).

## Usage

### Endpoint
```
POST /api/turniere/:turnierId/test/batch-complete-games
```

### Parameters
- `turnierId` (path parameter): ID of the tournament
- `count` (body parameter, optional): Number of games to complete (default: 10)

### Example Request
```bash
# Complete first 10 games (default)
curl -X POST http://localhost:3004/api/turniere/1/test/batch-complete-games \
  -H "Content-Type: application/json" \
  -d '{}'

# Complete first 5 games
curl -X POST http://localhost:3004/api/turniere/1/test/batch-complete-games \
  -H "Content-Type: application/json" \
  -d '{"count": 5}'
```

### Response Example
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

## What it does

1. Fetches the first X non-completed games (ordered by round and game number)
2. Sets each game result to **2:0** (Team 1 wins)
   - Set 1: 25:20
   - Set 2: 25:20
3. Marks the result with comment: "TEST: Automatisch abgeschlossen für Testdurchlauf"
4. Automatically triggers tournament progression (next round creation if applicable)
5. Assigns waiting games to freed fields
6. Records in audit log

## Benefits for Testing

- ✅ Quickly advance through Round 1 to test Round 2 generation
- ✅ Test Swiss pairing system with completed games
- ✅ Test dynamic round progression
- ✅ No need to manually enter results for each game
- ✅ Verify field assignment logic works correctly

## Important Notes

- ⚠️ This is a **TESTING ONLY** feature
- ⚠️ Must be **REMOVED** before production deployment
- ⚠️ **NO AUTHENTICATION** - endpoint is completely unprotected
- ⚠️ Results are clearly marked as test data
- ⚠️ Always completes with Team 1 winning 2:0
- ⚠️ Only completes games with both teams assigned
- ⚠️ Count parameter limited to 1-100 games per request

## Removal Checklist

Before production deployment, remove:
- [ ] Endpoint `/api/turniere/:turnierId/test/batch-complete-games` from turnier.js
- [ ] "TESTING FUNCTIONS" section from turnier.js (lines ~2850-2946)
- [ ] This documentation file (TESTING-BATCH-COMPLETE.md)
