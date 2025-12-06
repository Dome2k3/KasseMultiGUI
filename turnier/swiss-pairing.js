// swiss-pairing.js - Swiss Tournament Pairing Engine
// Implements controlled Swiss system (Dutch/FIDE-style) for 128-team main field

/**
 * Team object structure:
 * {
 *   id: number,
 *   score: number (0.5 for each win),
 *   buchholz: number (sum of opponents' scores),
 *   initialSeed: number (1-128, lower is better),
 *   opponents: [opponent_ids...] (array of team IDs already faced)
 * }
 */

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================

const DEFAULT_OPTIONS = {
    timeLimitMs: 3000,
    pairingTimeMs: 1500,
    repairTimeMs: 1500,
    maxIterations: 20000,
    maxBacktracks: 20000,
    allowFallback: true,
    floaterSelection: 'weakest', // 'weakest' or 'strongest'
    halfSplit: true, // Use half-split for candidate ordering
};

// ==========================================
// MAIN ENTRY POINT
// ==========================================

/**
 * Compute Swiss pairings for the next round
 * @param {Array} teams - Array of team objects with scores and opponents
 * @param {Number} roundNumber - Current round number (1-based)
 * @param {Object} options - Configuration options
 * @returns {Object} { success: bool, pairs: [{teamA, teamB}], rematchCount: number, meta: {...} }
 */
function computeSwissPairings(teams, roundNumber, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Validate input
    if (!teams || teams.length < 2) {
        return { success: false, pairs: [], rematchCount: 0, error: 'Not enough teams' };
    }

    // Odd number of teams - add a bye (dummy opponent)
    let teamsWithBye = [...teams];
    let byeTeam = null;
    if (teams.length % 2 === 1) {
        // Find team with lowest score who hasn't had a bye
        const byeCandidates = teams
            .filter(t => !t.hadBye)
            .sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                if (a.buchholz !== b.buchholz) return a.buchholz - b.buchholz;
                return b.initialSeed - a.initialSeed;
            });
        
        if (byeCandidates.length > 0) {
            byeTeam = byeCandidates[0];
            teamsWithBye = teams.filter(t => t.id !== byeTeam.id);
        }
    }

    // Round 1: Use Dutch seeding (controlled split)
    if (roundNumber === 1) {
        const result = pairRound1Dutch(teamsWithBye, opts);
        if (byeTeam) {
            result.pairs.push({ teamA: byeTeam, teamB: null, isBye: true });
        }
        result.timeUsed = Date.now() - startTime;
        return result;
    }

    // Rounds 2+: Use score-based Swiss pairing
    try {
        // Step 1: Quick greedy pairing
        const greedyResult = quickGreedyPairing(teamsWithBye, opts);
        
        // Step 2: Try to repair rematches with swap optimization
        if (greedyResult.rematchCount > 0) {
            const teamMap = createTeamMap(teamsWithBye);
            const repairResult = repairPairingsGreedySwap(
                greedyResult.pairs,
                teamMap,
                { timeLimitMs: opts.repairTimeMs }
            );
            
            if (repairResult.success) {
                greedyResult.pairs = repairResult.pairs;
                greedyResult.rematchCount = repairResult.rematchCount;
                greedyResult.meta = { ...greedyResult.meta, repairApplied: true };
            }
        }

        // Step 3: If still have rematches, try iterative backtracking
        if (greedyResult.rematchCount > 0) {
            const iterativeResult = computeSwissPairingsIterative(teamsWithBye, roundNumber, {
                pairingTimeMs: opts.pairingTimeMs,
                maxIterations: opts.maxIterations,
                floaterSelection: opts.floaterSelection,
                halfSplit: opts.halfSplit,
                allowFallback: opts.allowFallback,
            });
            
            if (iterativeResult.success && iterativeResult.rematchCount < greedyResult.rematchCount) {
                if (byeTeam) {
                    iterativeResult.pairs.push({ teamA: byeTeam, teamB: null, isBye: true });
                }
                iterativeResult.timeUsed = Date.now() - startTime;
                return iterativeResult;
            }
        }

        // Return best result
        if (byeTeam) {
            greedyResult.pairs.push({ teamA: byeTeam, teamB: null, isBye: true });
        }
        greedyResult.timeUsed = Date.now() - startTime;
        return greedyResult;
        
    } catch (err) {
        console.error('Swiss pairing error:', err);
        return {
            success: false,
            pairs: [],
            rematchCount: 0,
            error: err.message,
            timeUsed: Date.now() - startTime
        };
    }
}

