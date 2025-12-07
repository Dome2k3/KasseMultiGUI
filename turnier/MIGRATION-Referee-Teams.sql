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
-- Note: If this fails, it means the constraint already exists
ALTER TABLE turnier_spiele 
ADD CONSTRAINT fk_schiedsrichter_team 
FOREIGN KEY (schiedsrichter_team_id) REFERENCES turnier_schiedsrichter_teams(id) ON DELETE SET NULL;

-- Migration complete
-- You can now use the referee team functionality
