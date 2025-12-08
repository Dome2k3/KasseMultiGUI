-- Migration: Add indexes for dynamic Swiss progression queries
-- These indexes optimize the queries used to check for existing team pairings
-- and to efficiently find teams that are ready for the next round

-- Add composite index for team pairing lookups in specific rounds
-- This optimizes the duplicate check in createSwissGames()
ALTER TABLE turnier_spiele 
ADD INDEX idx_team_round_lookup (turnier_id, phase_id, runde, team1_id, team2_id);

-- Add index to quickly find teams with finished games in a round
-- This optimizes getReadyTeamsForRound()
ALTER TABLE turnier_spiele
ADD INDEX idx_finished_teams (turnier_id, phase_id, runde, status);

-- Note: These indexes are optional but recommended for better performance
-- with large tournaments (100+ teams). They are particularly beneficial
-- for Swiss 144 mode with dynamic progression enabled.