// ==========================================
// ROUND 1: DUTCH/FIDE SEEDING
// ==========================================

/**
 * Pair Round 1 using Dutch system (top half vs bottom half)
 * Team 1 plays Team 65, Team 2 plays Team 66, etc.
 */
function pairRound1Dutch(teams, opts) {
    // Sort by initial seed (1 = best, 128 = worst for Bundesliga teams first)
    const sorted = [...teams].sort((a, b) => a.initialSeed - b.initialSeed);
    
    const n = sorted.length;
    const mid = Math.ceil(n / 2);
    const topHalf = sorted.slice(0, mid);
    const bottomHalf = sorted.slice(mid);
    
    const pairs = [];
    for (let i = 0; i < topHalf.length; i++) {
        const teamA = topHalf[i];
        const teamB = bottomHalf[i] || null;
        if (teamB) {
            pairs.push({ teamA, teamB });
        } else {
            // Odd number - last team gets bye
            pairs.push({ teamA, teamB: null, isBye: true });
        }
    }
    
    return {
        success: true,
        pairs,
        rematchCount: 0,
        meta: { method: 'dutch_round1', teamsCount: n }
    };
}

// ==========================================
// QUICK GREEDY PAIRING
// ==========================================

/**
 * Quick greedy pairing with score groups and half-split
 */
function quickGreedyPairing(teams, opts) {
    const groups = groupByScore(teams);
    const pairs = [];
    let rematchCount = 0;

    for (const group of groups) {
        const groupPairs = pairGroupGreedy(group, opts);
        pairs.push(...groupPairs.pairs);
        rematchCount += groupPairs.rematchCount;
    }

    return {
        success: true,
        pairs,
        rematchCount,
        meta: { method: 'greedy', groupsCount: groups.length }
    };
}

/**
 * Pair a single score group greedily with half-split
 */
function pairGroupGreedy(group, opts) {
    if (group.length === 0) return { pairs: [], rematchCount: 0 };
    if (group.length === 1) {
        // Floater - should be handled by caller
        return { pairs: [{ teamA: group[0], teamB: null, isFloater: true }], rematchCount: 0 };
    }

    const pairs = [];
    const paired = new Set();
    let rematchCount = 0;

    // Sort by buchholz and seed
    const sorted = [...group].sort((a, b) => {
        if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
        return a.initialSeed - b.initialSeed;
    });

    const n = sorted.length;
    const mid = Math.ceil(n / 2);

    for (let i = 0; i < mid; i++) {
        if (paired.has(sorted[i].id)) continue;

        const teamA = sorted[i];
        let teamB = null;

        // Try to find opponent from bottom half (half-split)
        if (opts.halfSplit) {
            for (let j = mid; j < n; j++) {
                if (paired.has(sorted[j].id)) continue;
                const candidate = sorted[j];
                
                if (!hasPlayed(teamA, candidate)) {
                    teamB = candidate;
                    break;
                }
            }
        }

        // If no match in bottom half, try top half
        if (!teamB) {
            for (let j = i + 1; j < n; j++) {
                if (paired.has(sorted[j].id)) continue;
                const candidate = sorted[j];
                
                if (!hasPlayed(teamA, candidate)) {
                    teamB = candidate;
                    break;
                }
            }
        }

        // If still no match, pair with first available (rematch)
        if (!teamB) {
            for (let j = i + 1; j < n; j++) {
                if (paired.has(sorted[j].id)) continue;
                teamB = sorted[j];
                rematchCount++;
                break;
            }
        }

        if (teamB) {
            pairs.push({ teamA, teamB });
            paired.add(teamA.id);
            paired.add(teamB.id);
        }
    }

    return { pairs, rematchCount };
}

// ==========================================
// GREEDY SWAP REPAIR
// ==========================================

/**
 * Try to eliminate rematches by swapping pairs
 * (A,B)+(C,D) -> (A,C)+(B,D) or (A,D)+(B,C)
 */
