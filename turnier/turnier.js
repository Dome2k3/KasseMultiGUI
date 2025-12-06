// turnier.js - Tournament Management Server
require('dotenv').config({ path: '/var/www/html/kasse/Umgebung.env' });

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const swissPairing = require('./swiss-pairing');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting configuration
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limit for sensitive operations (result submissions, confirmations)
const strictLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Limit each IP to 50 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply general rate limiting to all routes
app.use('/api/', generalLimiter);

// Database Pool
const db = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Helper: Generate random confirmation code (6 bytes = 12 hex chars for better security)
function generateConfirmationCode() {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

// Helper: Determine winner and loser from scores
// Returns { gewinnerId, verliererId } or null values if tie
function determineWinnerLoser(score1, score2, team1Id, team2Id) {
    if (score1 > score2) {
        return { gewinnerId: team1Id, verliererId: team2Id };
    } else if (score2 > score1) {
        return { gewinnerId: team2Id, verliererId: team1Id };
    }
    // Tie - no clear winner (game may need tiebreaker)
    return { gewinnerId: null, verliererId: null };
}

// Helper: Get winner's score from a game result
function getWinnerScore(score1, score2) {
    return Math.max(score1, score2);
}

// Helper: Get loser's score from a game result
function getLoserScore(score1, score2) {
    return Math.min(score1, score2);
}

// Helper: Audit logging
async function logAudit(turnierIdVal, aktion, tabelle, datensatzIdVal, alteWerte, neueWerte, benutzer = 'system', ipAdresse = null) {
    try {
        await db.query(
            'INSERT INTO turnier_audit_log (turnier_id, benutzer, aktion, tabelle, datensatz_id, alte_werte, neue_werte, ip_adresse) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [turnierIdVal, benutzer, aktion, tabelle, datensatzIdVal, JSON.stringify(alteWerte), JSON.stringify(neueWerte), ipAdresse]
        );
    } catch (err) {
        console.error('Audit log error:', err);
    }
}

// Helper: Assign next waiting game to a freed field
async function assignNextWaitingGame(turnierId, freedFieldId) {
    try {
        // Find the next waiting game that has both teams assigned (in order of spiel_nummer)
        const [waitingGames] = await db.query(
            `SELECT * FROM turnier_spiele 
             WHERE turnier_id = ? AND status = 'wartend' AND feld_id IS NULL 
             AND team1_id IS NOT NULL AND team2_id IS NOT NULL
             ORDER BY spiel_nummer ASC LIMIT 1`,
            [turnierId]
        );

        if (waitingGames.length === 0) {
            return null; // No waiting games with both teams
        }

        const nextGame = waitingGames[0];
        const now = new Date();

        // Assign the freed field to this game and update status to 'geplant'
        await db.query(
            `UPDATE turnier_spiele SET feld_id = ?, geplante_zeit = ?, status = 'geplant' WHERE id = ?`,
            [freedFieldId, now, nextGame.id]
        );

        console.log(`Assigned waiting game #${nextGame.spiel_nummer} to field ${freedFieldId}`);
        return nextGame.id;
    } catch (err) {
        console.error('Error assigning next waiting game:', err);
        return null;
    }
}

// Helper: Get next letter in the alphabet
function getNextPhaseLetter(currentLetter) {
    return String.fromCharCode(currentLetter.charCodeAt(0) + 1);
}

// Helper: Parse phase name to extract letter (e.g., "Plan A1" -> "A", "Plan B2" -> "B")
function parsePhaseNameLetter(phaseName) {
    const match = phaseName.match(/Plan ([A-Z])\d?/);
    return match ? match[1] : null;
}

// Helper: Generate or update next round games for winner and loser
// This is called after a game is completed to progress the tournament bracket
async function progressTournamentBracket(turnierId, completedGame, gewinnerId, verliererId) {
    try {
        // Get phases for the tournament
        const [phasen] = await db.query(
            'SELECT * FROM turnier_phasen WHERE turnier_id = ? ORDER BY reihenfolge',
            [turnierId]
        );

        const currentPhase = phasen.find(p => p.id === completedGame.phase_id);
        if (!currentPhase) {
            console.log('Phase not found for game');
            return;
        }

        const currentRunde = completedGame.runde;

        // Determine the next phases for winner and loser based on current phase
        let winnerPhase = null;
        let loserPhase = null;

        if (currentPhase.phase_typ === 'hauptrunde') {
            // From main round (Plan A), winners go to Plan A1, losers to Plan A2
            winnerPhase = phasen.find(p => p.phase_name === 'Plan A1');
            loserPhase = phasen.find(p => p.phase_name === 'Plan A2');
        } else if (currentPhase.phase_typ === 'gewinner') {
            // From winner bracket, determine next winner phase
            const phaseLetter = parsePhaseNameLetter(currentPhase.phase_name);
            if (phaseLetter) {
                const nextLetter = getNextPhaseLetter(phaseLetter);
                winnerPhase = phasen.find(p => p.phase_name === `Plan ${nextLetter}1`);
                loserPhase = phasen.find(p => p.phase_name === `Plan ${nextLetter}2`);
            }
        } else if (currentPhase.phase_typ === 'verlierer') {
            // From loser bracket, winners stay in loser bracket progression
            const phaseLetter = parsePhaseNameLetter(currentPhase.phase_name);
            if (phaseLetter) {
                const nextLetter = getNextPhaseLetter(phaseLetter);
                // Loser bracket winners go to next loser bracket round
                winnerPhase = phasen.find(p => p.phase_name === `Plan ${nextLetter}2`);
                // Losers in loser bracket are eliminated (no further progression)
                loserPhase = null;
            }
        }

        // Get the maximum spiel_nummer to generate next game numbers
        const [maxSpielResult] = await db.query(
            'SELECT MAX(spiel_nummer) as max_nr FROM turnier_spiele WHERE turnier_id = ?',
            [turnierId]
        );
        let nextSpielNummer = (maxSpielResult[0].max_nr || 0) + 1;

        // Process winner: find or create next round game
        if (winnerPhase && gewinnerId) {
            const winnerGameCreated = await assignTeamToNextRoundGame(turnierId, winnerPhase.id, currentRunde + 1, gewinnerId, nextSpielNummer, 'gewinner');
            if (winnerGameCreated) {
                nextSpielNummer++;
            }
        }

        // Process loser: find or create next round game in loser bracket
        if (loserPhase && verliererId) {
            await assignTeamToNextRoundGame(turnierId, loserPhase.id, currentRunde + 1, verliererId, nextSpielNummer, 'verlierer');
        }

        console.log(`Bracket progression completed for game #${completedGame.spiel_nummer}`);
    } catch (err) {
        console.error('Error progressing tournament bracket:', err);
    }
}

// Helper: Progress Swiss tournament after a game completes
async function progressSwissTournament(turnierId, completedGame) {
    try {
        // Check if this round is complete
        const [roundGames] = await db.query(
            `SELECT COUNT(*) as total, 
                    SUM(CASE WHEN status = 'beendet' THEN 1 ELSE 0 END) as completed
             FROM turnier_spiele 
             WHERE turnier_id = ? AND phase_id = ? AND runde = ?`,
            [turnierId, completedGame.phase_id, completedGame.runde]
        );

        const roundInfo = roundGames[0];
        console.log(`Round ${completedGame.runde}: ${roundInfo.completed}/${roundInfo.total} games completed`);

        // If round is complete, generate next round
        if (roundInfo.completed === roundInfo.total) {
            console.log(`Round ${completedGame.runde} complete - generating next round`);

            // Update Swiss standings
            await updateSwissStandings(turnierId);

            // Special handling for Swiss 144 qualification round (round 0)
            if (completedGame.runde === 0) {
                await handleQualificationComplete(turnierId, completedGame.phase_id);
                return;
            }

            // Check if we've reached max rounds (7 for Swiss 144, configurable for others)
            const [config] = await db.query('SELECT modus FROM turnier_config WHERE id = ?', [turnierId]);
            const maxRounds = config[0]?.modus === 'swiss_144' ? 7 : 5;

            if (completedGame.runde >= maxRounds) {
                console.log(`Tournament complete - max rounds (${maxRounds}) reached`);
                return;
            }

            // Generate next round pairings
            const nextRunde = completedGame.runde + 1;
            const pairings = await generateNextSwissRound(turnierId, nextRunde);

            // Get available fields
            const [felder] = await db.query(
                'SELECT * FROM turnier_felder WHERE turnier_id = ? AND aktiv = 1 ORDER BY feld_nummer',
                [turnierId]
            );

            // Get max spiel_nummer
            const [maxSpielResult] = await db.query(
                'SELECT MAX(spiel_nummer) as max_nr FROM turnier_spiele WHERE turnier_id = ?',
                [turnierId]
            );
            let spielNummer = (maxSpielResult[0].max_nr || 0) + 1;

            // Create games for next round
            for (let i = 0; i < pairings.length; i++) {
                const pair = pairings[i];
                const bestCode = generateConfirmationCode();

                // Assign field to first N games
                let feldId = null;
                let geplante_zeit = null;
                let status = 'wartend';

                if (i < felder.length) {
                    feldId = felder[i].id;
                    geplante_zeit = new Date();
                    status = 'geplant';
                }

                const [result] = await db.query(
                    `INSERT INTO turnier_spiele 
                    (turnier_id, phase_id, runde, spiel_nummer, team1_id, team2_id, feld_id, geplante_zeit, status, bestaetigungs_code) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [turnierId, completedGame.phase_id, nextRunde, spielNummer++,
                     pair.teamA.id, pair.teamB ? pair.teamB.id : null,
                     feldId, geplante_zeit, pair.isBye ? 'beendet' : status, bestCode]
                );

                // If bye, record the win immediately
                if (pair.isBye) {
                    await db.query(
                        'UPDATE turnier_spiele SET gewinner_id = ?, status = "beendet" WHERE id = ?',
                        [pair.teamA.id, result.insertId]
                    );
                }

                // Record opponent relationship
                if (pair.teamB) {
                    await recordOpponent(turnierId, pair.teamA.id, pair.teamB.id, result.insertId, nextRunde);
                }
            }

            console.log(`Generated ${pairings.length} pairings for round ${nextRunde}`);
        }
    } catch (err) {
        console.error('Error progressing Swiss tournament:', err);
    }
}

// Helper: Handle qualification round completion (Swiss 144)
async function handleQualificationComplete(turnierId, qualiPhaseId) {
    try {
        console.log('Qualification round complete - processing winners and losers');

        // Get qualification games
        const [qualiGames] = await db.query(
            'SELECT * FROM turnier_spiele WHERE turnier_id = ? AND phase_id = ? AND runde = 0 AND status = "beendet"',
            [turnierId, qualiPhaseId]
        );

        const winners = [];
        const losers = [];

        for (const game of qualiGames) {
            if (game.gewinner_id) winners.push(game.gewinner_id);
            if (game.verlierer_id) losers.push(game.verlierer_id);
        }

        // Mark winners as qualified for main Swiss
        for (const winnerId of winners) {
            await db.query('UPDATE turnier_teams SET swiss_qualified = 1 WHERE id = ?', [winnerId]);
        }

        console.log(`Qualification: ${winners.length} winners qualify for main field, ${losers.length} go to Hobby Cup`);

        // Get main Swiss phase
        const [phases] = await db.query(
            'SELECT * FROM turnier_phasen WHERE turnier_id = ? AND phase_name = "Main Swiss"',
            [turnierId]
        );

        if (phases.length === 0) {
            console.error('Main Swiss phase not found');
            return;
        }

        const mainPhaseId = phases[0].id;

        // Update waiting main field games to include qualification winners
        // This is a placeholder - in a real implementation, we would need to
        // assign the 16 qualification winners to the appropriate spots in the 128-team bracket
        console.log('TODO: Assign qualification winners to main field matches');

        // Create Hobby Cup matches for losers (could be a round-robin or separate bracket)
        // This is left as a TODO for now
        console.log('TODO: Create Hobby Cup matches for qualification losers');

    } catch (err) {
        console.error('Error handling qualification completion:', err);
    }
}

// Helper: Assign a team to an existing waiting game or create a new one
// Returns true if a new game was created, false if team was assigned to existing game
async function assignTeamToNextRoundGame(turnierId, phaseId, runde, teamId, nextSpielNummer, bracketType) {
    try {
        // Look for an existing game in this phase and round that needs a team
        const [existingGames] = await db.query(
            `SELECT * FROM turnier_spiele 
             WHERE turnier_id = ? AND phase_id = ? AND runde = ? 
             AND (team1_id IS NULL OR team2_id IS NULL) AND status = 'wartend'
             ORDER BY spiel_nummer ASC LIMIT 1`,
            [turnierId, phaseId, runde]
        );

        if (existingGames.length > 0) {
            const game = existingGames[0];
            // Assign the team to the available slot
            if (game.team1_id === null) {
                await db.query(
                    'UPDATE turnier_spiele SET team1_id = ? WHERE id = ?',
                    [teamId, game.id]
                );
                console.log(`Assigned team ${teamId} to team1 slot of game #${game.spiel_nummer}`);
            } else if (game.team2_id === null) {
                await db.query(
                    'UPDATE turnier_spiele SET team2_id = ? WHERE id = ?',
                    [teamId, game.id]
                );
                console.log(`Assigned team ${teamId} to team2 slot of game #${game.spiel_nummer}`);
            }
            return false; // No new game was created
        } else {
            // Create a new waiting game for this phase and round
            const bestCode = generateConfirmationCode();
            await db.query(
                `INSERT INTO turnier_spiele 
                (turnier_id, phase_id, runde, spiel_nummer, team1_id, team2_id, feld_id, geplante_zeit, status, bestaetigungs_code) 
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 'wartend', ?)`,
                [turnierId, phaseId, runde, nextSpielNummer, teamId, bestCode]
            );
            console.log(`Created new ${bracketType} bracket game #${nextSpielNummer} with team ${teamId}`);
            return true; // New game was created
        }
    } catch (err) {
        console.error('Error assigning team to next round game:', err);
        return false;
    }
}

// ==========================================
// TURNIER CONFIG ENDPOINTS
// ==========================================

// Get all tournaments
app.get('/api/turniere', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM turnier_config ORDER BY turnier_datum DESC');
        res.json(rows);
    } catch (err) {
        console.error('GET /api/turniere error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get single tournament
app.get('/api/turniere/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM turnier_config WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('GET /api/turniere/:id error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create tournament
app.post('/api/turniere', async (req, res) => {
    try {
        const {
            turnier_name,
            turnier_datum,
            turnier_datum_ende = null,
            anzahl_teams = 32,
            anzahl_felder = 4,
            anzahl_klassen = 5,
            klassen_namen = ['A', 'B', 'C', 'D', 'E'],
            spielzeit_minuten = 0,
            pause_minuten = 0,
            startzeit = '09:00:00',
            endzeit = '18:00:00',
            modus = 'seeded',
            email_benachrichtigung = true
        } = req.body;

        if (!turnier_name || !turnier_datum) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const bestaetigungs_code = generateConfirmationCode();

        const [result] = await db.query(
            `INSERT INTO turnier_config 
            (turnier_name, turnier_datum, turnier_datum_ende, anzahl_teams, anzahl_felder, anzahl_klassen, 
             klassen_namen, spielzeit_minuten, pause_minuten, startzeit, endzeit, 
             modus, bestaetigungs_code, email_benachrichtigung) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [turnier_name, turnier_datum, turnier_datum_ende, anzahl_teams, anzahl_felder, anzahl_klassen,
             JSON.stringify(klassen_namen), spielzeit_minuten, pause_minuten, startzeit, endzeit,
             modus, bestaetigungs_code, email_benachrichtigung]
        );

        const turnierId = result.insertId;

        // Create fields automatically
        for (let i = 1; i <= anzahl_felder; i++) {
            await db.query(
                'INSERT INTO turnier_felder (turnier_id, feld_nummer, feld_name) VALUES (?, ?, ?)',
                [turnierId, i, `Feld ${i}`]
            );
        }

        // Create default phases
        await createDefaultPhasen(turnierId, anzahl_teams);

        await logAudit(turnierId, 'CREATE', 'turnier_config', turnierId, null, req.body);

        res.json({ success: true, id: turnierId, bestaetigungs_code });
    } catch (err) {
        console.error('POST /api/turniere error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update tournament
app.put('/api/turniere/:id', async (req, res) => {
    try {
        const turnierId = req.params.id;
        const updateFields = [];
        const values = [];

        const allowedFields = [
            'turnier_name', 'turnier_datum', 'turnier_datum_ende', 'anzahl_teams', 'anzahl_felder',
            'anzahl_klassen', 'klassen_namen', 'spielzeit_minuten', 'pause_minuten',
            'startzeit', 'endzeit', 'modus', 'email_benachrichtigung', 'aktiv',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_sender'
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                values.push(field === 'klassen_namen' ? JSON.stringify(req.body[field]) : req.body[field]);
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(turnierId);
        await db.query(`UPDATE turnier_config SET ${updateFields.join(', ')} WHERE id = ?`, values);

        await logAudit(turnierId, 'UPDATE', 'turnier_config', turnierId, null, req.body);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/turniere/:id error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete tournament
app.delete('/api/turniere/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM turnier_config WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/turniere/:id error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// TEAMS ENDPOINTS
// ==========================================

// Get teams for tournament
app.get('/api/turniere/:turnierId/teams', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM turnier_teams WHERE turnier_id = ? ORDER BY klasse, setzposition, team_name',
            [req.params.turnierId]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET teams error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Add team to tournament
app.post('/api/turniere/:turnierId/teams', async (req, res) => {
    try {
        const {
            team_name, ansprechpartner, email, telefon, verein,
            klasse = 'A', setzposition = 0, teilnehmerzahl = 2, passwort = ''
        } = req.body;

        if (!team_name) {
            return res.status(400).json({ error: 'Team name required' });
        }

        // Generate confirmation code for the team
        const bestaetigungs_code = generateConfirmationCode();

        const [result] = await db.query(
            `INSERT INTO turnier_teams 
            (turnier_id, team_name, ansprechpartner, email, telefon, verein, klasse, setzposition, teilnehmerzahl, passwort, bestaetigungs_code) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.params.turnierId, team_name, ansprechpartner, email, telefon, verein, klasse, setzposition, teilnehmerzahl, passwort, bestaetigungs_code]
        );

        await logAudit(req.params.turnierId, 'CREATE', 'turnier_teams', result.insertId, null, req.body);

        res.json({ success: true, id: result.insertId, bestaetigungs_code });
    } catch (err) {
        console.error('POST teams error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update team
app.put('/api/turniere/:turnierId/teams/:teamId', async (req, res) => {
    try {
        const updateFields = [];
        const values = [];

        const allowedFields = ['team_name', 'ansprechpartner', 'email', 'telefon', 'verein', 'klasse', 'setzposition', 'status', 'teilnehmerzahl', 'passwort', 'bestaetigungs_code'];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.teamId, req.params.turnierId);
        await db.query(`UPDATE turnier_teams SET ${updateFields.join(', ')} WHERE id = ? AND turnier_id = ?`, values);

        await logAudit(req.params.turnierId, 'UPDATE', 'turnier_teams', req.params.teamId, null, req.body);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT teams error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete team
app.delete('/api/turniere/:turnierId/teams/:teamId', async (req, res) => {
    try {
        await db.query('DELETE FROM turnier_teams WHERE id = ? AND turnier_id = ?', [req.params.teamId, req.params.turnierId]);
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE teams error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Import teams (bulk)
app.post('/api/turniere/:turnierId/teams/import', async (req, res) => {
    try {
        const { teams } = req.body;
        if (!Array.isArray(teams)) {
            return res.status(400).json({ error: 'Teams array required' });
        }

        let imported = 0;
        for (const team of teams) {
            const bestaetigungs_code = generateConfirmationCode();
            await db.query(
                `INSERT INTO turnier_teams 
                (turnier_id, team_name, ansprechpartner, email, telefon, verein, klasse, setzposition, passwort, bestaetigungs_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.params.turnierId, team.team_name, team.ansprechpartner, team.email, team.telefon, team.verein, team.klasse || 'A', team.setzposition || 0, team.passwort || '', bestaetigungs_code]
            );
            imported++;
        }

        res.json({ success: true, imported });
    } catch (err) {
        console.error('Import teams error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// PHASEN ENDPOINTS
// ==========================================

// Get phases for tournament
app.get('/api/turniere/:turnierId/phasen', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM turnier_phasen WHERE turnier_id = ? ORDER BY reihenfolge',
            [req.params.turnierId]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET phasen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Helper: Create default phases for a tournament
async function createDefaultPhasen(turnierId, anzahlTeams) {
    const phasen = [
        { name: 'Plan A', typ: 'hauptrunde', reihenfolge: 1, beschreibung: 'Hauptrunde - alle Teams' },
        { name: 'Plan A1', typ: 'gewinner', reihenfolge: 2, beschreibung: 'Gewinner aus Plan A' },
        { name: 'Plan A2', typ: 'verlierer', reihenfolge: 3, beschreibung: 'Verlierer aus Plan A' },
        { name: 'Plan B1', typ: 'gewinner', reihenfolge: 4, beschreibung: 'Gewinner-Pfad B' },
        { name: 'Plan B2', typ: 'verlierer', reihenfolge: 5, beschreibung: 'Verlierer-Pfad B' },
        { name: 'Plan C1', typ: 'gewinner', reihenfolge: 6, beschreibung: 'Gewinner-Pfad C' },
        { name: 'Plan C2', typ: 'verlierer', reihenfolge: 7, beschreibung: 'Verlierer-Pfad C' },
        { name: 'Plan D1', typ: 'gewinner', reihenfolge: 8, beschreibung: 'Gewinner-Pfad D' },
        { name: 'Plan D2', typ: 'verlierer', reihenfolge: 9, beschreibung: 'Verlierer-Pfad D' },
        { name: 'Plan E1', typ: 'gewinner', reihenfolge: 10, beschreibung: 'Gewinner-Pfad E' },
        { name: 'Plan E2', typ: 'verlierer', reihenfolge: 11, beschreibung: 'Verlierer-Pfad E' },
        { name: 'Finale', typ: 'finale', reihenfolge: 12, beschreibung: 'Finalspiele' }
    ];

    for (const phase of phasen) {
        await db.query(
            'INSERT INTO turnier_phasen (turnier_id, phase_name, phase_typ, reihenfolge, beschreibung) VALUES (?, ?, ?, ?, ?)',
            [turnierId, phase.name, phase.typ, phase.reihenfolge, phase.beschreibung]
        );
    }
}

// ==========================================
// FELDER ENDPOINTS
// ==========================================

// Get fields for tournament
app.get('/api/turniere/:turnierId/felder', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM turnier_felder WHERE turnier_id = ? ORDER BY feld_nummer',
            [req.params.turnierId]
        );
        res.json(rows);
    } catch (err) {
        console.error('GET felder error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update field
app.put('/api/turniere/:turnierId/felder/:feldId', async (req, res) => {
    try {
        const { feld_name, aktiv, blockiert_von, blockiert_bis } = req.body;
        await db.query(
            'UPDATE turnier_felder SET feld_name = ?, aktiv = ?, blockiert_von = ?, blockiert_bis = ? WHERE id = ? AND turnier_id = ?',
            [feld_name, aktiv, blockiert_von, blockiert_bis, req.params.feldId, req.params.turnierId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('PUT felder error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// SPIELE ENDPOINTS
// ==========================================

// Get all games for tournament
app.get('/api/turniere/:turnierId/spiele', async (req, res) => {
    try {
        const { phase_id, runde, status, team_id } = req.query;
        
        let query = `
            SELECT s.*, 
                   t1.team_name as team1_name, t1.verein as team1_verein,
                   t2.team_name as team2_name, t2.verein as team2_verein,
                   gew.team_name as gewinner_name,
                   f.feld_nummer, f.feld_name,
                   p.phase_name, p.phase_typ
            FROM turnier_spiele s
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_teams gew ON s.gewinner_id = gew.id
            LEFT JOIN turnier_felder f ON s.feld_id = f.id
            LEFT JOIN turnier_phasen p ON s.phase_id = p.id
            WHERE s.turnier_id = ?
        `;
        
        const params = [req.params.turnierId];

        if (phase_id) {
            query += ' AND s.phase_id = ?';
            params.push(phase_id);
        }
        if (runde) {
            query += ' AND s.runde = ?';
            params.push(runde);
        }
        if (status) {
            query += ' AND s.status = ?';
            params.push(status);
        }
        if (team_id) {
            query += ' AND (s.team1_id = ? OR s.team2_id = ?)';
            params.push(team_id, team_id);
        }

        query += ' ORDER BY s.geplante_zeit, s.spiel_nummer';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('GET spiele error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Vorschau (preview) - next 10 upcoming games that are waiting and have both teams assigned
app.get('/api/turniere/:turnierId/vorschau', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 10;
        const [rows] = await db.query(`
            SELECT s.*, 
                   t1.team_name as team1_name, t1.verein as team1_verein,
                   t2.team_name as team2_name, t2.verein as team2_verein,
                   p.phase_name, p.phase_typ
            FROM turnier_spiele s
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_phasen p ON s.phase_id = p.id
            WHERE s.turnier_id = ? 
              AND s.status = 'wartend' 
              AND s.feld_id IS NULL
              AND s.team1_id IS NOT NULL 
              AND s.team2_id IS NOT NULL
            ORDER BY s.spiel_nummer ASC
            LIMIT ?
        `, [req.params.turnierId, limit]);

        res.json(rows);
    } catch (err) {
        console.error('GET vorschau error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get single game
app.get('/api/turniere/:turnierId/spiele/:spielId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT s.*, 
                   t1.team_name as team1_name, t1.email as team1_email, t1.verein as team1_verein,
                   t2.team_name as team2_name, t2.email as team2_email, t2.verein as team2_verein,
                   f.feld_nummer, f.feld_name,
                   p.phase_name
            FROM turnier_spiele s
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_felder f ON s.feld_id = f.id
            LEFT JOIN turnier_phasen p ON s.phase_id = p.id
            WHERE s.id = ? AND s.turnier_id = ?
        `, [req.params.spielId, req.params.turnierId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('GET spiel error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// SWISS SYSTEM HELPERS
// ==========================================

// Helper: Get Swiss standings for teams
async function getSwissStandings(turnierId) {
    const [teams] = await db.query(
        `SELECT id, team_name, klasse, setzposition, swiss_score, buchholz, 
                initial_seed, swiss_qualified, status
         FROM turnier_teams 
         WHERE turnier_id = ? AND status IN ("angemeldet", "bestaetigt")
         ORDER BY swiss_score DESC, buchholz DESC, initial_seed ASC`,
        [turnierId]
    );

    // Get opponents for each team
    const teamsWithOpponents = [];
    for (const team of teams) {
        const [opponents] = await db.query(
            'SELECT opponent_id FROM team_opponents WHERE turnier_id = ? AND team_id = ?',
            [turnierId, team.id]
        );
        teamsWithOpponents.push({
            ...team,
            opponents: opponents.map(o => o.opponent_id)
        });
    }

    return teamsWithOpponents;
}

// Helper: Update Swiss standings after a round
async function updateSwissStandings(turnierId) {
    // Get all completed games
    const [games] = await db.query(
        `SELECT * FROM turnier_spiele 
         WHERE turnier_id = ? AND status = 'beendet' AND gewinner_id IS NOT NULL`,
        [turnierId]
    );

    // Calculate scores for each team
    const teamScores = new Map();
    const teamOpponents = new Map();

    for (const game of games) {
        if (game.team1_id && game.team2_id) {
            // Record opponents
            if (!teamOpponents.has(game.team1_id)) teamOpponents.set(game.team1_id, []);
            if (!teamOpponents.has(game.team2_id)) teamOpponents.set(game.team2_id, []);
            teamOpponents.get(game.team1_id).push(game.team2_id);
            teamOpponents.get(game.team2_id).push(game.team1_id);

            // Calculate scores (0.5 points per win in Swiss)
            if (game.gewinner_id) {
                const currentScore = teamScores.get(game.gewinner_id) || 0;
                teamScores.set(game.gewinner_id, currentScore + 0.5);
                
                const loserId = game.gewinner_id === game.team1_id ? game.team2_id : game.team1_id;
                if (!teamScores.has(loserId)) {
                    teamScores.set(loserId, 0);
                }
            }
        }
    }

    // Calculate Buchholz (sum of opponents' scores)
    const buchholzScores = new Map();
    for (const [teamId, opponentIds] of teamOpponents.entries()) {
        let buchholz = 0;
        for (const oppId of opponentIds) {
            buchholz += teamScores.get(oppId) || 0;
        }
        buchholzScores.set(teamId, buchholz);
    }

    // Update database
    for (const [teamId, score] of teamScores.entries()) {
        const buchholz = buchholzScores.get(teamId) || 0;
        await db.query(
            'UPDATE turnier_teams SET swiss_score = ?, buchholz = ? WHERE id = ?',
            [score, buchholz, teamId]
        );
    }

    console.log(`Updated Swiss standings for ${teamScores.size} teams`);
}

// Helper: Record opponent relationship
async function recordOpponent(turnierId, team1Id, team2Id, spielId, runde) {
    try {
        // Record both directions
        await db.query(
            `INSERT IGNORE INTO team_opponents (turnier_id, team_id, opponent_id, spiel_id, runde)
             VALUES (?, ?, ?, ?, ?)`,
            [turnierId, team1Id, team2Id, spielId, runde]
        );
        await db.query(
            `INSERT IGNORE INTO team_opponents (turnier_id, team_id, opponent_id, spiel_id, runde)
             VALUES (?, ?, ?, ?, ?)`,
            [turnierId, team2Id, team1Id, spielId, runde]
        );
    } catch (err) {
        console.error('Error recording opponent:', err);
    }
}

// Helper: Generate next Swiss round pairings
async function generateNextSwissRound(turnierId, nextRunde) {
    try {
        // Get Swiss standings
        const teams = await getSwissStandings(turnierId);

        // Prepare team objects for pairing engine
        const pairingTeams = teams.map(t => ({
            id: t.id,
            score: t.swiss_score || 0,
            buchholz: t.buchholz || 0,
            initialSeed: t.initial_seed || 999,
            opponents: t.opponents || []
        }));

        // Compute pairings
        const result = swissPairing.computeSwissPairings(pairingTeams, nextRunde, {
            timeLimitMs: 5000,
            pairingTimeMs: 2500,
            repairTimeMs: 2500,
            allowFallback: true
        });

        if (!result.success && result.rematchCount > 0) {
            console.warn(`Warning: Swiss pairing found ${result.rematchCount} rematches`);
        }

        console.log(`Generated ${result.pairs.length} pairings for round ${nextRunde}`, result.meta);
        
        return result.pairs;
    } catch (err) {
        console.error('Error generating Swiss round:', err);
        throw err;
    }
}

// ==========================================
// TOURNAMENT START / GAME GENERATION
// ==========================================

// Start tournament - generate games based on mode (bracket or Swiss)
app.post('/api/turniere/:turnierId/starten', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;

        // Get tournament config
        const [configRows] = await db.query('SELECT * FROM turnier_config WHERE id = ?', [turnierId]);
        if (configRows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        const config = configRows[0];

        // Route to appropriate start function based on mode
        if (config.modus === 'swiss_144') {
            return await startSwiss144Tournament(turnierId, config, res);
        } else if (config.modus === 'swiss') {
            return await startSwissTournament(turnierId, config, res);
        } else {
            return await startBracketTournament(turnierId, config, res);
        }
    } catch (err) {
        console.error('POST starten error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// Start Swiss 144 tournament (32 quali + 128 main field)
async function startSwiss144Tournament(turnierId, config, res) {
    try {
        // Get all teams
        const [allTeams] = await db.query(
            `SELECT * FROM turnier_teams 
             WHERE turnier_id = ? AND status IN ("angemeldet", "bestaetigt") 
             ORDER BY klasse, setzposition`,
            [turnierId]
        );

        if (allTeams.length < 144) {
            return res.status(400).json({ 
                error: `Need 144 teams for Swiss 144 mode, only have ${allTeams.length}` 
            });
        }

        // Separate teams by class
        const bundesligaTeams = allTeams.filter(t => t.klasse === 'A').slice(0, 32);
        const hobbyTeams = allTeams.filter(t => t.klasse === 'D').slice(0, 32);
        const otherTeams = allTeams.filter(t => !bundesligaTeams.includes(t) && !hobbyTeams.includes(t));

        // Initialize Swiss seeds
        let seed = 1;
        for (const team of bundesligaTeams) {
            await db.query('UPDATE turnier_teams SET initial_seed = ? WHERE id = ?', [seed++, team.id]);
        }
        for (const team of otherTeams.slice(0, 80)) {
            await db.query('UPDATE turnier_teams SET initial_seed = ? WHERE id = ?', [seed++, team.id]);
        }
        for (const team of hobbyTeams) {
            await db.query('UPDATE turnier_teams SET initial_seed = ? WHERE id = ?', [seed++, team.id]);
        }

        // Get fields
        const [felder] = await db.query(
            'SELECT * FROM turnier_felder WHERE turnier_id = ? AND aktiv = 1 ORDER BY feld_nummer',
            [turnierId]
        );

        if (felder.length < 16) {
            return res.status(400).json({ error: 'Need at least 16 fields for Swiss 144' });
        }

        // Get phases
        const [phases] = await db.query(
            'SELECT * FROM turnier_phasen WHERE turnier_id = ? ORDER BY reihenfolge',
            [turnierId]
        );
        
        let qualiPhase = phases.find(p => p.phase_name === 'Qualification');
        let mainPhase = phases.find(p => p.phase_name === 'Main Swiss');
        let hobbyCupPhase = phases.find(p => p.phase_name === 'Hobby Cup');

        // Create phases if they don't exist
        if (!qualiPhase) {
            const [result] = await db.query(
                'INSERT INTO turnier_phasen (turnier_id, phase_name, phase_typ, reihenfolge, beschreibung) VALUES (?, ?, ?, ?, ?)',
                [turnierId, 'Qualification', 'hauptrunde', 1, 'Qualification Round for Hobby Teams']
            );
            qualiPhase = { id: result.insertId, phase_name: 'Qualification' };
        }
        if (!mainPhase) {
            const [result] = await db.query(
                'INSERT INTO turnier_phasen (turnier_id, phase_name, phase_typ, reihenfolge, beschreibung) VALUES (?, ?, ?, ?, ?)',
                [turnierId, 'Main Swiss', 'hauptrunde', 2, 'Main Swiss System (128 teams, 7 rounds)']
            );
            mainPhase = { id: result.insertId, phase_name: 'Main Swiss' };
        }
        if (!hobbyCupPhase) {
            const [result] = await db.query(
                'INSERT INTO turnier_phasen (turnier_id, phase_name, phase_typ, reihenfolge, beschreibung) VALUES (?, ?, ?, ?, ?)',
                [turnierId, 'Hobby Cup', 'trostrunde', 3, 'Hobby Cup for Qualification Losers']
            );
            hobbyCupPhase = { id: result.insertId, phase_name: 'Hobby Cup' };
        }

        const currentTime = new Date(`${config.turnier_datum}T${config.startzeit}`);
        let spielNummer = 1;
        const spiele = [];

        // Create 16 qualification matches (32 hobby teams)
        const shuffledHobby = shuffleArray([...hobbyTeams]);
        for (let i = 0; i < 16; i++) {
            const team1 = shuffledHobby[i * 2];
            const team2 = shuffledHobby[i * 2 + 1];
            const feld = felder[i]; // First 16 fields for quali
            const bestCode = generateConfirmationCode();

            spiele.push({
                turnier_id: turnierId,
                phase_id: qualiPhase.id,
                runde: 0, // Round 0 for qualification
                spiel_nummer: spielNummer++,
                team1_id: team1.id,
                team2_id: team2.id,
                feld_id: feld.id,
                geplante_zeit: new Date(currentTime),
                status: 'geplant',
                bestaetigungs_code: bestCode
            });
        }

        // Prepare 112 seeded teams for main field (will add 16 quali winners later)
        const mainFieldSeeded = [...bundesligaTeams, ...otherTeams.slice(0, 80)];

        // Generate Round 1 pairings for main field using Dutch system
        const pairingTeams = mainFieldSeeded.map(t => ({
            id: t.id,
            score: 0,
            buchholz: 0,
            initialSeed: t.setzposition || 999,
            opponents: []
        }));

        const round1Result = swissPairing.pairRound1Dutch(pairingTeams, {});
        
        // Create main field games
        // First 11 fields (17-27) get non-waiting matches, rest are waiting
        let gamesOnFields = 0;
        const remainingFields = felder.slice(16, 27); // Fields 17-27

        for (let i = 0; i < round1Result.pairs.length; i++) {
            const pair = round1Result.pairs[i];
            const bestCode = generateConfirmationCode();
            
            // Assign field to first 11 matches (fields 17-27)
            let feldId = null;
            let geplante_zeit = null;
            let status = 'wartend';
            
            if (gamesOnFields < remainingFields.length) {
                feldId = remainingFields[gamesOnFields].id;
                geplante_zeit = new Date(currentTime);
                status = 'geplant';
                gamesOnFields++;
            }

            spiele.push({
                turnier_id: turnierId,
                phase_id: mainPhase.id,
                runde: 1,
                spiel_nummer: spielNummer++,
                team1_id: pair.teamA.id,
                team2_id: pair.teamB ? pair.teamB.id : null,
                feld_id: feldId,
                geplante_zeit,
                status,
                bestaetigungs_code: bestCode
            });
        }

        // Insert games into database
        for (const spiel of spiele) {
            const [result] = await db.query(
                `INSERT INTO turnier_spiele 
                (turnier_id, phase_id, runde, spiel_nummer, team1_id, team2_id, feld_id, geplante_zeit, status, bestaetigungs_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [spiel.turnier_id, spiel.phase_id, spiel.runde, spiel.spiel_nummer, 
                 spiel.team1_id, spiel.team2_id, spiel.feld_id, spiel.geplante_zeit, 
                 spiel.status, spiel.bestaetigungs_code]
            );

            // Record opponents for tracking
            if (spiel.team1_id && spiel.team2_id) {
                await recordOpponent(turnierId, spiel.team1_id, spiel.team2_id, result.insertId, spiel.runde);
            }
        }

        await logAudit(turnierId, 'START_SWISS_144', 'turnier_spiele', null, null, { 
            total_games: spiele.length,
            quali_games: 16,
            main_field_games: round1Result.pairs.length,
            fields_used: 27
        });

        res.json({ 
            success: true, 
            modus: 'swiss_144',
            spiele_erstellt: spiele.length,
            quali_spiele: 16,
            hauptfeld_spiele: round1Result.pairs.length
        });
    } catch (err) {
        console.error('Start Swiss 144 error:', err);
        throw err;
    }
}

// Start regular Swiss tournament
async function startSwissTournament(turnierId, config, res) {
    try {
        const [teams] = await db.query(
            'SELECT * FROM turnier_teams WHERE turnier_id = ? AND status IN ("angemeldet", "bestaetigt") ORDER BY setzposition',
            [turnierId]
        );

        if (teams.length < 4) {
            return res.status(400).json({ error: 'Need at least 4 teams for Swiss' });
        }

        // Initialize seeds
        for (let i = 0; i < teams.length; i++) {
            await db.query('UPDATE turnier_teams SET initial_seed = ? WHERE id = ?', [i + 1, teams[i].id]);
        }

        const [felder] = await db.query(
            'SELECT * FROM turnier_felder WHERE turnier_id = ? AND aktiv = 1 ORDER BY feld_nummer',
            [turnierId]
        );

        const [phases] = await db.query('SELECT * FROM turnier_phasen WHERE turnier_id = ?', [turnierId]);
        let mainPhase = phases.find(p => p.phase_name === 'Main Swiss') || phases[0];

        // Generate Round 1 pairings
        const pairingTeams = teams.map(t => ({
            id: t.id,
            score: 0,
            buchholz: 0,
            initialSeed: t.setzposition || 999,
            opponents: []
        }));

        const round1Result = swissPairing.pairRound1Dutch(pairingTeams, {});
        
        const currentTime = new Date(`${config.turnier_datum}T${config.startzeit}`);
        const spiele = [];
        let spielNummer = 1;

        for (let i = 0; i < round1Result.pairs.length; i++) {
            const pair = round1Result.pairs[i];
            const bestCode = generateConfirmationCode();
            
            let feldId = null;
            let geplante_zeit = null;
            let status = 'wartend';
            
            if (i < felder.length) {
                feldId = felder[i].id;
                geplante_zeit = new Date(currentTime);
                status = 'geplant';
            }

            spiele.push({
                turnier_id: turnierId,
                phase_id: mainPhase.id,
                runde: 1,
                spiel_nummer: spielNummer++,
                team1_id: pair.teamA.id,
                team2_id: pair.teamB ? pair.teamB.id : null,
                feld_id: feldId,
                geplante_zeit,
                status,
                bestaetigungs_code: bestCode
            });
        }

        for (const spiel of spiele) {
            const [result] = await db.query(
                `INSERT INTO turnier_spiele 
                (turnier_id, phase_id, runde, spiel_nummer, team1_id, team2_id, feld_id, geplante_zeit, status, bestaetigungs_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [spiel.turnier_id, spiel.phase_id, spiel.runde, spiel.spiel_nummer, 
                 spiel.team1_id, spiel.team2_id, spiel.feld_id, spiel.geplante_zeit, 
                 spiel.status, spiel.bestaetigungs_code]
            );

            if (spiel.team1_id && spiel.team2_id) {
                await recordOpponent(turnierId, spiel.team1_id, spiel.team2_id, result.insertId, spiel.runde);
            }
        }

        await logAudit(turnierId, 'START_SWISS', 'turnier_spiele', null, null, { 
            games_created: spiele.length
        });

        res.json({ 
            success: true, 
            modus: 'swiss',
            spiele_erstellt: spiele.length
        });
    } catch (err) {
        console.error('Start Swiss error:', err);
        throw err;
    }
}

// Start bracket tournament (original logic)
async function startBracketTournament(turnierId, config, res) {
    try {
        const [teams] = await db.query(
            'SELECT * FROM turnier_teams WHERE turnier_id = ? AND status IN ("angemeldet", "bestaetigt") ORDER BY klasse, setzposition, RAND()',
            [turnierId]
        );

        if (teams.length < 2) {
            return res.status(400).json({ error: 'Not enough teams' });
        }

        const [phases] = await db.query('SELECT * FROM turnier_phasen WHERE turnier_id = ? AND phase_name = "Plan A"', [turnierId]);
        if (phases.length === 0) {
            return res.status(400).json({ error: 'Phase Plan A not found' });
        }
        const planAId = phases[0].id;

        const [felder] = await db.query('SELECT * FROM turnier_felder WHERE turnier_id = ? AND aktiv = 1 ORDER BY feld_nummer', [turnierId]);

        if (felder.length === 0) {
            return res.status(400).json({ error: 'No active fields available' });
        }

        let orderedTeams;
        if (config.modus === 'seeded') {
            orderedTeams = seedTeams(teams);
        } else {
            orderedTeams = shuffleArray([...teams]);
        }

        const allPairings = [];
        for (let i = 0; i < orderedTeams.length; i += 2) {
            const team1 = orderedTeams[i];
            const team2 = orderedTeams[i + 1] || null;
            allPairings.push({ team1, team2 });
        }

        const maxGamesToCreate = Math.min(felder.length, allPairings.length);
        const spiele = [];
        let spielNummer = 1;
        const currentTime = new Date(`${config.turnier_datum}T${config.startzeit}`);

        for (let i = 0; i < maxGamesToCreate; i++) {
            const pairing = allPairings[i];
            const feld = felder[i];
            const bestCode = generateConfirmationCode();

            spiele.push({
                turnier_id: turnierId,
                phase_id: planAId,
                runde: 1,
                spiel_nummer: spielNummer,
                team1_id: pairing.team1.id,
                team2_id: pairing.team2 ? pairing.team2.id : null,
                feld_id: feld.id,
                geplante_zeit: new Date(currentTime),
                status: pairing.team2 ? 'geplant' : 'beendet',
                gewinner_id: pairing.team2 ? null : pairing.team1.id,
                bestaetigungs_code: bestCode
            });

            spielNummer++;
        }

        for (let i = maxGamesToCreate; i < allPairings.length; i++) {
            const pairing = allPairings[i];
            const bestCode = generateConfirmationCode();

            spiele.push({
                turnier_id: turnierId,
                phase_id: planAId,
                runde: 1,
                spiel_nummer: spielNummer,
                team1_id: pairing.team1.id,
                team2_id: pairing.team2 ? pairing.team2.id : null,
                feld_id: null,
                geplante_zeit: null,
                status: pairing.team2 ? 'wartend' : 'beendet',
                gewinner_id: pairing.team2 ? null : pairing.team1.id,
                bestaetigungs_code: bestCode
            });

            spielNummer++;
        }

        for (const spiel of spiele) {
            await db.query(
                `INSERT INTO turnier_spiele 
                (turnier_id, phase_id, runde, spiel_nummer, team1_id, team2_id, feld_id, geplante_zeit, status, gewinner_id, bestaetigungs_code) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [spiel.turnier_id, spiel.phase_id, spiel.runde, spiel.spiel_nummer, spiel.team1_id, spiel.team2_id, spiel.feld_id, spiel.geplante_zeit, spiel.status, spiel.gewinner_id, spiel.bestaetigungs_code]
            );
        }

        await logAudit(turnierId, 'START_TURNIER', 'turnier_spiele', null, null, { 
            games_created: spiele.length,
            games_on_fields: maxGamesToCreate,
            games_waiting: spiele.length - maxGamesToCreate
        });

        res.json({ 
            success: true, 
            spiele_erstellt: spiele.length,
            spiele_auf_feldern: maxGamesToCreate,
            spiele_wartend: spiele.length - maxGamesToCreate
        });
    } catch (err) {
        console.error('Start bracket error:', err);
        throw err;
    }
}

// Helper: Seed teams using pot system
function seedTeams(teams) {
    // Sort by seed position, then distribute for balanced bracket
    const sorted = [...teams].sort((a, b) => a.setzposition - b.setzposition);
    const n = sorted.length;
    const result = new Array(n);
    
    // Simple bracket seeding
    for (let i = 0; i < n; i++) {
        result[i] = sorted[i];
    }
    
    // Rearrange for bracket fairness (top seeds separated)
    return bracketSeed(result);
}

function bracketSeed(teams) {
    const n = teams.length;
    if (n <= 2) return teams;
    
    // Simple implementation: alternate distribution
    const result = [];
    const mid = Math.ceil(n / 2);
    const top = teams.slice(0, mid);
    const bottom = teams.slice(mid);
    
    for (let i = 0; i < mid; i++) {
        if (top[i]) result.push(top[i]);
        if (bottom[i]) result.push(bottom[i]);
    }
    
    return result;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==========================================
// RESULT SUBMISSION (FOR REFEREES)
// ==========================================

// Submit result (referee or team) - with strict rate limiting
app.post('/api/turniere/:turnierId/spiele/:spielId/ergebnis', strictLimiter, async (req, res) => {
    try {
        const { spielId, turnierId } = req.params;
        const {
            ergebnis_team1,
            ergebnis_team2,
            satz1_team1, satz1_team2,
            satz2_team1, satz2_team2,
            satz3_team1, satz3_team2,
            gemeldet_von = 'schiedsrichter',
            melder_name,
            melder_email,
            bestaetigungs_code
        } = req.body;

        // Validate input
        if (ergebnis_team1 === undefined || ergebnis_team2 === undefined) {
            return res.status(400).json({ error: 'Score required' });
        }

        // Get game
        const [games] = await db.query('SELECT * FROM turnier_spiele WHERE id = ? AND turnier_id = ?', [spielId, turnierId]);
        if (games.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }
        const game = games[0];

        // Store result report
        await db.query(
            `INSERT INTO turnier_ergebnis_meldungen 
            (spiel_id, gemeldet_von, melder_name, melder_email, ergebnis_team1, ergebnis_team2, 
             satz1_team1, satz1_team2, satz2_team1, satz2_team2, satz3_team1, satz3_team2, 
             bestaetigungs_code_eingabe, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gemeldet')`,
            [spielId, gemeldet_von, melder_name, melder_email, ergebnis_team1, ergebnis_team2,
             satz1_team1, satz1_team2, satz2_team1, satz2_team2, satz3_team1, satz3_team2, bestaetigungs_code]
        );

        // Update game status to waiting for confirmation
        await db.query(
            'UPDATE turnier_spiele SET status = "wartend_bestaetigung" WHERE id = ?',
            [spielId]
        );

        res.json({ success: true, message: 'Ergebnis gemeldet - wartet auf Bestätigung' });
    } catch (err) {
        console.error('POST ergebnis error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Confirm result (loser team confirmation) - with strict rate limiting
app.post('/api/turniere/:turnierId/spiele/:spielId/bestaetigen', strictLimiter, async (req, res) => {
    try {
        const { spielId, turnierId } = req.params;
        const { bestaetigungs_code } = req.body;

        // Get game
        const [games] = await db.query('SELECT * FROM turnier_spiele WHERE id = ? AND turnier_id = ?', [spielId, turnierId]);
        if (games.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }
        const game = games[0];

        // Get latest reported result to determine who is the loser
        const [reportedResults] = await db.query(
            'SELECT * FROM turnier_ergebnis_meldungen WHERE spiel_id = ? AND status = "gemeldet" ORDER BY created_at DESC LIMIT 1',
            [spielId]
        );

        if (reportedResults.length === 0) {
            return res.status(400).json({ error: 'No result to confirm' });
        }

        const reportedResult = reportedResults[0];

        // Determine the winner and loser team based on reported scores
        const { gewinnerId, verliererId } = determineWinnerLoser(
            reportedResult.ergebnis_team1,
            reportedResult.ergebnis_team2,
            game.team1_id,
            game.team2_id
        );

        // If it's a tie, reject the result (volleyball doesn't have ties)
        if (gewinnerId === null) {
            return res.status(400).json({ error: 'Tie games are not allowed - please provide a valid result' });
        }

        // Get the loser team's confirmation code
        let validCode = game.bestaetigungs_code; // fallback to game code
        if (verliererId) {
            const [loserTeam] = await db.query('SELECT bestaetigungs_code FROM turnier_teams WHERE id = ?', [verliererId]);
            if (loserTeam.length > 0 && loserTeam[0].bestaetigungs_code) {
                validCode = loserTeam[0].bestaetigungs_code;
            }
        }

        // Check confirmation code - compare with both uppercase versions
        const enteredCode = (bestaetigungs_code || '').toUpperCase();
        const expectedCode = (validCode || '').toUpperCase();
        
        if (expectedCode && enteredCode !== expectedCode) {
            return res.status(403).json({ error: 'Invalid confirmation code' });
        }

        // Use the reported result for updating the game
        const meldung = reportedResult;

        // Update game with confirmed result
        await db.query(
            `UPDATE turnier_spiele SET 
             ergebnis_team1 = ?, ergebnis_team2 = ?,
             satz1_team1 = ?, satz1_team2 = ?,
             satz2_team1 = ?, satz2_team2 = ?,
             satz3_team1 = ?, satz3_team2 = ?,
             gewinner_id = ?, verlierer_id = ?,
             status = 'beendet',
             bestaetigt_von_verlierer = 1,
             bestaetigt_zeit = NOW()
             WHERE id = ?`,
            [meldung.ergebnis_team1, meldung.ergebnis_team2,
             meldung.satz1_team1, meldung.satz1_team2,
             meldung.satz2_team1, meldung.satz2_team2,
             meldung.satz3_team1, meldung.satz3_team2,
             gewinnerId, verliererId, spielId]
        );

        // Update result report status
        await db.query('UPDATE turnier_ergebnis_meldungen SET status = "bestaetigt" WHERE id = ?', [meldung.id]);

        // Record opponent relationship for Swiss tracking
        if (game.team1_id && game.team2_id) {
            await recordOpponent(turnierId, game.team1_id, game.team2_id, spielId, game.runde);
        }

        // Get tournament mode
        const [config] = await db.query('SELECT modus FROM turnier_config WHERE id = ?', [turnierId]);
        const modus = config[0]?.modus;

        // Progress based on tournament mode
        if (modus === 'swiss' || modus === 'swiss_144') {
            await progressSwissTournament(turnierId, game);
        } else {
            // Bracket mode - create next round games for winner and loser
            await progressTournamentBracket(turnierId, game, gewinnerId, verliererId);
        }

        // If the game had a field assigned, assign the next waiting game to that field
        if (game.feld_id) {
            await assignNextWaitingGame(turnierId, game.feld_id);
        }

        await logAudit(turnierId, 'CONFIRM_RESULT', 'turnier_spiele', spielId, null, { gewinner_id: gewinnerId });

        res.json({ success: true, gewinner_id: gewinnerId });
    } catch (err) {
        console.error('POST bestaetigen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// ADMIN RESULT MANAGEMENT
// ==========================================

// Get pending results
app.get('/api/turniere/:turnierId/meldungen', async (req, res) => {
    try {
        const { status = 'gemeldet' } = req.query;
        const [rows] = await db.query(`
            SELECT m.*, 
                   s.spiel_nummer, s.runde, s.team1_id, s.team2_id, s.bestaetigungs_code,
                   t1.team_name as team1_name, t1.bestaetigungs_code as team1_code,
                   t2.team_name as team2_name, t2.bestaetigungs_code as team2_code,
                   p.phase_name
            FROM turnier_ergebnis_meldungen m
            JOIN turnier_spiele s ON m.spiel_id = s.id
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_phasen p ON s.phase_id = p.id
            WHERE s.turnier_id = ? AND m.status = ?
            ORDER BY m.created_at DESC
        `, [req.params.turnierId, status]);
        
        // Add loser_team_code to each row based on the scores
        const processedRows = rows.map(row => {
            const { verliererId } = determineWinnerLoser(
                row.ergebnis_team1,
                row.ergebnis_team2,
                row.team1_id,
                row.team2_id
            );
            let loserTeamCode = null;
            let loserTeamName = null;
            if (verliererId === row.team1_id) {
                loserTeamCode = row.team1_code;
                loserTeamName = row.team1_name;
            } else if (verliererId === row.team2_id) {
                loserTeamCode = row.team2_code;
                loserTeamName = row.team2_name;
            }
            return {
                ...row,
                loser_team_code: loserTeamCode,
                loser_team_name: loserTeamName
            };
        });
        
        res.json(processedRows);
    } catch (err) {
        console.error('GET meldungen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin: Approve result directly
app.post('/api/turniere/:turnierId/meldungen/:meldungId/genehmigen', async (req, res) => {
    try {
        const { meldungId, turnierId } = req.params;
        const { geprueft_von } = req.body;

        // Get meldung
        const [meldungen] = await db.query('SELECT * FROM turnier_ergebnis_meldungen WHERE id = ?', [meldungId]);
        if (meldungen.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        const meldung = meldungen[0];

        // Get game
        const [games] = await db.query('SELECT * FROM turnier_spiele WHERE id = ?', [meldung.spiel_id]);
        if (games.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }
        const game = games[0];

        // Determine winner using helper function
        const { gewinnerId, verliererId } = determineWinnerLoser(
            meldung.ergebnis_team1,
            meldung.ergebnis_team2,
            game.team1_id,
            game.team2_id
        );

        // If it's a tie, reject the result
        if (gewinnerId === null) {
            return res.status(400).json({ error: 'Tie games are not allowed' });
        }

        // Update game
        await db.query(
            `UPDATE turnier_spiele SET 
             ergebnis_team1 = ?, ergebnis_team2 = ?,
             satz1_team1 = ?, satz1_team2 = ?,
             satz2_team1 = ?, satz2_team2 = ?,
             satz3_team1 = ?, satz3_team2 = ?,
             gewinner_id = ?, verlierer_id = ?,
             status = 'beendet',
             bestaetigt_von_verlierer = 0,
             bestaetigt_zeit = NOW()
             WHERE id = ?`,
            [meldung.ergebnis_team1, meldung.ergebnis_team2,
             meldung.satz1_team1, meldung.satz1_team2,
             meldung.satz2_team1, meldung.satz2_team2,
             meldung.satz3_team1, meldung.satz3_team2,
             gewinnerId, verliererId, meldung.spiel_id]
        );

        // Update meldung
        await db.query(
            'UPDATE turnier_ergebnis_meldungen SET status = "bestaetigt", geprueft_von = ?, geprueft_zeit = NOW() WHERE id = ?',
            [geprueft_von, meldungId]
        );

        // Record opponent relationship for Swiss tracking
        if (game.team1_id && game.team2_id) {
            await recordOpponent(turnierId, game.team1_id, game.team2_id, meldung.spiel_id, game.runde);
        }

        // Get tournament mode
        const [config] = await db.query('SELECT modus FROM turnier_config WHERE id = ?', [turnierId]);
        const modus = config[0]?.modus;

        // Progress based on tournament mode
        if (modus === 'swiss' || modus === 'swiss_144') {
            await progressSwissTournament(turnierId, game);
        } else {
            // Bracket mode - create next round games for winner and loser
            await progressTournamentBracket(turnierId, game, gewinnerId, verliererId);
        }

        // If the game had a field assigned, assign the next waiting game to that field
        if (game.feld_id) {
            await assignNextWaitingGame(turnierId, game.feld_id);
        }

        await logAudit(turnierId, 'ADMIN_APPROVE', 'turnier_ergebnis_meldungen', meldungId, null, { geprueft_von });

        res.json({ success: true });
    } catch (err) {
        console.error('POST genehmigen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Admin: Update result directly
app.put('/api/turniere/:turnierId/spiele/:spielId/admin-ergebnis', async (req, res) => {
    try {
        const { spielId, turnierId } = req.params;
        const {
            ergebnis_team1, ergebnis_team2,
            satz1_team1, satz1_team2,
            satz2_team1, satz2_team2,
            satz3_team1, satz3_team2,
            bemerkung,
            bearbeitet_von
        } = req.body;

        // Get old values
        const [oldGame] = await db.query('SELECT * FROM turnier_spiele WHERE id = ? AND turnier_id = ?', [spielId, turnierId]);
        if (oldGame.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const game = oldGame[0];

        // Determine winner using helper function
        const { gewinnerId, verliererId } = determineWinnerLoser(
            ergebnis_team1,
            ergebnis_team2,
            game.team1_id,
            game.team2_id
        );

        // If it's a tie, reject the result
        if (gewinnerId === null) {
            return res.status(400).json({ error: 'Tie games are not allowed' });
        }

        await db.query(
            `UPDATE turnier_spiele SET 
             ergebnis_team1 = ?, ergebnis_team2 = ?,
             satz1_team1 = ?, satz1_team2 = ?,
             satz2_team1 = ?, satz2_team2 = ?,
             satz3_team1 = ?, satz3_team2 = ?,
             gewinner_id = ?, verlierer_id = ?,
             status = 'beendet',
             bemerkung = ?
             WHERE id = ?`,
            [ergebnis_team1, ergebnis_team2,
             satz1_team1, satz1_team2,
             satz2_team1, satz2_team2,
             satz3_team1, satz3_team2,
             gewinnerId, verliererId,
             bemerkung, spielId]
        );

        // Record opponent relationship for Swiss tracking
        if (game.team1_id && game.team2_id && game.status !== 'beendet') {
            await recordOpponent(turnierId, game.team1_id, game.team2_id, spielId, game.runde);
        }

        // Progress the tournament if the game wasn't already finished
        if (game.status !== 'beendet') {
            // Get tournament mode
            const [config] = await db.query('SELECT modus FROM turnier_config WHERE id = ?', [turnierId]);
            const modus = config[0]?.modus;

            // Progress based on tournament mode
            if (modus === 'swiss' || modus === 'swiss_144') {
                await progressSwissTournament(turnierId, game);
            } else {
                await progressTournamentBracket(turnierId, game, gewinnerId, verliererId);
            }
        }

        // If the game had a field assigned and wasn't already finished, assign the next waiting game
        if (game.feld_id && game.status !== 'beendet') {
            await assignNextWaitingGame(turnierId, game.feld_id);
        }

        await logAudit(turnierId, 'ADMIN_UPDATE_RESULT', 'turnier_spiele', spielId, game, req.body, bearbeitet_von);

        res.json({ success: true });
    } catch (err) {
        console.error('PUT admin-ergebnis error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// FIELD ASSIGNMENT
// ==========================================

// Auto-assign fields
app.post('/api/turniere/:turnierId/felder-zuweisen', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;

        // Get config
        const [configRows] = await db.query('SELECT * FROM turnier_config WHERE id = ?', [turnierId]);
        if (configRows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        const config = configRows[0];

        // Get active fields
        const [felder] = await db.query(
            'SELECT * FROM turnier_felder WHERE turnier_id = ? AND aktiv = 1 ORDER BY feld_nummer',
            [turnierId]
        );

        // Get unassigned games
        const [spiele] = await db.query(
            'SELECT * FROM turnier_spiele WHERE turnier_id = ? AND feld_id IS NULL AND status = "geplant" ORDER BY runde, spiel_nummer',
            [turnierId]
        );

        if (spiele.length === 0) {
            return res.json({ success: true, message: 'No games to assign', assigned: 0 });
        }

        let assigned = 0;
        let currentTime = new Date(`${config.turnier_datum}T${config.startzeit}`);
        let feldIndex = 0;

        for (const spiel of spiele) {
            const feld = felder[feldIndex % felder.length];

            await db.query(
                'UPDATE turnier_spiele SET feld_id = ?, geplante_zeit = ? WHERE id = ?',
                [feld.id, currentTime, spiel.id]
            );

            feldIndex++;
            assigned++;

            // Move time after all fields used
            if (feldIndex % felder.length === 0) {
                currentTime = new Date(currentTime.getTime() + (config.spielzeit_minuten + config.pause_minuten) * 60000);
            }
        }

        res.json({ success: true, assigned });
    } catch (err) {
        console.error('POST felder-zuweisen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// RANKING CALCULATION
// ==========================================

// Calculate ranking after X rounds
app.post('/api/turniere/:turnierId/platzierung-berechnen', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;
        const { nach_runde } = req.body;

        if (!nach_runde) {
            return res.status(400).json({ error: 'nach_runde required' });
        }

        // Get all finished games up to this round
        const [spiele] = await db.query(
            `SELECT * FROM turnier_spiele 
             WHERE turnier_id = ? AND runde <= ? AND status = 'beendet'`,
            [turnierId, nach_runde]
        );

        // Get all teams
        const [teams] = await db.query(
            'SELECT id FROM turnier_teams WHERE turnier_id = ?',
            [turnierId]
        );

        // Calculate stats for each team
        const stats = {};
        for (const team of teams) {
            stats[team.id] = {
                team_id: team.id,
                siege: 0,
                niederlagen: 0,
                punkte_dafuer: 0,
                punkte_dagegen: 0,
                saetze_gewonnen: 0,
                saetze_verloren: 0
            };
        }

        for (const spiel of spiele) {
            if (spiel.gewinner_id && spiel.verlierer_id) {
                const score1 = spiel.ergebnis_team1 || 0;
                const score2 = spiel.ergebnis_team2 || 0;
                const winnerScore = getWinnerScore(score1, score2);
                const loserScore = getLoserScore(score1, score2);

                if (stats[spiel.gewinner_id]) {
                    stats[spiel.gewinner_id].siege++;
                    stats[spiel.gewinner_id].punkte_dafuer += winnerScore;
                    stats[spiel.gewinner_id].punkte_dagegen += loserScore;
                }
                if (stats[spiel.verlierer_id]) {
                    stats[spiel.verlierer_id].niederlagen++;
                    stats[spiel.verlierer_id].punkte_dafuer += loserScore;
                    stats[spiel.verlierer_id].punkte_dagegen += winnerScore;
                }
            }
        }

        // Sort teams by wins, then point difference
        const sorted = Object.values(stats).sort((a, b) => {
            if (b.siege !== a.siege) return b.siege - a.siege;
            const diffA = a.punkte_dafuer - a.punkte_dagegen;
            const diffB = b.punkte_dafuer - b.punkte_dagegen;
            return diffB - diffA;
        });

        // Delete old ranking for this round
        await db.query(
            'DELETE FROM turnier_zwischenstand WHERE turnier_id = ? AND nach_runde = ?',
            [turnierId, nach_runde]
        );

        // Insert new ranking
        for (let i = 0; i < sorted.length; i++) {
            const s = sorted[i];
            await db.query(
                `INSERT INTO turnier_zwischenstand 
                (turnier_id, team_id, nach_runde, platzierung, siege, niederlagen, punkte_dafuer, punkte_dagegen, punkt_differenz, saetze_gewonnen, saetze_verloren, satz_differenz) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [turnierId, s.team_id, nach_runde, i + 1, s.siege, s.niederlagen, s.punkte_dafuer, s.punkte_dagegen, s.punkte_dafuer - s.punkte_dagegen, s.saetze_gewonnen, s.saetze_verloren, s.saetze_gewonnen - s.saetze_verloren]
            );
        }

        res.json({ success: true, teams_ranked: sorted.length });
    } catch (err) {
        console.error('POST platzierung-berechnen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get ranking
app.get('/api/turniere/:turnierId/platzierung', async (req, res) => {
    try {
        const { nach_runde } = req.query;
        let query = `
            SELECT z.*, t.team_name, t.verein 
            FROM turnier_zwischenstand z
            JOIN turnier_teams t ON z.team_id = t.id
            WHERE z.turnier_id = ?
        `;
        const params = [req.params.turnierId];

        if (nach_runde) {
            query += ' AND z.nach_runde = ?';
            params.push(nach_runde);
        }

        query += ' ORDER BY z.nach_runde DESC, z.platzierung';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('GET platzierung error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Calculate final ranking
app.post('/api/turniere/:turnierId/endplatzierung-berechnen', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;

        // Get all finished games
        const [spiele] = await db.query(
            "SELECT * FROM turnier_spiele WHERE turnier_id = ? AND status = 'beendet'",
            [turnierId]
        );

        // Get all teams
        const [teams] = await db.query(
            'SELECT id FROM turnier_teams WHERE turnier_id = ?',
            [turnierId]
        );

        // Calculate final stats
        const stats = {};
        for (const team of teams) {
            stats[team.id] = {
                team_id: team.id,
                siege: 0,
                niederlagen: 0,
                punkte_dafuer: 0,
                punkte_dagegen: 0
            };
        }

        for (const spiel of spiele) {
            const score1 = spiel.ergebnis_team1 || 0;
            const score2 = spiel.ergebnis_team2 || 0;
            const winnerScore = getWinnerScore(score1, score2);
            const loserScore = getLoserScore(score1, score2);

            if (spiel.gewinner_id && stats[spiel.gewinner_id]) {
                stats[spiel.gewinner_id].siege++;
                stats[spiel.gewinner_id].punkte_dafuer += winnerScore;
                stats[spiel.gewinner_id].punkte_dagegen += loserScore;
            }
            if (spiel.verlierer_id && stats[spiel.verlierer_id]) {
                stats[spiel.verlierer_id].niederlagen++;
                stats[spiel.verlierer_id].punkte_dafuer += loserScore;
                stats[spiel.verlierer_id].punkte_dagegen += winnerScore;
            }
        }

        // Sort
        const sorted = Object.values(stats).sort((a, b) => {
            if (b.siege !== a.siege) return b.siege - a.siege;
            return (b.punkte_dafuer - b.punkte_dagegen) - (a.punkte_dafuer - a.punkte_dagegen);
        });

        // Delete old
        await db.query('DELETE FROM turnier_endplatzierung WHERE turnier_id = ?', [turnierId]);

        // Insert new
        for (let i = 0; i < sorted.length; i++) {
            const s = sorted[i];
            await db.query(
                'INSERT INTO turnier_endplatzierung (turnier_id, team_id, endplatzierung, siege, niederlagen, punkte_dafuer, punkte_dagegen) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [turnierId, s.team_id, i + 1, s.siege, s.niederlagen, s.punkte_dafuer, s.punkte_dagegen]
            );
        }

        res.json({ success: true, teams_ranked: sorted.length });
    } catch (err) {
        console.error('POST endplatzierung-berechnen error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get final ranking
app.get('/api/turniere/:turnierId/endplatzierung', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.*, t.team_name, t.verein 
            FROM turnier_endplatzierung e
            JOIN turnier_teams t ON e.team_id = t.id
            WHERE e.turnier_id = ?
            ORDER BY e.endplatzierung
        `, [req.params.turnierId]);
        res.json(rows);
    } catch (err) {
        console.error('GET endplatzierung error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// RESET TOURNAMENT
// ==========================================

app.post('/api/turniere/:turnierId/reset', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;

        await db.query('DELETE FROM turnier_endplatzierung WHERE turnier_id = ?', [turnierId]);
        await db.query('DELETE FROM turnier_zwischenstand WHERE turnier_id = ?', [turnierId]);
        await db.query('DELETE FROM turnier_ergebnis_meldungen WHERE spiel_id IN (SELECT id FROM turnier_spiele WHERE turnier_id = ?)', [turnierId]);
        await db.query('DELETE FROM turnier_spiele WHERE turnier_id = ?', [turnierId]);

        await logAudit(turnierId, 'RESET', 'turnier', null, null, { reset: true });

        res.json({ success: true, message: 'Tournament reset' });
    } catch (err) {
        console.error('POST reset error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================

// Send game notification email
app.post('/api/turniere/:turnierId/email/spielankuendigung', async (req, res) => {
    try {
        const { spiel_id } = req.body;

        // Get tournament config for SMTP
        const [configRows] = await db.query('SELECT * FROM turnier_config WHERE id = ?', [req.params.turnierId]);
        if (configRows.length === 0 || !configRows[0].email_benachrichtigung) {
            return res.status(400).json({ error: 'Email not configured or disabled' });
        }
        const config = configRows[0];

        // Get game details
        const [games] = await db.query(`
            SELECT s.*, 
                   t1.team_name as team1_name, t1.email as team1_email,
                   t2.team_name as team2_name, t2.email as team2_email,
                   f.feld_name
            FROM turnier_spiele s
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_felder f ON s.feld_id = f.id
            WHERE s.id = ?
        `, [spiel_id]);

        if (games.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const game = games[0];

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: config.smtp_host || process.env.SMTP_HOST,
            port: config.smtp_port || parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: {
                user: config.smtp_user || process.env.SMTP_USER,
                pass: config.smtp_pass || process.env.SMTP_PASS
            }
        });

        const spielzeit = game.geplante_zeit ? new Date(game.geplante_zeit).toLocaleString('de-DE') : 'TBA';

        const emails = [game.team1_email, game.team2_email].filter(e => e);

        for (const email of emails) {
            const mailHtml = `
                <h2>🏐 Spielankündigung - ${config.turnier_name}</h2>
                <p>Euer nächstes Spiel steht an!</p>
                <table border="1" cellpadding="8" style="border-collapse: collapse;">
                    <tr><td><strong>Spiel Nr.</strong></td><td>${game.spiel_nummer}</td></tr>
                    <tr><td><strong>Team 1</strong></td><td>${game.team1_name}</td></tr>
                    <tr><td><strong>Team 2</strong></td><td>${game.team2_name}</td></tr>
                    <tr><td><strong>Feld</strong></td><td>${game.feld_name}</td></tr>
                    <tr><td><strong>Zeit</strong></td><td>${spielzeit}</td></tr>
                </table>
                <p>Viel Erfolg!</p>
            `;

            await transporter.sendMail({
                from: config.smtp_sender || process.env.SMTP_SENDER,
                to: email,
                subject: `🏐 Spielankündigung: ${game.team1_name} vs ${game.team2_name}`,
                html: mailHtml
            });

            // Log email
            await db.query(
                'INSERT INTO turnier_email_log (turnier_id, spiel_id, email_typ, empfaenger_email, betreff, nachricht, erfolgreich) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.params.turnierId, spiel_id, 'spielankuendigung', email, `Spielankündigung: Spiel ${game.spiel_nummer}`, mailHtml, true]
            );
        }

        res.json({ success: true, emails_sent: emails.length });
    } catch (err) {
        console.error('POST email error:', err);
        res.status(500).json({ error: 'Email error: ' + err.message });
    }
});

// ==========================================
// PUBLIC BRACKET VIEW (for teams to see their schedule)
// ==========================================

// Get tournament bracket view
app.get('/api/public/turniere/:turnierId/bracket', async (req, res) => {
    try {
        const turnierId = req.params.turnierId;

        const [config] = await db.query('SELECT turnier_name, turnier_datum FROM turnier_config WHERE id = ? AND aktiv = 1', [turnierId]);
        if (config.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        const [phasen] = await db.query('SELECT * FROM turnier_phasen WHERE turnier_id = ? ORDER BY reihenfolge', [turnierId]);

        const [spiele] = await db.query(`
            SELECT s.id, s.phase_id, s.runde, s.spiel_nummer, s.geplante_zeit, s.status,
                   s.ergebnis_team1, s.ergebnis_team2,
                   t1.team_name as team1_name,
                   t2.team_name as team2_name,
                   gew.team_name as gewinner_name,
                   f.feld_name
            FROM turnier_spiele s
            LEFT JOIN turnier_teams t1 ON s.team1_id = t1.id
            LEFT JOIN turnier_teams t2 ON s.team2_id = t2.id
            LEFT JOIN turnier_teams gew ON s.gewinner_id = gew.id
            LEFT JOIN turnier_felder f ON s.feld_id = f.id
            WHERE s.turnier_id = ?
            ORDER BY s.runde, s.spiel_nummer
        `, [turnierId]);

        res.json({
            turnier: config[0],
            phasen,
            spiele
        });
    } catch (err) {
        console.error('GET bracket error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==========================================
// SERVER START
// ==========================================

const PORT = process.env.TURNIER_PORT || 3004;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Turnier-Server läuft auf Port ${PORT}`);
});
