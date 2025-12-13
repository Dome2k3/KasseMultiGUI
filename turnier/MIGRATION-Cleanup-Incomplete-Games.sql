-- ============================================
-- MIGRATION: Cleanup Incomplete Games in Swiss 144 Tournaments
-- ============================================
-- 
-- Purpose: Fix existing Swiss 144 tournaments that have incomplete games
--          (games with team1_id but team2_id IS NULL and not marked as bye)
-- 
-- Background:
-- - Bug in original startSwiss144Tournament created Main Swiss Round 1 
--   with only 112 teams instead of 128 (missing 16 qualification winners)
-- - Some pairing algorithm calls created games with only team1_id set
-- - These incomplete games block round progression
-- 
-- UPDATE: With the new parallel optimization, Main Swiss Round 1 now includes
--         16 placeholder games with status 'wartend_quali' that have NULL teams
--         until qualification completes. These should NOT be deleted.
-- 
-- This migration:
-- 1. Identifies incomplete games (team2_id IS NULL, status NOT IN ('beendet', 'wartend_quali'))
-- 2. Deletes incomplete Main Swiss games from Swiss 144 tournaments
-- 3. Cleans up related opponent tracking records
-- 
-- IMPORTANT: Run this BEFORE completing qualification rounds in affected tournaments
--            The fixed code will recreate Main Swiss Round 1 properly after qualification
-- ============================================

-- Step 1: Report affected tournaments and games (excluding placeholder games)
SELECT 
    tc.id as turnier_id,
    tc.turnier_name,
    tp.id as phase_id,
    tp.phase_name,
    ts.runde,
    COUNT(*) as incomplete_games
FROM turnier_spiele ts
JOIN turnier_phasen tp ON ts.phase_id = tp.id
JOIN turnier_config tc ON ts.turnier_id = tc.id
WHERE tc.modus = 'swiss_144'
  AND ts.team2_id IS NULL
  AND ts.status NOT IN ('beendet', 'wartend_quali')
  AND tp.phase_name = 'Main Swiss'
GROUP BY tc.id, tc.turnier_name, tp.id, tp.phase_name, ts.runde
ORDER BY tc.id, ts.runde;

-- Step 2: Clean up opponent tracking for incomplete games
-- (Remove opponent records for games that will be deleted)
-- Note: Placeholder games with 'wartend_quali' don't have opponents yet, so they're safe
DELETE FROM team_opponents
WHERE turnier_id IN (
    SELECT DISTINCT tc.id
    FROM turnier_config tc
    JOIN turnier_spiele ts ON ts.turnier_id = tc.id
    JOIN turnier_phasen tp ON ts.phase_id = tp.id
    WHERE tc.modus = 'swiss_144'
      AND tp.phase_name = 'Main Swiss'
      AND ts.team2_id IS NULL
      AND ts.status NOT IN ('beendet', 'wartend_quali')
)
AND spiel_id IN (
    SELECT ts.id
    FROM turnier_spiele ts
    JOIN turnier_phasen tp ON ts.phase_id = tp.id
    WHERE tp.phase_name = 'Main Swiss'
      AND ts.team2_id IS NULL
      AND ts.status NOT IN ('beendet', 'wartend_quali')
);

-- Step 3: Delete incomplete Main Swiss games from Swiss 144 tournaments
-- BACKUP RECOMMENDED: Consider backing up turnier_spiele table before running this
-- Note: This preserves placeholder games with status 'wartend_quali'
DELETE ts FROM turnier_spiele ts
JOIN turnier_phasen tp ON ts.phase_id = tp.id
JOIN turnier_config tc ON ts.turnier_id = tc.id
WHERE tc.modus = 'swiss_144'
  AND tp.phase_name = 'Main Swiss'
  AND ts.team2_id IS NULL
  AND ts.status NOT IN ('beendet', 'wartend_quali');

-- Step 4: Verify cleanup
-- This should return 0 rows after cleanup (excluding placeholder games)
SELECT 
    tc.id as turnier_id,
    tc.turnier_name,
    tp.phase_name,
    ts.id as spiel_id,
    ts.spiel_nummer,
    ts.runde,
    ts.team1_id,
    ts.team2_id,
    ts.status
FROM turnier_spiele ts
JOIN turnier_phasen tp ON ts.phase_id = tp.id
JOIN turnier_config tc ON ts.turnier_id = tc.id
WHERE tc.modus = 'swiss_144'
  AND tp.phase_name = 'Main Swiss'
  AND ts.team2_id IS NULL
  AND ts.status NOT IN ('beendet', 'wartend_quali');

-- Step 5: Report placeholder games (for information only - these are correct)
SELECT 
    tc.id as turnier_id,
    tc.turnier_name,
    tp.phase_name,
    COUNT(*) as placeholder_count
FROM turnier_spiele ts
JOIN turnier_phasen tp ON ts.phase_id = tp.id
JOIN turnier_config tc ON ts.turnier_id = tc.id
WHERE tc.modus = 'swiss_144'
  AND tp.phase_name = 'Main Swiss'
  AND ts.status = 'wartend_quali'
GROUP BY tc.id, tc.turnier_name, tp.phase_name;

-- ============================================
-- NOTES FOR TOURNAMENT ADMINISTRATORS
-- ============================================
-- 
-- After running this migration:
-- 
-- 1. For new tournaments (with parallel optimization):
--    - Will create 16 qualification games
--    - Will create 56 Main Swiss games with 112 seeded teams
--    - Will create 8 placeholder games with status 'wartend_quali'
--    - When qualification completes, placeholders are filled with 16 winners (8 pairs)
-- 
-- 2. For tournaments where qualification is already complete:
--    - The code will NOT automatically recreate Main Swiss Round 1
--    - You may need to manually trigger round creation or restart the tournament
-- 
-- 3. For tournaments where qualification is still in progress:
--    - The fixed code will automatically fill placeholder games when qualification completes
--    - This will include all 128 teams (112 seeded + 16 qualification winners)
-- 
-- 4. To verify a tournament is ready after cleanup:
--    - Check qualification games: 
--      SELECT COUNT(*) FROM turnier_spiele ts
--      JOIN turnier_phasen tp ON ts.phase_id = tp.id
--      WHERE ts.turnier_id = ? AND tp.phase_name = 'Qualification';
--    
--    - Should show 16 games (32 teams)
--    
--    - Check Main Swiss games:
--      SELECT status, COUNT(*) FROM turnier_spiele ts
--      JOIN turnier_phasen tp ON ts.phase_id = tp.id
--      WHERE ts.turnier_id = ? AND tp.phase_name = 'Main Swiss' AND runde = 1
--      GROUP BY status;
--    
--    - Before qualification: Should show 56 games (various status) + 8 'wartend_quali'
--    - After qualification: Should show 64 games (no 'wartend_quali'), all with teams
-- 
-- ============================================