function repairPairingsGreedySwap(initialPairs, teamMap, options = {}) {
    const startTime = Date.now();
    const timeLimit = options.timeLimitMs || 1500;
    
    let pairs = initialPairs.map(p => ({ ...p }));
    let improved = true;
    let iterations = 0;

    while (improved && (Date.now() - startTime) < timeLimit) {
        improved = false;
        iterations++;

        // Find pairs with rematches
        const rematchPairs = [];
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            if (pair.teamB && hasPlayed(pair.teamA, pair.teamB)) {
                rematchPairs.push(i);
            }
        }

        if (rematchPairs.length === 0) break;

        // Try swapping with other pairs
        for (const i of rematchPairs) {
            if ((Date.now() - startTime) >= timeLimit) break;

            const pairI = pairs[i];
            
            for (let j = 0; j < pairs.length; j++) {
                if (i === j) continue;
                
                const pairJ = pairs[j];
                
                // Try swap: (A,B) + (C,D) -> (A,C) + (B,D)
                if (pairI.teamB && pairJ.teamB) {
                    const newPair1 = { teamA: pairI.teamA, teamB: pairJ.teamA };
                    const newPair2 = { teamA: pairI.teamB, teamB: pairJ.teamB };
                    
                    if (!hasPlayed(newPair1.teamA, newPair1.teamB) && 
                        !hasPlayed(newPair2.teamA, newPair2.teamB)) {
                        pairs[i] = newPair1;
                        pairs[j] = newPair2;
                        improved = true;
                        break;
                    }
                    
                    // Try alternate swap: (A,B) + (C,D) -> (A,D) + (B,C)
                    const altPair1 = { teamA: pairI.teamA, teamB: pairJ.teamB };
                    const altPair2 = { teamA: pairI.teamB, teamB: pairJ.teamA };
                    
                    if (!hasPlayed(altPair1.teamA, altPair1.teamB) && 
                        !hasPlayed(altPair2.teamA, altPair2.teamB)) {
                        pairs[i] = altPair1;
                        pairs[j] = altPair2;
                        improved = true;
                        break;
                    }
                }
            }
            
            if (improved) break;
        }
    }

    const rematchCount = countRematchesInPairs(pairs);
    
    return {
        success: rematchCount === 0,
        pairs,
        rematchCount,
        iterations,
        timeUsed: Date.now() - startTime
    };
}

// ==========================================
// ITERATIVE BACKTRACKING
// ==========================================

/**
 * Iterative DFS pairing with explicit stack (no recursion)
 */
function computeSwissPairingsIterative(teams, roundNumber, options = {}) {
    const startTime = Date.now();
    const timeLimit = options.pairingTimeMs || 2000;
    const maxIterations = options.maxIterations || 20000;
    
    const groups = groupByScore(teams);
    const allPairs = [];
    let totalRematches = 0;
    let iterations = 0;

    // Process each score group
    for (const group of groups) {
        if ((Date.now() - startTime) >= timeLimit) break;

        if (group.length === 0) continue;
        if (group.length === 1) {
            // Floater - will be merged with next group by caller
            allPairs.push({ teamA: group[0], teamB: null, isFloater: true });
            continue;
        }

        const groupResult = pairWithinGroupIterative(group, {
            timeLimit: timeLimit - (Date.now() - startTime),
            maxIterations: maxIterations - iterations,
            halfSplit: options.halfSplit
        });

        allPairs.push(...groupResult.pairs);
        totalRematches += groupResult.rematchCount;
        iterations += groupResult.iterations;
    }

    return {
        success: totalRematches === 0,
        pairs: allPairs,
        rematchCount: totalRematches,
        iterations,
        timeUsed: Date.now() - startTime,
        meta: { method: 'iterative_backtracking', groupsCount: groups.length }
    };
}

/**
 * Iterative backtracking for a single group
 */
