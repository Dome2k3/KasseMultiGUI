-- ============================================
-- MIGRATION: Fix Swiss 144 Placeholder Game Count
-- ============================================
-- 
-- Purpose: Fix tournaments that have 16 placeholder games instead of 8
--          (The bug created 16 placeholders when only 8 are needed for 16 winners -> 8 pairs)
-- 
-- Background:
-- - Original implementation incorrectly created 16 placeholder games
-- - Only 8 placeholder games are needed (16 qualification winners form 8 pairs)
-- - This migration removes the excess 8 placeholder games
-- 
-- IMPORTANT: 
-- - Run this AFTER the code fix is deployed
-- - Run this BEFORE completing qualification rounds in affected tournaments
-- - This only affects Swiss 144 tournaments with incomplete qualifications
-- ============================================

-- Step 1: Identify affected tournaments
-- These are Swiss 144 tournaments with 16 placeholder games instead of 8
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
  AND ts.runde = 1
  AND ts.status = 'wartend_quali'
GROUP BY tc.id, tc.turnier_name, tp.phase_name
HAVING COUNT(*) > 8;

-- Step 2: For each affected tournament, delete the excess placeholder games
-- Keep the first 8 placeholders (ordered by spiel_nummer), delete the rest

-- Note: This query uses a subquery to identify the IDs to delete
-- It keeps the first 8 placeholder games and deletes placeholders 9-16

DELETE ts FROM turnier_spiele ts
WHERE ts.id IN (
    SELECT id FROM (
        SELECT 
            ts2.id,
            ROW_NUMBER() OVER (
                PARTITION BY ts2.turnier_id, ts2.phase_id 
                ORDER BY ts2.spiel_nummer ASC
            ) as row_num
        FROM turnier_spiele ts2
        JOIN turnier_phasen tp ON ts2.phase_id = tp.id
        JOIN turnier_config tc ON ts2.turnier_id = tc.id
        WHERE tc.modus = 'swiss_144'
          AND tp.phase_name = 'Main Swiss'
          AND ts2.runde = 1
          AND ts2.status = 'wartend_quali'
    ) ranked
    WHERE row_num > 8
);

-- Step 3: Verify the fix
-- This should show only tournaments with exactly 8 placeholders
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
  AND ts.runde = 1
  AND ts.status = 'wartend_quali'
GROUP BY tc.id, tc.turnier_name, tp.phase_name;

-- Step 4: Check for any tournaments with unexpected placeholder counts
-- This should return 0 rows after the fix
SELECT 
    tc.id as turnier_id,
    tc.turnier_name,
    tp.phase_name,
    COUNT(*) as placeholder_count,
    CASE 
        WHEN COUNT(*) = 8 THEN 'CORRECT'
        WHEN COUNT(*) < 8 THEN 'TOO FEW'
        WHEN COUNT(*) > 8 THEN 'TOO MANY'
    END as status
FROM turnier_spiele ts
JOIN turnier_phasen tp ON ts.phase_id = tp.id
JOIN turnier_config tc ON ts.turnier_id = tc.id
WHERE tc.modus = 'swiss_144'
  AND tp.phase_name = 'Main Swiss'
  AND ts.runde = 1
  AND ts.status = 'wartend_quali'
GROUP BY tc.id, tc.turnier_name, tp.phase_name
HAVING COUNT(*) != 8;

-- ============================================
-- NOTES FOR TOURNAMENT ADMINISTRATORS
-- ============================================
-- 
-- After running this migration:
-- 
-- 1. All Swiss 144 tournaments should have exactly 8 placeholder games
-- 
-- 2. When qualification completes:
--    - 16 winners will be paired into 8 games
--    - These 8 games will fill the 8 placeholder slots
--    - Status will change from 'wartend_quali' to 'wartend'
--    - Teams will be assigned to team1_id and team2_id
-- 
-- 3. The tournament will have a total of 64 Main Swiss Round 1 games:
--    - 56 games with 112 seeded teams (created at tournament start)
--    - 8 games with 16 qualification winners (filled after qualification)
-- 
-- 4. If you encounter any issues:
--    - Check the server logs for qualification processing messages
--    - Verify handleQualificationComplete is being called
--    - Check that exactly 16 qualification games completed with winners
-- 
-- ============================================
