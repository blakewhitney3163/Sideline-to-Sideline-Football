import { ipcMain } from 'electron';
import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { TradeResult } from '../types';
import { settingsRepo, playerRepo, contractRepo, pickRepo } from '../repositories';
import {
  calcPlayerTradeValue, calcPickTradeValue,
  getTeamTradeProfile, getTeamNeeds, proposeTrade, getCpuTradeOffers,
} from '../services/TradeService';
import { logNewsEvent } from '../helpers/logNewsEvent';

export { calcPlayerTradeValue, calcPickTradeValue, getTeamTradeProfile };

function getTeamName(teamId: number): string {
  const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
  return t ? `${t.city} ${t.name}` : 'Unknown Team';
}

function getPlayerLabel(playerId: number): string {
  const p = db.prepare('SELECT first_name, last_name, position, overall_rating FROM players WHERE id = ?').get(playerId) as any;
  return p ? `${p.first_name} ${p.last_name} (${p.position}, OVR ${p.overall_rating})` : `Player #${playerId}`;
}

function getPickLabel(pickId: number): string {
  const pk = db.prepare('SELECT round, season FROM pick_assets WHERE id = ?').get(pickId) as any;
  if (!pk) return `Pick #${pickId}`;
  const rounds: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
  return `${pk.season} ${rounds[pk.round] ?? pk.round + 'th'}-round pick`;
}

export function registerTradeHandlers(): void {

  ipcMain.handle('get-team-status', (_event: any, teamId: number) =>
    getTeamTradeProfile(teamId));

  ipcMain.handle('set-team-trade-status', (_event: any, { teamId, status }: { teamId: number; status: string | null }) => {
    if (!status || status === 'auto') db.prepare('DELETE FROM team_trade_overrides WHERE team_id = ?').run(teamId);
    else db.prepare('INSERT OR REPLACE INTO team_trade_overrides (team_id, status) VALUES (?, ?)').run(teamId, status);
    return { success: true };
  });

  ipcMain.handle('propose-trade', (_event: any, { myPlayerIds, theirPlayerIds, theirTeamId, myPickIds = [], theirPickIds = [] }: {
    myPlayerIds: number[]; theirPlayerIds: number[]; theirTeamId: number;
    myPickIds?: number[]; theirPickIds?: number[];
  }): Promise<TradeResult> => {
    const myTeamId = settingsRepo.getUserTeamId();
    if (!myTeamId) return { accepted: false, reason: 'No franchise selected.' } as any;

    const myTeamName    = getTeamName(myTeamId);
    const theirTeamName = getTeamName(theirTeamId);
    const sentLabels     = [...myPlayerIds.map(getPlayerLabel),    ...myPickIds.map(getPickLabel)];
    const receivedLabels = [...theirPlayerIds.map(getPlayerLabel), ...theirPickIds.map(getPickLabel)];

    const result = proposeTrade({
      myTeamId, theirTeamId, myPlayerIds, theirPlayerIds, myPickIds, theirPickIds,
    }) as any;

    if (result?.accepted) {
      logNewsEvent({
        season: getCurrentSeason(),
        category: 'trade',
        title: `Trade: ${myTeamName} and ${theirTeamName} make a deal`,
        body: [
          receivedLabels.length ? `${myTeamName} receives: ${receivedLabels.join(', ')}` : null,
          sentLabels.length     ? `${theirTeamName} receives: ${sentLabels.join(', ')}`   : null,
        ].filter(Boolean).join(' | '),
      });
    }

    return result;
  });

  ipcMain.handle('get-tradeable-picks', (_event: any, teamId: number) =>
    pickRepo.getByTeam(teamId, getCurrentSeason()));

  ipcMain.handle('get-cpu-trade-offer', () => {
    const userTeamId = settingsRepo.getUserTeamId();
    if (!userTeamId) return [];
    return getCpuTradeOffers(userTeamId);
  });

  ipcMain.handle('accept-cpu-trade-offer', (_event: any, { myPlayerId, theirPlayerId, theirTeamId, theirPickId }: {
    myPlayerId: number; theirPlayerId: number; theirTeamId: number; theirPickId: number | null;
  }) => {
    const myTeamId = settingsRepo.getUserTeamId();
    if (!myTeamId) return { success: false };

    const myTeamName    = getTeamName(myTeamId);
    const theirTeamName = getTeamName(theirTeamId);
    const sentLabel      = getPlayerLabel(myPlayerId);
    const receivedParts  = [getPlayerLabel(theirPlayerId)];
    if (theirPickId) receivedParts.push(getPickLabel(theirPickId));

    db.transaction(() => {
      playerRepo.updateTeam(myPlayerId, theirTeamId);
      contractRepo.updateTeam(myPlayerId, theirTeamId);
      playerRepo.updateTeam(theirPlayerId, myTeamId);
      contractRepo.updateTeam(theirPlayerId, myTeamId);
      if (theirPickId) pickRepo.transfer(theirPickId, myTeamId);
    })();

    logNewsEvent({
      season: getCurrentSeason(),
      category: 'trade',
      title: `Trade: ${myTeamName} and ${theirTeamName} make a deal`,
      body: [
        `${myTeamName} receives: ${receivedParts.join(', ')}`,
        `${theirTeamName} receives: ${sentLabel}`,
      ].join(' | '),
    });

    return { success: true };
  });

  ipcMain.handle('get-team-needs', (_: any, teamId: number) =>
    getTeamNeeds(teamId).map(pos => ({ position: pos, severity: 'depth' as const })));
}
