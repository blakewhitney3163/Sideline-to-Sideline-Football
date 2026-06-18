import { ipcMain } from 'electron';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { SALARY_CAP, MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD, MIN_CPU_ROSTER } from '../constants';
import { CapSummary, RosterSpots, SuccessResult } from '../types';
import { settingsRepo, playerRepo, contractRepo, gameRepo } from '../repositories';

// ─── Market Rate Helper ───────────────────────────────────────────────────────

const MARKET_RATE_TABLE: Record<string, [number, number][]> = {
  QB: [[99,65],[93,50],[88,35],[83,20],[78,10],[73,4],[70,1.5]],
  WR: [[99,45],[93,35],[88,25],[83,16],[78,8],[73,3],[70,1.5]],
  DL: [[99,38],[93,30],[88,22],[83,14],[78,7],[73,3],[70,1.5]],
  CB: [[99,32],[93,25],[88,18],[83,11],[78,5],[73,2.5],[70,1.5]],
  OL: [[99,36],[93,30],[88,24],[83,18],[78,9],[73,3],[70,1.5]],
  LB: [[99,26],[93,20],[88,15],[83,9],[78,4.5],[73,2],[70,1.5]],
  TE: [[99,24],[93,19],[88,14],[83,8],[78,4],[73,2],[70,1.5]],
  S:  [[99,22],[93,17],[88,12],[83,7],[78,3.5],[73,1.8],[70,1.5]],
  RB: [[99,18],[93,14],[88,10],[83,6],[78,3],[73,1.5],[70,1.2]],
  K:  [[99,8],[93,6],[88,5],[83,4],[78,3],[73,2],[70,1]],
};
const TRAIT_MUL: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };

