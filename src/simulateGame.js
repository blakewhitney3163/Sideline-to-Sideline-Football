const db = require('./database');

function randomNormal(mean, stdDev) {
    let u1 = Math.random();
    let u2 = Math.random();
    let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, Math.round(val)));
}

function getTeamRatings(teamId) {
    const players = db.prepare(`SELECT position, overall_rating FROM players WHERE team_id = ?`).all(teamId);
    const offense = players.filter(p => ["QB", "RB", "WR", "TE", "OL"].includes(p.position));
    const defense = players.filter(p => ["DL", "LB", "CB", "S"].includes(p.position));
    const offenseRating = offense.reduce((sum, p) => sum + p.overall_rating, 0) / (offense.length || 1);
    const defenseRating = defense.reduce((sum, p) => sum + p.overall_rating, 0) / (defense.length || 1);
    return { offenseRating, defenseRating };
}

function generatePlayerStats(teamId, score, offenseRating) {
    const stats = [];
    const ratingFactor = offenseRating / 75;

    // Get starters by position
    const qb  = db.prepare(`SELECT id FROM players WHERE team_id = ? AND position = 'QB' LIMIT 1`).get(teamId);
    const rbs = db.prepare(`SELECT id FROM players WHERE team_id = ? AND position = 'RB' LIMIT 2`).all(teamId);
    const wrs = db.prepare(`SELECT id FROM players WHERE team_id = ? AND position = 'WR' LIMIT 4`).all(teamId);
    const tes = db.prepare(`SELECT id FROM players WHERE team_id = ? AND position = 'TE' LIMIT 2`).all(teamId);

    // Estimate TDs from score (~1 TD per 7 pts)
    const totalTDs  = Math.max(0, Math.round(score / 7));
    const passTDs   = clamp(Math.round(totalTDs * 0.6), 0, totalTDs);
    const rushTDs   = totalTDs - passTDs;

    // Team-level passing totals
    const passYards    = clamp(randomNormal(260 * ratingFactor, 55), 80, 450);
    const passAttempts = clamp(randomNormal(34, 5), 20, 50);
    const completions  = clamp(passAttempts * randomNormal(0.63, 0.06), 10, passAttempts);
    const ints         = clamp(randomNormal(1.1, 1), 0, 4);

    // QB
    if (qb) {
        const qbCarries = Math.random() > 0.6 ? clamp(randomNormal(4, 2), 0, 8) : 0;
        stats.push({
            player_id: qb.id, team_id: teamId,
            pass_attempts: passAttempts, completions, pass_yards: passYards,
            pass_tds: passTDs, interceptions: ints,
            rush_attempts: qbCarries, rush_yards: clamp(randomNormal(qbCarries * 5, 8), 0, 50), rush_tds: 0,
            targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
        });
    }

    // RBs — split carries
    const totalRushAttempts = clamp(randomNormal(22, 4), 12, 35);
    const totalRushYards    = clamp(randomNormal(110 * ratingFactor, 35), 20, 250);

    rbs.forEach((rb, i) => {
        const share     = i === 0 ? randomNormal(0.65, 0.08) : 0.35;
        const carries   = clamp(totalRushAttempts * share, i === 0 ? 8 : 0, 28);
        const rushYards = clamp(totalRushYards * share, 0, 200);
        const rbRushTDs = i === 0 && rushTDs > 0 ? rushTDs : 0;
        stats.push({
            player_id: rb.id, team_id: teamId,
            pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
            rush_attempts: carries, rush_yards: rushYards, rush_tds: rbRushTDs,
            targets: clamp(randomNormal(4 - i * 1.5, 2), 0, 8),
            receptions: clamp(randomNormal(3 - i, 1), 0, 6),
            rec_yards: clamp(randomNormal(28 - i * 8, 12), 0, 65),
            rec_tds: 0,
        });
    });

    // WRs and TEs — distribute receiving yards
    const receivers = [...wrs, ...tes];
    const recShares = [0.28, 0.20, 0.14, 0.10, 0.10, 0.08];
    let remainingRecTDs = passTDs;

    receivers.forEach((rec, i) => {
        const share    = recShares[i] || 0.05;
        const recYards = clamp(randomNormal(passYards * share, 18), 0, 160);
        const targets  = clamp(randomNormal(9 - i * 1.2, 2), 1, 14);
        const recs     = clamp(targets * randomNormal(0.65, 0.08), 0, targets);
        const recTDs   = remainingRecTDs > 0 && Math.random() > (0.45 + i * 0.12) ? 1 : 0;
        if (recTDs) remainingRecTDs--;

        stats.push({
            player_id: rec.id, team_id: teamId,
            pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
            rush_attempts: 0, rush_yards: 0, rush_tds: 0,
            targets, receptions: recs, rec_yards: recYards, rec_tds: recTDs,
        });
    });

    return stats;
}

function simulateGame(homeTeamId, awayTeamId) {
    const homeRatings = getTeamRatings(homeTeamId);
    const awayRatings = getTeamRatings(awayTeamId);

    const leagueAvg = 23;
    const homefieldAdvantage = 2.5;

    let homeScore = Math.round(randomNormal(
        (homeRatings.offenseRating / awayRatings.defenseRating) * leagueAvg + homefieldAdvantage, 7
    ));
    let awayScore = Math.round(randomNormal(
        (awayRatings.offenseRating / homeRatings.defenseRating) * leagueAvg, 7
    ));

    homeScore = Math.max(0, homeScore);
    awayScore = Math.max(0, awayScore);

    const homePlayerStats = generatePlayerStats(homeTeamId, homeScore, homeRatings.offenseRating);
    const awayPlayerStats = generatePlayerStats(awayTeamId, awayScore, awayRatings.offenseRating);

    return { homeScore, awayScore, homePlayerStats, awayPlayerStats };
}

module.exports = { simulateGame };