function pairWithinGroupIterative(teamList, opts) {
    const n = teamList.length;
    if (n % 2 === 1) {
        // Odd group - should not happen here
        return pairGroupGreedy(teamList, opts);
    }

    const startTime = Date.now();
    const timeLimit = opts.timeLimit || 1000;
    const maxIterations = opts.maxIterations || 10000;

    // Sort teams by buchholz/seed
    const sorted = [...teamList].sort((a, b) => {
        if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
        return a.initialSeed - b.initialSeed;
    });

    // Stack for iterative DFS: { index, pairs, paired }
    const stack = [{ index: 0, pairs: [], paired: new Set() }];
    let bestPairs = null;
    let bestRematchCount = Infinity;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
        iterations++;
        
        if ((Date.now() - startTime) >= timeLimit) break;

        const state = stack.pop();
        const { index, pairs, paired } = state;

        // All teams paired?
        if (paired.size === n) {
            const rematchCount = countRematchesInPairs(pairs);
            if (rematchCount < bestRematchCount) {
                bestRematchCount = rematchCount;
                bestPairs = [...pairs];
                if (rematchCount === 0) break; // Perfect solution
            }
            continue;
        }

        // Find next unpaired team
        let teamA = null;
        for (const t of sorted) {
            if (!paired.has(t.id)) {
                teamA = t;
                break;
            }
        }

        if (!teamA) continue;

        // Try pairing with candidates (half-split ordering)
        const candidates = orderCandidateIndicesForTeam(teamA, sorted, paired, opts.halfSplit);

        for (const candidateIdx of candidates) {
            const teamB = sorted[candidateIdx];
            if (paired.has(teamB.id)) continue;

            // Create new state
            const newPaired = new Set(paired);
            newPaired.add(teamA.id);
            newPaired.add(teamB.id);

            const newPairs = [...pairs, { teamA, teamB }];

            stack.push({ index: index + 1, pairs: newPairs, paired: newPaired });
        }
    }

    // Return best found
    if (bestPairs) {
        return { pairs: bestPairs, rematchCount: bestRematchCount, iterations };
    }

    // Fallback to greedy
    return pairGroupGreedy(teamList, opts);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Group teams by score
 */
function groupByScore(teams) {
    const scoreMap = new Map();
    
    for (const team of teams) {
        const score = team.score || 0;
        if (!scoreMap.has(score)) {
            scoreMap.set(score, []);
        }
        scoreMap.get(score).push(team);
    }

    // Sort groups by score descending
    const groups = Array.from(scoreMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(entry => entry[1]);

    return groups;
}

/**
 * Create team lookup map
 */
function createTeamMap(teams) {
    const map = new Map();
    for (const team of teams) {
        map.set(team.id, team);
    }
    return map;
}

/**
 * Check if two teams have already played
 */
function hasPlayed(teamA, teamB) {
    if (!teamA || !teamB) return false;
    const oppsA = teamA.opponents || [];
    return oppsA.includes(teamB.id);
}

/**
 * Count rematches in a pairing
 */
function countRematchesInPairs(pairs) {
    let count = 0;
    for (const pair of pairs) {
        if (pair.teamB && hasPlayed(pair.teamA, pair.teamB)) {
            count++;
        }
    }
    return count;
}

/**
 * Order candidate indices for a team (half-split heuristic)
 */
function orderCandidateIndicesForTeam(teamA, sortedList, paired, useHalfSplit) {
    const n = sortedList.length;
    const candidates = [];

    if (useHalfSplit) {
        const mid = Math.ceil(n / 2);
        
        // First try bottom half (weaker opponents)
        for (let i = mid; i < n; i++) {
            if (!paired.has(sortedList[i].id) && sortedList[i].id !== teamA.id) {
                if (!hasPlayed(teamA, sortedList[i])) {
                    candidates.push(i);
                }
            }
        }
        
        // Then try top half
        for (let i = 0; i < mid; i++) {
            if (!paired.has(sortedList[i].id) && sortedList[i].id !== teamA.id) {
                if (!hasPlayed(teamA, sortedList[i])) {
                    candidates.push(i);
                }
            }
        }
    } else {
        // Try all in order
        for (let i = 0; i < n; i++) {
            if (!paired.has(sortedList[i].id) && sortedList[i].id !== teamA.id) {
                if (!hasPlayed(teamA, sortedList[i])) {
                    candidates.push(i);
                }
            }
        }
    }

    return candidates;
}

/**
 * Rank floater candidates (for odd groups)
 */
function rankFloaterCandidates(group, selection) {
    if (selection === 'weakest') {
        return [...group].sort((a, b) => {
            if (a.buchholz !== b.buchholz) return a.buchholz - b.buchholz;
            return b.initialSeed - a.initialSeed;
        });
    } else {
        return [...group].sort((a, b) => {
            if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
            return a.initialSeed - b.initialSeed;
        });
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    computeSwissPairings,
    pairRound1Dutch,
    quickGreedyPairing,
    repairPairingsGreedySwap,
    computeSwissPairingsIterative,
    groupByScore,
    hasPlayed,
    countRematchesInPairs,
    createTeamMap,
};
