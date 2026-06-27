import { ipcMain } from 'electron';
import { db } from '../database';
import { settingsRepo } from '../repositories';
import {
  initLiveGame, simNextPlay, simToCompletion,
  finalizeLiveGame, abortLiveGame, hasActiveGame,
  UserDecision,
} from '../sim/LiveGameEngine';
import { checkMilestones } from '../helpers/checkMilestones';
import { logNewsEvent } from '../helpers/logNewsEvent';

function getTeamName(teamId: number): string {
  const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
  return t ? `${t.city} ${t.name}` : 'Team';
}

function postGameNews(season: number, week: number, homeTeamId: number, awayTeamId: number, homeScore: number, awayScore: number, stats: any[], userTeamId: number): void {
  const homeName = getTeamName(homeTeamId);
  const awayName  = getTeamName(awayTeamId);
  const winnerName = homeScore > awayScore ? homeName : awayName;
  const loserName  = homeScore > awayScore ? awayName : homeName;
  const winnerScore = Math.max(homeScore, awayScore);
  const loserScore  = Math.min(homeScore, awayScore);

  const involvesUser = homeTeamId === userTeamId || awayTeamId === userTeamId;
  if (involvesUser) {
    const isHome = homeTeamId === userTeamId;
    const userScore = isHome ? homeScore : awayScore;
    const oppScore  = isHome ? awayScore : homeScore;
    const oppName   = isHome ? awayName  : homeName;
    logNewsEvent({
      season, category: 'game',
      title: `Week ${week}: ${winnerName} ${winnerScore}, ${loserName} ${loserScore}`,
      body: userScore > oppScore
        ? `Your team defeated ${oppName} ${userScore}–${oppScore}`
        : `Your team fell to ${oppName} ${oppScore}–${userScore}`,
    });
  } else if (Math.abs(homeScore - awayScore) >= 21) {
    logNewsEvent({
      season, category: 'game',
      title: `Blowout — ${winnerName} ${winnerScore}, ${loserName} ${loserScore}`,
      body: `Week ${week} | ${winnerName} win by ${Math.abs(homeScore - awayScore)}`,
    });
  }
}

export function registerLiveGameHandlers(): void {

  ipcMain.handle('start-live-game', (_event, gameId: number) => {
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    if (hasActiveGame(gameId)) {
      // Return existing state if resuming
      return initLiveGame(gameId, userTeamId);
    }
    return initLiveGame(gameId, userTeamId);
  });

  ipcMain.handle('sim-live-play', (_event, gameId: number, decision: UserDecision = null) => {
    return simNextPlay(gameId, decision);
  });

  ipcMain.handle('sim-live-to-end', (_event, gameId: number) => {
    return simToCompletion(gameId);
  });

  ipcMain.handle('finalize-live-game', async (_event, gameId: number) => {
    const gameRow = db.prepare('SELECT home_team_id, away_team_id, season, week FROM games WHERE id = ?').get(gameId) as any;
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    const result = finalizeLiveGame(gameId);

    if (result.success && gameRow) {
      // Run post-game pipeline
      try {
        const statRows = db.prepare('SELECT player_id FROM stats WHERE game_id = ?').all(gameId) as any[];
        const playerIds = statRows.map((r: any) => r.player_id);
        if (playerIds.length > 0) checkMilestones(gameRow.season, gameRow.week, playerIds);

        postGameNews(gameRow.season, gameRow.week, gameRow.home_team_id, gameRow.away_team_id,
          result.homeScore, result.awayScore, result.stats, userTeamId);
      } catch (e) {
        console.warn('[LiveGame] post-game pipeline error:', e);
      }
    }

    return result;
  });

  ipcMain.handle('abort-live-game', (_event, gameId: number) => {
    abortLiveGame(gameId);
    return { success: true };
  });

}
