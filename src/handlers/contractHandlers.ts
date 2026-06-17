import { ipcMain } from 'electron';
const { db } = require('../database');
import { getCurrentSeason } from '../helpers/getCurrentSeason';

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
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
        p.overall_rating, p.age, p.dev_trait, p.roster_status,
        c.annual_salary, c.years_remaining, c.years_total,
        c.guaranteed_amount, c.guaranteed_pct,
        c.id as contract_id
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active'
      ORDER BY c.annual_salary DESC
    `).all(teamId);
  });

  ipcMain.handle('get-practice-squad', (_event: any, teamId: number) => {
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
        p.overall_rating, p.age, p.dev_trait,
        c.annual_salary, c.years_remaining
      FROM players p
      LEFT JOIN contracts c ON c.player_id = p.id
      WHERE p.team_id = ? AND p.roster_status = 'practice_squad'
      ORDER BY p.overall_rating DESC
    `).all(teamId);
  });

  ipcMain.handle('get-cap-summary', (_event: any, teamId: number) => {
    const SALARY_CAP = 279.2;
    const result = db.prepare(`
      SELECT COALESCE(SUM(c.annual_salary), 0) as used_cap
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active'
    `).get(teamId) as any;
    const usedCap = Math.round(result.used_cap * 10) / 10;
    return {
      total_cap: SALARY_CAP,
      used_cap: usedCap,
      available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10,
    };
  });

  ipcMain.handle('get-roster-spots', (_event: any, teamId: number) => {
    const counts = db.prepare(`
      SELECT roster_status, COUNT(*) as count
      FROM players WHERE team_id = ? GROUP BY roster_status
    `).all(teamId) as any[];
    const active = counts.find((r: any) => r.roster_status === 'active')?.count ?? 0;
    const ps = counts.find((r: any) => r.roster_status === 'practice_squad')?.count ?? 0;
    return { active, ps, activeMax: 53, psMax: 16, activeFree: 53 - active, psFree: 16 - ps };
  });

  ipcMain.handle('sign-free-agent-to-ps', (_event: any, playerId: number) => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!teamRow) return { success: false, reason: 'No franchise selected.' };
    const teamId = parseInt(teamRow.value);

    const psCount = (db.prepare(
      "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'practice_squad'"
    ).get(teamId) as any).count;
    if (psCount >= 16) return { success: false, reason: 'Practice squad is full (16/16).' };

    const player = db.prepare(
      'SELECT id, first_name, last_name, position FROM players WHERE id = ? AND team_id IS NULL'
    ).get(playerId) as any;
    if (!player) return { success: false, reason: 'Player not available.' };

    db.prepare("UPDATE players SET team_id = ?, roster_status = 'practice_squad', is_free_agent = 0 WHERE id = ?")
      .run(teamId, playerId);

    const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
    if (existing) {
      db.prepare(
        'UPDATE contracts SET team_id = ?, years_total = 1, years_remaining = 1, annual_salary = 0.87, guaranteed_amount = 0, guaranteed_pct = 0 WHERE player_id = ?'
      ).run(teamId, playerId);
    } else {
      db.prepare(
        'INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, 0.87, 0, 0)'
      ).run(playerId, teamId);
    }

    return { success: true, name: `${player.first_name} ${player.last_name}` };
  });

  ipcMain.handle('get-free-agents', (_event: any, position?: string) => {
    const query = position && position !== 'ALL'
      ? "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 AND position = ? ORDER BY overall_rating DESC LIMIT 200"
      : "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 ORDER BY overall_rating DESC LIMIT 200";
    return position && position !== 'ALL'
      ? db.prepare(query).all(position)
      : db.prepare(query).all();
  });

  ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as any;
    if (!contract) return { success: false, reason: 'No contract found.' };
    const guaranteedPct = Math.round(40 + Math.random() * 20);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
    db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
    return { success: true };
  });

  ipcMain.handle('restructure-player', (_event: any, { playerId, pct }: { playerId: number; pct: number }) => {
    const contract = db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as any;
    if (!contract) return { success: false, reason: 'No contract found.' };
    if (contract.years_remaining < 2) return { success: false, reason: 'Need 2+ years remaining to restructure.' };

    const convertedAmount = contract.annual_salary * pct;
    const savings = Math.round(convertedAmount * (1 - 1 / contract.years_remaining) * 10) / 10;
    const newSalary = Math.round((contract.annual_salary - savings) * 10) / 10;
    const newGuaranteed = Math.round(((contract.guaranteed_amount ?? 0) + convertedAmount) * 10) / 10;
    const newGuaranteedPct = Math.min(100, Math.round((newGuaranteed / (newSalary * contract.years_remaining)) * 100));

    db.prepare('UPDATE contracts SET annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(newSalary, newGuaranteed, newGuaranteedPct, playerId);

    return { success: true, savings, newSalary };
  });

  ipcMain.handle('release-player', (_event: any, playerId: number) => {
    const season = getCurrentSeason();
    const scheduleExists = (db.prepare(
      'SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0'
    ).get(season) as any).count > 0;
    const isInSeason = scheduleExists;

    const currentWeekRow = db.prepare(
      'SELECT MIN(week) as week FROM games WHERE season = ? AND is_simulated = 0 AND is_playoff = 0'
    ).get(season) as any;
    const currentWeek = currentWeekRow?.week ?? 1;

    const playerRow = db.prepare('SELECT team_id FROM players WHERE id = ?').get(playerId) as any;
    const releasingTeamId = playerRow?.team_id ?? null;

    if (isInSeason) {
      db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 0, roster_status = 'waivers', waived_by_team_id = ?, waiver_placed_week = ? WHERE id = ?`)
        .run(releasingTeamId, currentWeek, playerId);
    } else {
      db.prepare('DELETE FROM contracts WHERE player_id = ?').run(playerId);
      db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent', waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?`)
        .run(playerId);
    }
    return { success: true, onWaivers: !!isInSeason };
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

  ipcMain.handle('promote-from-ps', (_event: any, playerId: number) => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!teamRow) return { success: false, reason: 'No franchise selected.' };
    const teamId = parseInt(teamRow.value);

    const active = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
    if (active >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

    const player = db.prepare('SELECT * FROM players WHERE id = ? AND roster_status = ?').get(playerId, 'practice_squad') as any;
    if (!player) return { success: false, reason: 'Player not on practice squad.' };

    db.prepare("UPDATE players SET roster_status = 'active' WHERE id = ?").run(playerId);

    const SAL_RANGES: Record<string, [number, number]> = {
      QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
      CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
      RB: [1.0, 16], K: [1.0, 4],
    };
    const [minSal, maxSal] = SAL_RANGES[player.position] ?? [1.0, 10];
    const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 70)) / 29, 2.5);
    const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * 10) / 10;
    const years = player.age <= 25 ? 3 : player.age <= 29 ? 2 : 1;

    const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
    if (existing) {
      db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
        .run(years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30, playerId);
    } else {
      db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(playerId, teamId, years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30);
    }

    return { success: true, name: `${player.first_name} ${player.last_name}` };
  });

  ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }) => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!teamRow) return { success: false, reason: 'No franchise selected.' };
    const teamId = parseInt(teamRow.value);

    const spots = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
    if (spots >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

    const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
    if (!player) return { success: false, reason: 'Player not found.' };

    const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
    const ratio = salary / Math.max(fairMarket, 1);

    let acceptChance =
      ratio >= 1.00 ? 1.00 :
      ratio >= 0.85 ? 0.90 :
      ratio >= 0.70 ? 0.60 :
      ratio >= 0.50 ? 0.20 : 0.00;

    if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.20);
    if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

    const season = getCurrentSeason();
    const record = db.prepare(`
      SELECT
        SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
        COUNT(*) as played
      FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
    `).get(teamId, teamId, teamId, teamId, season) as any;
    const winPct = record?.played >= 4 ? record.wins / record.played : 0.5;
    if (winPct >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

    const accepted = Math.random() < acceptChance;

    if (!accepted) {
      const reason =
        ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don't sign for that salary.` :
        ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
        ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
        `Chose to sign elsewhere. Sometimes it just doesn't work out.`;
      return { success: false, reason };
    }

    const guaranteedPct = Math.round(30 + Math.random() * 30);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;

    db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?").run(teamId, playerId);
    db.prepare(`INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(playerId, teamId, years, years, salary, guaranteedAmount, guaranteedPct);
    return { success: true };
  });

  ipcMain.handle('get-expiring-contracts', () => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!teamRow) return [];
    const teamId = parseInt(teamRow.value);
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
        p.overall_rating, p.age, p.dev_trait,
        c.annual_salary, c.years_remaining, c.years_total,
        c.guaranteed_amount, c.guaranteed_pct, c.id as contract_id
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
      ORDER BY c.annual_salary DESC
    `).all(teamId);
  });

  ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: {
    playerId: number; years: number; salary: number;
  }) => {
    const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
    if (!player) return { success: false, reason: 'Player not found.' };

    const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
    const ratio = salary / Math.max(fairMarket, 1);

    let acceptChance =
      ratio >= 1.00 ? 1.00 :
      ratio >= 0.85 ? 0.95 :
      ratio >= 0.70 ? 0.70 :
      ratio >= 0.50 ? 0.25 : 0.00;

    if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
    if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.15);
    if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.08);

    const accepted = Math.random() < acceptChance;

    if (!accepted) {
      const reason =
        ratio < 0.50 ? `Insulted by the offer. Looking for around ${fairMarket.toFixed(1)}M/yr.` :
        ratio < 0.70 ? `Not enough to stay. Asking price is closer to ${fairMarket.toFixed(1)}M/yr.` :
        ratio < 0.85 ? `Wants to test the market. Try offering closer to ${fairMarket.toFixed(1)}M/yr.` :
        `Decided to explore other options despite the offer.`;
      return { success: false, reason, willHitFA: true };
    }

    const guaranteedPct = Math.round(35 + Math.random() * 25);
    const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
    db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
    return { success: true };
  });

  ipcMain.handle('get-offseason-status', () => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const season = getCurrentSeason();
    const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
    const draftGenerated = champion
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
      : false;
    const draftComplete = draftGenerated
      ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
      : false;
    if (!teamRow) return { playoffsComplete: !!champion, pendingResigns: 0, draftGenerated, draftComplete };
    const teamId = parseInt(teamRow.value);
    const pending = (db.prepare(`
      SELECT COUNT(*) as count FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
    `).get(teamId) as any).count;
    return { playoffsComplete: !!champion, pendingResigns: pending, draftGenerated, draftComplete };
  });

  // ─── CPU Free Agency ─────────────────────────────────────────────────────────

  ipcMain.handle('cpu-fa-signing', () => {
    const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

    const MIN_ROSTER: Record<string, number> = {
      QB: 2, RB: 3, WR: 4, TE: 2, OL: 6, DL: 4, LB: 4, CB: 4, S: 2, K: 1,
    };

    const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
    let totalSigned = 0;
    const signingsByTeam: Record<number, number> = {};

    const runSignings = db.transaction(() => {
      for (const team of cpuTeams) {
        const activeCount = (db.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND roster_status = 'active'").get(team.id) as any).cnt;
        let slotsLeft = 53 - activeCount;
        if (slotsLeft <= 0) continue;

        const posCounts = db.prepare(`
          SELECT position, COUNT(*) as cnt
          FROM players WHERE team_id = ? AND roster_status = 'active'
          GROUP BY position
        `).all(team.id) as any[];
        const byPos: Record<string, number> = {};
        for (const r of posCounts) byPos[r.position] = r.cnt;

        let teamSigned = 0;
        for (const [pos, minCount] of Object.entries(MIN_ROSTER)) {
          if (slotsLeft <= 0) break;
          const current = byPos[pos] ?? 0;
          const needed = Math.max(0, minCount - current);

          for (let i = 0; i < needed && slotsLeft > 0; i++) {
            const fa = db.prepare(`
              SELECT id, overall_rating, age, position, dev_trait
              FROM players WHERE is_free_agent = 1 AND position = ?
              ORDER BY overall_rating DESC LIMIT 1
            `).get(pos) as any;
            if (!fa) break;

            const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
            const salary = Math.round(fair * (0.90 + Math.random() * 0.15) * 10) / 10;
            const years = fa.age <= 27 ? 2 : 1;
            const gtd = Math.round(salary * years * 0.30 * 10) / 10;

            db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?")
              .run(team.id, fa.id);
            db.prepare(`
              INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
              VALUES (?, ?, ?, ?, ?, ?, 30)
            `).run(fa.id, team.id, years, years, salary, gtd);

            totalSigned++;
            teamSigned++;
            slotsLeft--;
          }
        }
        if (teamSigned > 0) signingsByTeam[team.id] = teamSigned;
      }
    });
    runSignings();

    const teamsActive = Object.keys(signingsByTeam).length;
    return { totalSigned, teamsActive };
  });
}
