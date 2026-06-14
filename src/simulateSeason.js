const db = require('./database');
const { simulateGame } = require('./simulateGame');

function generateSchedule(season) {
    const teams = db.prepare('SELECT id FROM teams').all();
    const games = [];
    const weeks = 17;

    for (let week = 1; week <= weeks; week++) {
        const shuffled = [...teams].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length; i += 2) {
            games.push({
                season,
                week,
                home_team_id: shuffled[i].id,
                away_team_id: shuffled[i + 1].id
            });
        }
    }
    return games;
}

function simulateSeason(season = 2025) {
    console.log(`Simulating ${season} season...`);

    // Clear previous data for this season
    db.prepare('DELETE FROM stats WHERE game_id IN (SELECT id FROM games WHERE season = ?)').run(season);
    db.prepare('DELETE FROM games WHERE season = ?').run(season);

    const schedule = generateSchedule(season);

    const insertGame = db.prepare(`
        INSERT INTO games (season, week, home_team_id, away_team_id, home_score, away_score, is_simulated)
        VALUES (@season, @week, @home_team_id, @away_team_id, @home_score, @away_score, 1)
    `);

    const insertStat = db.prepare(`
        INSERT INTO stats (
            game_id, player_id, team_id,
            pass_attempts, completions, pass_yards, pass_tds, interceptions,
            rush_attempts, rush_yards, rush_tds,
            targets, receptions, rec_yards, rec_tds
        ) VALUES (
            @game_id, @player_id, @team_id,
            @pass_attempts, @completions, @pass_yards, @pass_tds, @interceptions,
            @rush_attempts, @rush_yards, @rush_tds,
            @targets, @receptions, @rec_yards, @rec_tds
        )
    `);

    // Wrap in a transaction for performance — 272 games × ~15 players = ~4000 inserts
    const runSeason = db.transaction(() => {
        for (const game of schedule) {
            const result = simulateGame(game.home_team_id, game.away_team_id);

            // Insert game and get its new ID
            const { lastInsertRowid: gameId } = insertGame.run({
                ...game,
                home_score: result.homeScore,
                away_score: result.awayScore
            });

            // Save every player's stat line for this game
            for (const stat of [...result.homePlayerStats, ...result.awayPlayerStats]) {
                insertStat.run({ game_id: gameId, ...stat });
            }
        }
    });

    runSeason();

    console.log(`${schedule.length} games simulated`);
    console.log(`Player stats saved to database`);

    // Print standings
    const conferences = ["AFC", "NFC"];
    console.log("\n--- FINAL STANDINGS ---");
    for (const conf of conferences) {
        console.log(`\n${conf}`);
        const confTeams = db.prepare('SELECT id, city, name FROM teams WHERE conference = ?').all(conf);

        const standings = confTeams.map(team => {
            const wins = db.prepare(`
                SELECT COUNT(*) as count FROM games
                WHERE season = ? AND is_simulated = 1
                AND ((home_team_id = ? AND home_score > away_score)
                OR  (away_team_id = ? AND away_score > home_score))
            `).get(season, team.id, team.id).count;

            const losses = db.prepare(`
                SELECT COUNT(*) as count FROM games
                WHERE season = ? AND is_simulated = 1
                AND ((home_team_id = ? AND home_score < away_score)
                OR  (away_team_id = ? AND away_score < home_score))
            `).get(season, team.id, team.id).count;

            return { ...team, wins, losses };
        }).sort((a, b) => b.wins - a.wins);

        for (const team of standings) {
            console.log(`  ${team.city} ${team.name}: ${team.wins}-${team.losses}`);
        }
    }
}

const seasonRow = db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get();
const season = seasonRow ? parseInt(seasonRow.value) : 2025;
simulateSeason(season);