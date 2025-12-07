-- ============================================
-- MIGRATION: Add Referee Teams Support
-- Run this on existing databases to add referee team functionality
-- ============================================

-- Step 1: Create the referee teams table
CREATE TABLE IF NOT EXISTS turnier_schiedsrichter_teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turnier_id INT NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    ansprechpartner VARCHAR(255),
    telefon VARCHAR(50),
    verfuegbar BOOLEAN DEFAULT TRUE,
    aktiv BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (turnier_id) REFERENCES turnier_config(id) ON DELETE CASCADE,
    INDEX idx_schiedsrichter_verfuegbar (turnier_id, verfuegbar)
);

-- Step 2: Add schiedsrichter_team_id column to turnier_spiele table
ALTER TABLE turnier_spiele 
ADD COLUMN IF NOT EXISTS schiedsrichter_team_id INT DEFAULT NULL AFTER schiedsrichter_name;

-- Step 3: Add foreign key constraint for schiedsrichter_team_id
-- Check if constraint already exists and only add if not present
SET @constraint_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_NAME = 'fk_schiedsrichter_team' 
    AND TABLE_SCHEMA = DATABASE()
);

SET @sql = IF(@constraint_exists = 0, 
    'ALTER TABLE turnier_spiele ADD CONSTRAINT fk_schiedsrichter_team FOREIGN KEY (schiedsrichter_team_id) REFERENCES turnier_schiedsrichter_teams(id) ON DELETE SET NULL',
    'SELECT "Constraint already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migration complete
-- You can now use the referee team functionality
