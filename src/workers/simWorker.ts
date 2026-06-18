import { workerData, parentPort } from 'worker_threads';
import { db } from '../database';
import { simulateGame } from '../simulateGame';
import { playerRepo, gameRepo } from '../repositories';
import { rollInjuries, processWaivers, processRosterAdjustments } from '../services/SimulationService';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { runCpuTrades } from '../services/TradeService';
import { checkMilestones } from '../helpers/checkMilestones';

interface GameSummary {
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  stats: any[];
}

function getTeamName(teamId: number): string {
  const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
  return t ? `${t.city} ${t.name}` : 'Unknown Team';
}

function logGameNews(season: number, game: GameSummary, userTeamId: number): void {
  const homeTeamName = getTeamName(game.homeTeamId);
  const awayTeamName = getTeamName(game.awayTeamId);
  const margin = Math.abs(game.homeScore - game.awayScore);
  const winnerName = game.homeScore > game.awayScore ? homeTeamName : awayTeamName;
  const loserName  = game.homeScore > game.awayScore ? awayTeamName : homeTeamName;
  const winnerScore = Math.max(game.homeScore, game.awayScore);
  const loserScore  = Math.min(game.homeScore, game.awayScore);
  const involvesUser = game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;

  if (involvesUser) {
    const isHome   = game.homeTeamId === userTeamId;
    const userScore = isHome ? game.homeScore : game.awayScore;
    const oppScore  = isHome ? game.awayScore : game.homeScore;
    const oppName   = isHome ? awayTeamName : homeTeamName;
    logNewsEvent({
      season, category: 'game',
      title: `Week ${game.week}: ${winnerName} ${winnerScore}, ${loserName} ${loserScore}`,
      body: userScore > oppScore
        ? `Your team defeated ${oppName} ${userScore}–${oppScore}`
        : `Your team fell to ${oppName} ${oppScore}–${userScore}`,
    });
  } else if (margin >= 21) {
    logNewsEvent({
      season, category: 'game',
      title: `Blowout — ${winnerName} ${winnerScore}, ${loserName} ${loserScore}`,
      body: `Week ${game.week} | ${winnerName} win by ${margin}`,
    });
  }

  for (const stat of game.stats) {
    const isQBStar = stat.pass_yards >= 300 || stat.pass_tds >= 4;
    const isRBStar = stat.rush_yards >= 150;
    const isWRStar = stat.rec_yards >= 120 || stat.rec_tds >= 2;
    if (!isQBStar && !isRBStar && !isWRStar) continue;

    const p = db.prepare('SELECT first_name, last_name FROM players WHERE id = ?').get(stat.player_id) as any;
    if (!p) continue;
    const teamName = getTeamName(stat.team_id);

    if (isQBStar) {
      const parts: string[] = [];
      if (stat.pass_yards) parts.push(`${stat.pass_yards} pass yds`);
      if (stat.pass_tds)   parts.push(`${stat.pass_tds} TD`);
      if (stat.interceptions) parts.push(`${stat.interceptions} INT`);
      logNewsEvent({ season, category: 'game', title: `${p.first_name} ${p.last_name} — standout QB performance`, body: `Week ${game.week} | ${parts.join(', ')} | ${teamName}` });
    } else if (isRBStar) {
      const parts = [`${stat.rush_yards} rush yds`];
      if (stat.rush_tds) parts.push(`${stat.rush_tds} TD`);
      logNewsEvent({ season, category: 'game', title: `${p.first_name} ${p.last_name} — standout rushing performance`, body: `Week ${game.week} | ${parts.join(', ')} | ${teamName}` });
    } else if (isWRStar) {
      const parts: string[] = [];
      if (stat.receptions) parts.push(`${stat.receptions} rec`);
      if (stat.rec_yards)  parts.push(`${stat.rec_yards} yds`);
      if (stat.rec_tds)    parts.push(`${stat.rec_tds} TD`);
      logNewsEvent({ season, category: 'game', title: `${p.first_name} ${p.last_name} — standout receiving performance`, body: `Week ${game.week} | ${parts.join(', ')} | ${teamName}` });
    }
  }
}