export function calcFairMarket(ovr: number, position: string, devTrait: string): number {
  const rates = MARKET_RATE_TABLE[position] ?? MARKET_RATE_TABLE['LB'];
  let base = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal] = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      base = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  return Math.round(base * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerContractHandlers(): void {

  ipcMain.handle('get-team-contracts', (_event: any, teamId: number) => {
    return contractRepo.getByTeam(teamId);
  });

  ipcMain.handle('get-practice-squad', (_event: any, teamId: number) => {
    return playerRepo.getPracticeSquad(teamId);
  });

  ipcMain.handle('get-cap-summary', (_event: any, teamId: number): Promise<CapSummary> => {
    const usedCap = contractRepo.getCapUsage(teamId);
    return {
      total_cap: SALARY_CAP,
      used_cap: usedCap,
      available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10,
    } as any;
  });

  ipcMain.handle('get-roster-spots', (_event: any, teamId: number): Promise<RosterSpots> => {
    const { active, ps } = playerRepo.getCountByStatus(teamId);
    return {
      active, ps,
      activeMax: MAX_ACTIVE_ROSTER,
      psMax: MAX_PRACTICE_SQUAD,
      activeFree: MAX_ACTIVE_ROSTER - active,
      psFree: MAX_PRACTICE_SQUAD - ps,
    } as any;
  });

  ipcMain.handle('sign-free-agent-to-ps', (_event: any, playerId: number): Promise<SuccessResult> => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' } as any;

    if (playerRepo.getPSCount(teamId) >= MAX_PRACTICE_SQUAD)
      return { success: false, reason: `Practice squad is full (${MAX_PRACTICE_SQUAD}/${MAX_PRACTICE_SQUAD}).` } as any;

    const player = playerRepo.getById(playerId);
    if (!player || player.team_id !== null) return { success: false, reason: 'Player not available.' } as any;

    playerRepo.assignToPS(playerId, teamId);
    contractRepo.createPS(playerId, teamId);
    return { success: true } as any;
  });

  ipcMain.handle('get-free-agents', (_event: any, position?: string) => {
    return playerRepo.getFreeAgents(position);
  });

  ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }): Promise<SuccessResult> => {
    const contract = contractRepo.getByPlayer(playerId);
    if (!contract) return { success: false, reason: 'No contract found.' } as any;
    const guaranteedPct = Math.round(40 + Math.random() * 20);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
    contractRepo.update(playerId, years, salary, guaranteedAmount, guaranteedPct);
    return { success: true } as any;
  });

  ipcMain.handle('restructure-player', (_event: any, { playerId, pct }: {
    playerId: number; pct: number;
  }): Promise<SuccessResult> => {
    const contract = contractRepo.getByPlayer(playerId);
    if (!contract) return { success: false, reason: 'No contract found.' } as any;
    if (contract.years_remaining < 2) return { success: false, reason: 'Need 2+ years remaining to restructure.' } as any;

    const convertedAmount = contract.annual_salary * pct;
    const savings = Math.round(convertedAmount * (1 - 1 / contract.years_remaining) * 10) / 10;
    const newSalary = Math.round((contract.annual_salary - savings) * 10) / 10;
    const newGuaranteed = Math.round(((contract.guaranteed_amount ?? 0) + convertedAmount) * 10) / 10;
    const newGuaranteedPct = Math.min(100, Math.round((newGuaranteed / (newSalary * contract.years_remaining)) * 100));
    contractRepo.updateSalary(playerId, newSalary, newGuaranteed, newGuaranteedPct);
    return { success: true, savings, newSalary } as any;
  });

  ipcMain.handle('release-player', (_event: any, playerId: number): Promise<SuccessResult> => {
    const season = getCurrentSeason();
    const isInSeason = gameRepo.countBySeason(season) > 0;
    const currentWeek = gameRepo.getCurrentWeek(season) ?? 1;
    const player = playerRepo.getById(playerId);
    const releasingTeamId = player?.team_id ?? null;

    if (isInSeason) {
      playerRepo.releaseToWaivers(playerId, releasingTeamId, currentWeek);
    } else {
      contractRepo.delete(playerId);
      playerRepo.releaseToFA(playerId);
    }
    return { success: true, onWaivers: isInSeason } as any;
  });

  ipcMain.handle('get-team-stats', (_event: any, teamId: number, season?: number) => {
    const { db } = require('../database');
    const s = season ?? getCurrentSeason();
    return db.prepare(`
      SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
             p.overall_rating, p.age, p.position, p.dev_trait,
             t.city || ' ' || t.name AS team_name,
             SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
             SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
             SUM(st.pass_attempts) AS pass_attempts,
             SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds, SUM(st.rush_attempts) AS rush_attempts,
             SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
             SUM(st.receptions) AS receptions, SUM(st.targets) AS targets,
             SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
             SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles,
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

  ipcMain.handle('promote-from-ps', (_event: any, playerId: number): Promise<SuccessResult> => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' } as any;

    if (playerRepo.getActiveCount(teamId) >= MAX_ACTIVE_ROSTER)
      return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` } as any;

    const player = playerRepo.getById(playerId);
    if (!player || player.roster_status !== 'practice_squad')
      return { success: false, reason: 'Player not on practice squad.' } as any;

    playerRepo.updateRosterStatus(playerId, 'active');

    const SAL_RANGES: Record<string, [number, number]> = {
      QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
      CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
      RB: [1.0, 16], K: [1.0, 4],
    };
    const [minSal, maxSal] = SAL_RANGES[player.position] ?? [1.0, 10];
    const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 70)) / 29, 2.5);
    const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * 10) / 10;
    const years = player.age <= 25 ? 3 : player.age <= 29 ? 2 : 1;
    const guaranteed = Math.round(salary * years * 0.3 * 10) / 10;
    contractRepo.update(playerId, years, salary, guaranteed, 30);
    return { success: true } as any;
  });

  ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }): Promise<SuccessResult> => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' } as any;

    if (playerRepo.getActiveCount(teamId) >= MAX_ACTIVE_ROSTER)
      return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` } as any;

    const player = playerRepo.getById(playerId);
    if (!player) return { success: false, reason: 'Player not found.' } as any;

    const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
    const ratio = salary / Math.max(fairMarket, 1);
    let acceptChance =
      ratio >= 1.00 ? 1.00 : ratio >= 0.85 ? 0.90 : ratio >= 0.70 ? 0.60 : ratio >= 0.50 ? 0.20 : 0.00;

    if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.20);
    if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

    const season = getCurrentSeason();
    const { wins, played } = gameRepo.getWinRecord(teamId, season);
    const winPct = played >= 4 ? wins / played : 0.5;
    if (winPct >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

    if (Math.random() >= acceptChance) {
      const reason =
        ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don't sign for that salary.` :
        ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
        ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
        `Chose to sign elsewhere. Sometimes it just doesn't work out.`;
      return { success: false, reason } as any;
    }

    const guaranteedPct = Math.round(30 + Math.random() * 30);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
    playerRepo.activate(playerId, teamId);
    contractRepo.create(playerId, teamId, years, salary, guaranteedAmount, guaranteedPct);
    return { success: true } as any;
  });

  ipcMain.handle('get-expiring-contracts', () => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return [];
    return contractRepo.getExpiring(teamId);
  });

  ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }): Promise<SuccessResult> => {
    const player = playerRepo.getById(playerId);
    if (!player) return { success: false, reason: 'Player not found.' } as any;

    const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
    const ratio = salary / Math.max(fairMarket, 1);
    let acceptChance =
      ratio >= 1.00 ? 1.00 : ratio >= 0.85 ? 0.95 : ratio >= 0.70 ? 0.70 : ratio >= 0.50 ? 0.25 : 0.00;

    if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.15);
    if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.08);

    if (Math.random() >= acceptChance) {
      const reason =
        ratio < 0.50 ? `Insulted by the offer. Looking for around ${fairMarket.toFixed(1)}M/yr.` :
        ratio < 0.70 ? `Not enough to stay. Asking price is closer to ${fairMarket.toFixed(1)}M/yr.` :
        ratio < 0.85 ? `Wants to test the market. Try offering closer to ${fairMarket.toFixed(1)}M/yr.` :
        `Decided to explore other options despite the offer.`;
      return { success: false, reason, willHitFA: true } as any;
    }

    const guaranteedPct = Math.round(35 + Math.random() * 25);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
    contractRepo.update(playerId, years, salary, guaranteedAmount, guaranteedPct);
    return { success: true } as any;
  });

  ipcMain.handle('get-offseason-status', () => {
    const season = getCurrentSeason();
    const { db } = require('../database');
    const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
    const draftGenerated = champion
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
      : false;
    const draftComplete = draftGenerated
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
      : false;
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { playoffsComplete: !!champion, pendingResigns: 0, draftGenerated, draftComplete };
    const pendingResigns = contractRepo.countExpiring(teamId);
    return { playoffsComplete: !!champion, pendingResigns, draftGenerated, draftComplete };
  });

  // ─── CPU Free Agency ─────────────────────────────────────────────────────────

  ipcMain.handle('cpu-fa-signing', () => {
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    const { db } = require('../database');
    const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
    let totalSigned = 0;
    const signingsByTeam: Record<number, number> = {};

    const runSignings = db.transaction(() => {
      for (const team of cpuTeams) {
        let slotsLeft = MAX_ACTIVE_ROSTER - playerRepo.getActiveCount(team.id);
        if (slotsLeft <= 0) continue;

        const posCounts = db.prepare(`SELECT position, COUNT(*) as cnt FROM players WHERE team_id = ? AND roster_status = 'active' GROUP BY position`).all(team.id) as any[];
        const byPos: Record<string, number> = {};
        for (const r of posCounts) byPos[r.position] = r.cnt;

        let teamSigned = 0;
        for (const [pos, minCount] of Object.entries(MIN_CPU_ROSTER)) {
          if (slotsLeft <= 0) break;
          const needed = Math.max(0, minCount - (byPos[pos] ?? 0));
          for (let i = 0; i < needed && slotsLeft > 0; i++) {
            const fas = playerRepo.getFreeAgents(pos, 1);
            const fa = fas[0];
            if (!fa) break;
            const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
            const salary = Math.round(fair * (0.90 + Math.random() * 0.15) * 10) / 10;
            const years = fa.age <= 27 ? 2 : 1;
            const gtd = Math.round(salary * years * 0.30 * 10) / 10;
            playerRepo.activate(fa.id, team.id);
            contractRepo.create(fa.id, team.id, years, salary, gtd, 30);
            totalSigned++;
            teamSigned++;
            slotsLeft--;
          }
        }
        if (teamSigned > 0) signingsByTeam[team.id] = teamSigned;
      }
    });
    runSignings();

    return { totalSigned, teamsActive: Object.keys(signingsByTeam).length };
  });
}
