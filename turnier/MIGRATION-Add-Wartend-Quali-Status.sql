-- ============================================
-- MIGRATION: Add 'wartend_quali' status to turnier_spiele
-- ============================================
-- 
-- Purpose: Add new status value 'wartend_quali' for placeholder games
--          that are waiting for qualification winners
-- 
-- Background:
-- - Swiss 144 optimization: Start Main Swiss Round 1 in parallel with Qualification
-- - 112 seeded teams start immediately on available fields
-- - 16 placeholder games wait for qualification winners
-- - New status 'wartend_quali' marks these placeholder games
-- 
-- This migration:
-- 1. Adds 'wartend_quali' to the status ENUM in turnier_spiele
-- 
-- IMPORTANT: Run this migration before starting new Swiss 144 tournaments
--            with the parallel optimization feature
-- ============================================

-- Add 'wartend_quali' to the status ENUM
ALTER TABLE turnier_spiele 
MODIFY COLUMN status ENUM('geplant', 'bereit', 'laeuft', 'beendet', 'abgesagt', 'wartend_bestaetigung', 'wartend', 'wartend_quali') DEFAULT 'geplant';

-- Verify the change
SHOW COLUMNS FROM turnier_spiele LIKE 'status';

-- ============================================
-- NOTES
-- ============================================
-- 
-- After running this migration:
-- 
-- 1. New Swiss 144 tournaments will:
--    - Create 16 qualification games on fields 1-16
--    - Create 56 Main Swiss games (112 teams) with 11 on fields 17-27
--    - Create 16 placeholder games with status 'wartend_quali'
--    - When qualification completes, fill placeholders with 16 winners
-- 
-- 2. The 'wartend_quali' status means:
--    - Game is created but teams are not yet assigned
--    - Waiting for qualification round to complete
--    - Will be updated with team1_id, team2_id when qualification finishes
-- 
-- 3. These games should be excluded from:
--    - Round completion checks (don't count as incomplete)
--    - Field assignment (no field until teams are assigned)
--    - Team availability checks (teams aren't assigned yet)
-- 
-- ============================================