function logInjuryNews(season: number, newlyInjured: any[], userTeamId: number): void {
  for (const p of newlyInjured) {
    if (p.team_id !== userTeamId) continue;
    const weeksOut = p.weeks_out
      ? `Out ${p.weeks_out} week${p.weeks_out > 1 ? 's' : ''}`
      : (p.injury_status?.toUpperCase() ?? 'Injured');
    logNewsEvent({
      season, category: 'injury',
      title: `Injury: ${p.first_name} ${p.last_name} (${p.position})`,
      body: `${p.injury_type ?? 'Injury'} | ${weeksOut} | OVR ${p.overall_rating}`,
    });
  }
}

const insertStat = db.prepare(`
  INSERT INTO stats
  (game_id, season, week, is_playoff, player_id, team_id,
   pass_attempts, completions, pass_yards, pass_tds,
   interceptions, rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards,
   rec_tds, tackles, assisted_tackles, sacks, tfl, forced_fumbles, fumble_recoveries,
   def_interceptions, pass_deflections, def_tds, fg_made, fg_att, xp_made, xp_att)
  VALUES
  (@game_id, @season, @week, @is_playoff, @player_id, @team_id,
   @pass_attempts, @completions, @pass_yards, @pass_tds,
   @interceptions, @rush_attempts, @rush_yards, @rush_tds, @targets, @receptions, @rec_yards,
   @rec_tds, @tackles, @assisted_tackles, @sacks, @tfl, @forced_fumbles, @fumble_recoveries,
   @def_interceptions, @pass_deflections, @def_tds, @fg_made, @fg_att, @xp_made, @xp_att)
`);

function runSimulateWeek(): object {
  const { week, season, games, userTeamId, difficultyFactor } = workerData;

  playerRepo.advanceInjuryTimers();

  const allStats: any[]          = [];
  const gameSummaries: GameSummary[] = [];

  db.transaction(() => {
    for (const game of games) {
      const result = simulateGame(game.home_team_id, game.away_team_id, game.week ?? week, userTeamId, difficultyFactor);
      gameRepo.updateResult(game.id, result.homeScore, result.awayScore, result.homeQuarters, result.awayQuarters, result.weather ?? 'clear');
      const gameStats = [...result.homePlayerStats, ...result.awayPlayerStats];
      for (const stat of gameStats) {
        insertStat.run({ game_id: game.id, season, week: game.week ?? week, is_playoff: 0, ...stat });
        allStats.push(stat);
      }
      gameSummaries.push({
        week: game.week ?? week,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        stats: gameStats,
      });
    }
  })();

  for (const summary of gameSummaries) logGameNews(season, summary, userTeamId);

  const newlyInjured = rollInjuries(allStats);
  logInjuryNews(season, newlyInjured, userTeamId);

  const milestonePlayerIds = [...new Set(allStats.map((s: any) => s.player_id as number))];
  checkMilestones(season, week, milestonePlayerIds);
  runCpuTrades(userTeamId);

  const rosterResult = processRosterAdjustments(newlyInjured, userTeamId);
  processWaivers(userTeamId, week);

  return {
    week, season,
    gamesSimulated: games.length,
    callups:        rosterResult.callups,
    userPSOpenSpots: rosterResult.userPSOpenSpots,
  };
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

try {
  let result: object;
  const { type } = workerData;
  if (type === 'simulate-week') {
    result = runSimulateWeek();
  } else {
    throw new Error(`Unknown worker task type: ${type}`);
  }
  db.close();
  parentPort?.postMessage(result);
} catch (err: any) {
  try { db.close(); } catch (_) {}
  parentPort?.postMessage({ __workerError: err?.message ?? String(err) });
}
