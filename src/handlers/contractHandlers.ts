import { ipcMain } from 'electron';
import { MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD } from '../constants';
import { getSalaryCap } from '../helpers/getSalaryCap';
import { CapSummary, RosterSpots } from '../types';
import { settingsRepo, playerRepo, contractRepo } from '../repositories';
import {
  calcFairMarket, signFreeAgent, resignPlayer, promoteFromPS, demoteToPS, cutFromPS, cpuFASigning,
  signFreeAgentToPS, extendPlayer, restructurePlayer, releasePlayer,
  getOffseasonStatus, applyFranchiseTag, removeFranchiseTag, acceptCounterOffer,
} from '../services/ContractService';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { db } from '../database';
import type { IpcEvent, PlayerWithPositionRow, PlayerWithTeamRow, TeamNameRow } from '../types/ipc';
import { replenishFAPool } from '../generatePlayers';

export { calcFairMarket };

export function registerContractHandlers(): void {

  ipcMain.handle('get-team-contracts', (_event: IpcEvent, teamId: number) =>
    contractRepo.getByTeam(teamId));

  ipcMain.handle('get-practice-squad', (_event: IpcEvent, teamId: number) =>
    playerRepo.getPracticeSquad(teamId));

  ipcMain.handle('get-cap-summary', (_event: IpcEvent, teamId: number): CapSummary => {
    const totalCap = getSalaryCap();
    const usedCap = contractRepo.getCapUsage(teamId);
    return { total_cap: totalCap, used_cap: usedCap, available_cap: Math.round((totalCap - usedCap) * 10) / 10 };
  });

  ipcMain.handle('get-roster-spots', (_event: IpcEvent, teamId: number): RosterSpots => {
    const { active, ps } = playerRepo.getCountByStatus(teamId);
    return { active, ps, activeMax: MAX_ACTIVE_ROSTER, psMax: MAX_PRACTICE_SQUAD, activeFree: MAX_ACTIVE_ROSTER - active, psFree: MAX_PRACTICE_SQUAD - ps };
  });

  ipcMain.handle('get-free-agents', (_event: IpcEvent, position?: string) =>
    playerRepo.getFreeAgents(position));

  ipcMain.handle('get-franchise-health', (_event: IpcEvent, teamId: number) =>
    playerRepo.getFranchiseHealth(teamId));

  ipcMain.handle('get-expiring-contracts', () => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return [];
    return contractRepo.getExpiring(teamId);
  });

  ipcMain.handle('sign-free-agent-to-ps', (_event: IpcEvent, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return signFreeAgentToPS(playerId, teamId);
  });

  ipcMain.handle('extend-player', (_event: IpcEvent, { playerId, years, salary }: { playerId: number; years: number; salary: number }) =>
    extendPlayer(playerId, years, salary));

  ipcMain.handle('restructure-player', (_event: IpcEvent, { playerId, pct }: { playerId: number; pct: number }) =>
    restructurePlayer(playerId, pct));

  ipcMain.handle('release-player', (_event: IpcEvent, playerId: number) =>
    releasePlayer(playerId));

  ipcMain.handle('get-offseason-status', () =>
    getOffseasonStatus(settingsRepo.getUserTeamId()));

  ipcMain.handle('promote-from-ps', (_event: IpcEvent, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return promoteFromPS(playerId, teamId);
  });

  ipcMain.handle('demote-to-ps', (_event: IpcEvent, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return demoteToPS(playerId, teamId);
  });

  ipcMain.handle('cut-from-ps', (_event: IpcEvent, playerId: number) => {
    return cutFromPS(playerId);
  });

  ipcMain.handle('sign-free-agent', (_event: IpcEvent, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    const result = signFreeAgent(playerId, teamId, years, salary);
    if (result.success) {
      const p = db.prepare('SELECT first_name, last_name, position FROM players WHERE id = ?').get(playerId) as PlayerWithPositionRow | undefined;
      const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as TeamNameRow | undefined;
      if (p && t) logNewsEvent({
        eventType: 'signing', category: 'transactions',
        headline: `${t.city} ${t.name} Sign ${p.first_name} ${p.last_name}`,
        detail: `${p.position} · ${years}-year deal at $${salary}M/yr.`,
        teamId, playerId,
      });
    }
    return result;
  });

  ipcMain.handle('resign-player', (_event: IpcEvent, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const result = resignPlayer(playerId, years, salary);
    if (result?.success !== false) {
      const p = db.prepare('SELECT first_name, last_name, position, team_id FROM players WHERE id = ?').get(playerId) as PlayerWithTeamRow | undefined;
      const t = p?.team_id ? db.prepare('SELECT city, name FROM teams WHERE id = ?').get(p.team_id) as TeamNameRow | undefined : undefined;
      if (p && t) logNewsEvent({
        eventType: 'resign', category: 'transactions',
        headline: `${t.city} ${t.name} Re-sign ${p.first_name} ${p.last_name}`,
        detail: `${p.position} · ${years}-year extension at $${salary}M/yr.`,
        teamId: p.team_id, playerId,
      });
    }
    return result;
  });

  ipcMain.handle('cpu-fa-signing', () => {
    const result = cpuFASigning(settingsRepo.getUserTeamId() ?? -1);
    replenishFAPool();
    return result;
  });

  ipcMain.handle('apply-franchise-tag', (_event: IpcEvent, { playerId, tagType }: { playerId: number; tagType: 'franchise' | 'transition' }) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return applyFranchiseTag(playerId, teamId, tagType);
  });

  ipcMain.handle('remove-franchise-tag', (_event: IpcEvent, playerId: number) =>
    removeFranchiseTag(playerId));

  ipcMain.handle('accept-counter-offer', (_event: IpcEvent, { playerId, years, salary }: { playerId: number; years: number; salary: number }) =>
    acceptCounterOffer(playerId, years, salary));

  ipcMain.handle('get-dead-cap', (_event: IpcEvent, teamId: number) => {
    const { getCurrentSeason } = require('../helpers/getCurrentSeason');
    const season = getCurrentSeason();
    return {
      amount: contractRepo.getDeadCap(teamId, season),
      entries: contractRepo.getDeadCapEntries(teamId, season),
    };
  });

  ipcMain.handle('edit-player-contract', (_event: IpcEvent, {
    playerId,
    annual_salary,
    years_remaining,
  }: { playerId: number; annual_salary: number; years_remaining: number }) => {
    const contract = db.prepare('SELECT id, years_total FROM contracts WHERE player_id = ?')
      .get(playerId) as { id: number; years_total: number } | undefined;
    if (!contract) return { success: false, reason: 'No contract found for this player.' };
    const newTotal = Math.max(contract.years_total, years_remaining);
    db.prepare(
      'UPDATE contracts SET annual_salary = ?, years_remaining = ?, years_total = ? WHERE player_id = ?'
    ).run(annual_salary, years_remaining, newTotal, playerId);
    return { success: true };
  });
}
