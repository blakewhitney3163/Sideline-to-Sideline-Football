import { ipcMain } from 'electron';
import { SALARY_CAP, MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD } from '../constants';
import { CapSummary, RosterSpots } from '../types';
import { settingsRepo, playerRepo, contractRepo } from '../repositories';
import {
  calcFairMarket, signFreeAgent, resignPlayer, promoteFromPS, cpuFASigning,
  signFreeAgentToPS, extendPlayer, restructurePlayer, releasePlayer,
  getOffseasonStatus, applyFranchiseTag, removeFranchiseTag, acceptCounterOffer,
} from '../services/ContractService';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { db } from '../database';

export { calcFairMarket };

export function registerContractHandlers(): void {

  ipcMain.handle('get-team-contracts', (_event: any, teamId: number) =>
    contractRepo.getByTeam(teamId));

  ipcMain.handle('get-practice-squad', (_event: any, teamId: number) =>
    playerRepo.getPracticeSquad(teamId));

  ipcMain.handle('get-cap-summary', (_event: any, teamId: number): CapSummary => {
    const usedCap = contractRepo.getCapUsage(teamId);
    return { total_cap: SALARY_CAP, used_cap: usedCap, available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10 } as any;
  });

  ipcMain.handle('get-roster-spots', (_event: any, teamId: number): RosterSpots => {
    const { active, ps } = playerRepo.getCountByStatus(teamId);
    return { active, ps, activeMax: MAX_ACTIVE_ROSTER, psMax: MAX_PRACTICE_SQUAD, activeFree: MAX_ACTIVE_ROSTER - active, psFree: MAX_PRACTICE_SQUAD - ps } as any;
  });

  ipcMain.handle('get-free-agents', (_event: any, position?: string) =>
    playerRepo.getFreeAgents(position));

   ipcMain.handle('get-franchise-health', (_event: any, teamId: number) =>
   playerRepo.getFranchiseHealth(teamId));

  ipcMain.handle('get-expiring-contracts', () => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return [];
    return contractRepo.getExpiring(teamId);
  });

  ipcMain.handle('sign-free-agent-to-ps', (_event: any, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return signFreeAgentToPS(playerId, teamId);
  });

  ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) =>
    extendPlayer(playerId, years, salary));

  ipcMain.handle('restructure-player', (_event: any, { playerId, pct }: { playerId: number; pct: number }) =>
    restructurePlayer(playerId, pct));

  ipcMain.handle('release-player', (_event: any, playerId: number) =>
    releasePlayer(playerId));

  ipcMain.handle('get-offseason-status', () =>
    getOffseasonStatus(settingsRepo.getUserTeamId()));

  ipcMain.handle('promote-from-ps', (_event: any, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return promoteFromPS(playerId, teamId);
  });

  ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    const result = signFreeAgent(playerId, teamId, years, salary);
    if (result.success) {
      const p = db.prepare('SELECT first_name, last_name, position FROM players WHERE id = ?').get(playerId) as any;
      const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
      if (p && t) logNewsEvent({
        eventType: 'signing', category: 'transactions',
        headline: `${t.city} ${t.name} Sign ${p.first_name} ${p.last_name}`,
        detail: `${p.position} · ${years}-year deal at $${salary}M/yr.`,
        teamId, playerId,
      });
    }
    return result;
  });

  ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const result = resignPlayer(playerId, years, salary);
    if (result?.success !== false) {
      const p = db.prepare('SELECT first_name, last_name, position, team_id FROM players WHERE id = ?').get(playerId) as any;
      const t = p?.team_id ? db.prepare('SELECT city, name FROM teams WHERE id = ?').get(p.team_id) as any : null;
      if (p && t) logNewsEvent({
        eventType: 'resign', category: 'transactions',
        headline: `${t.city} ${t.name} Re-sign ${p.first_name} ${p.last_name}`,
        detail: `${p.position} · ${years}-year extension at $${salary}M/yr.`,
        teamId: p.team_id, playerId,
      });
    }
    return result;
  });

  ipcMain.handle('cpu-fa-signing', () =>
    cpuFASigning(settingsRepo.getUserTeamId() ?? -1));

    ipcMain.handle('apply-franchise-tag', (_event: any, { playerId, tagType }: { playerId: number; tagType: 'franchise' | 'transition' }) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return applyFranchiseTag(playerId, teamId, tagType);
  });

  ipcMain.handle('remove-franchise-tag', (_event: any, playerId: number) =>
    removeFranchiseTag(playerId));

    ipcMain.handle('accept-counter-offer', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) =>
    acceptCounterOffer(playerId, years, salary));

  ipcMain.handle('get-dead-cap', (_event: any, teamId: number) => {
    const { getCurrentSeason } = require('../helpers/getCurrentSeason');
    const season = getCurrentSeason();
    return {
      amount: contractRepo.getDeadCap(teamId, season),
      entries: contractRepo.getDeadCapEntries(teamId, season),
    };
  });
}
