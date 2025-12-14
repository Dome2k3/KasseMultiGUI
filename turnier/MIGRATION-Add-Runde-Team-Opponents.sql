-- ============================================
-- MIGRATION: Add runde column to team_opponents table
-- ============================================
-- This migration adds the 'runde' column to the team_opponents table
-- to track which round the match occurred in.

-- Add runde column to team_opponents table if it doesn't exist
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'team_opponents'
    AND COLUMN_NAME = 'runde'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE team_opponents ADD COLUMN runde INT NOT NULL DEFAULT 1 AFTER spiel_id',
    'SELECT "Column runde already exists in team_opponents" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration completed: runde column added to team_opponents table' as status;
