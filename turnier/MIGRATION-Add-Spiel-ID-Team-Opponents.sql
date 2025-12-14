-- ============================================
-- MIGRATION: Add spiel_id column to team_opponents table
-- Run this on existing databases to add spiel_id tracking
-- ============================================

-- Add spiel_id column to team_opponents table if it doesn't exist
SET @column_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'team_opponents'
    AND COLUMN_NAME = 'spiel_id'
);

SET @sql = IF(@column_exists = 0, 
    'ALTER TABLE team_opponents ADD COLUMN spiel_id INT DEFAULT NULL AFTER opponent_id',
    'SELECT "Column spiel_id already exists in team_opponents" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint for spiel_id if it doesn't exist
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'team_opponents'
    AND CONSTRAINT_NAME = 'fk_team_opponents_spiel'
);

SET @sql = IF(@constraint_exists = 0, 
    'ALTER TABLE team_opponents ADD CONSTRAINT fk_team_opponents_spiel FOREIGN KEY (spiel_id) REFERENCES turnier_spiele(id) ON DELETE SET NULL',
    'SELECT "Foreign key constraint fk_team_opponents_spiel already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migration complete
SELECT 'Migration completed: spiel_id column added to team_opponents table' as status;
