import { ipcMain } from 'electron';
import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { SALARY_CAP, MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD } from '../constants';
import { CapSummary, RosterSpots } from '../types';
import { settingsRepo, playerRepo, contractRepo, gameRepo } from '../repositories';
import { calcFairMarket, signFreeAgent, resignPlayer, promoteFromPS, cpuFASigning } from '../services/ContractService';

export { calcFairMarket };

export function registerContractHandlers(): void {

  ipcMain.handle('get-team-contracts', (_event: any, teamId: number) =>
    contractRepo.getByTeam(teamId));

  ipcMain.handle('get-practice-squad', (_event: any, teamId: number) =>
    playerRepo.getPracticeSquad(teamId));

  ipcMain.handle('get-cap-summary', (_event: any, teamId: number): Promise<CapSummary> => {
    const usedCap = contractRepo.getCapUsage(teamId);
    return { total_cap: SALARY_CAP, used_cap: usedCap, available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10 } as any;
  });

  ipcMain.handle('get-roster-spots', (_event: any, teamId: number): Promise<RosterSpots> => {
    const { active, ps } = playerRepo.getCountByStatus(teamId);
    return { active, ps, activeMax: MAX_ACTIVE_ROSTER, psMax: MAX_PRACTICE_SQUAD, activeFree: MAX_ACTIVE_ROSTER - active, psFree: MAX_PRACTICE_SQUAD - ps } as any;
  });

  ipcMain.handle('sign-free-agent-to-ps', (_event: any, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    if (playerRepo.getPSCount(teamId) >= MAX_PRACTICE_SQUAD)
      return { success: false, reason: `Practice squad is full (${MAX_PRACTICE_SQUAD}/${MAX_PRACTICE_SQUAD}).` };
    const player = playerRepo.getById(playerId);
    if (!player || player.team_id !== null) return { success: false, reason: 'Player not available.' };
    playerRepo.assignToPS(playerId, teamId);
    contractRepo.createPS(playerId, teamId);
    return { success: true };
  });

  ipcMain.handle('get-free-agents', (_event: any, position?: string) =>
    playerRepo.getFreeAgents(position));

  ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const contract = contractRepo.getByPlayer(playerId);
    if (!contract) return { success: false, reason: 'No contract found.' };
    const guaranteedPct = Math.round(40 + Math.random() * 20);
    contractRepo.update(playerId, years, salary, Math.round(salary * years * (guaranteedPct / 100) * 10) / 10, guaranteedPct);
    return { success: true };
  });

  ipcMain.handle('restructure-player', (_event: any, { playerId, pct }: { playerId: number; pct: number }) => {
    const contract = contractRepo.getByPlayer(playerId);
    if (!contract) return { success: false, reason: 'No contract found.' };
    if (contract.years_remaining < 2) return { success: false, reason: 'Need 2+ years remaining to restructure.' };
    const convertedAmount = contract.annual_salary * pct;
    const savings = Math.round(convertedAmount * (1 - 1 / contract.years_remaining) * 10) / 10;
    const newSalary = Math.round((contract.annual_salary - savings) * 10) / 10;
    const newGuaranteed = Math.round(((contract.guaranteed_amount ?? 0) + convertedAmount) * 10) / 10;
    contractRepo.updateSalary(playerId, newSalary, newGuaranteed, Math.min(100, Math.round((newGuaranteed / (newSalary * contract.years_remaining)) * 100)));
    return { success: true, savings, newSalary };
  });

  ipcMain.handle('release-player', (_event: any, playerId: number) => {
    const season = getCurrentSeason();
    const isInSeason = gameRepo.countBySeason(season) > 0;
    const player = playerRepo.getById(playerId);
    if (isInSeason) {
      playerRepo.releaseToWaivers(playerId, player?.team_id ?? null, gameRepo.getCurrentWeek(season) ?? 1);
    } else {
      contractRepo.delete(playerId);
      playerRepo.releaseToFA(playerId);
    }
    return { success: true, onWaivers: isInSeason };
  });

  ipcMain.handle('get-team-stats', (_event: any, teamId: number, season?: number) => {
    const s = season ?? getCurrentSeason();
    return db.prepare(`
      SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
             p.overall_rating, p.age, p.position, p.dev_trait,
             t.city || ' ' || t.name AS team_name,
             SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
             SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
             SUM(st.pass_attempts) AS pass_attempts,
             SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds,
             SUM(st.rush_attempts) AS rush_attempts,
             SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
             SUM(st.receptions) AS receptions, SUM(st.targets) AS targets,
             SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
             SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
             SUM(st.forced_fumbles) AS forced_fumbles,
             SUM(st.def_interceptions) AS def_interceptions,
             SUM(st.pass_deflections) AS pass_deflections, SUM(st.def_tds) AS def_tds
      FROM stats st
      JOIN players p ON st.player_id = p.id
      JOIN teams t ON st.team_id = t.id
      JOIN games g ON st.game_id = g.id
      WHERE g.season = ? AND g.is_simulated = 1 AND st.team_id = ?
      GROUP BY p.id
    `).all(s, teamId);
  });

  ipcMain.handle('promote-from-ps', (_event: any, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return promoteFromPS(playerId, teamId);
  });

  ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };
    return signFreeAgent(playerId, teamId, years, salary);
  });

  ipcMain.handle('get-expiring-contracts', () => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return [];
    return contractRepo.getExpiring(teamId);
  });

  ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: { playerId: number; years: number; salary: number }) =>
    resignPlayer(playerId, years, salary));

  ipcMain.handle('get-offseason-status', () => {
    const season = getCurrentSeason();
    const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
    const draftGenerated = champion
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
      : false;
    const draftComplete = draftGenerated
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
      : false;
    const teamId = settingsRepo.getUserTeamId();
    return { playoffsComplete: !!champion, pendingResigns: teamId ? contractRepo.countExpiring(teamId) : 0, draftGenerated, draftComplete };
  });

  ipcMain.handle('cpu-fa-signing', () =>
    cpuFASigning(settingsRepo.getUserTeamId() ?? -1));
}
