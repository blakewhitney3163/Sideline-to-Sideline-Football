import { db } from '../database';
import { playerRepo, contractRepo, settingsRepo } from '../repositories';
import { HOF_MIN_GAMES, HOF_THRESHOLDS } from '../constants';
import { AdvanceSeasonResult } from '../types';
import { cpuRosterCuts, cpuResignAttempts, checkHoldoutsAndDemands } from './ContractService';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { replenishFAPool } from '../generatePlayers';
import { evaluateOwnerGoals } from './OwnerGoalsService';
import { decrementCoachContracts, progressCoachXP } from './CoachingService';
import { checkCapEscalation, checkExpansionVote, checkCpuRelocation } from './LeagueExpansionService';
import { checkLeagueEvents } from './LeagueEventsService';
import { generatePlayerGoals, evaluatePlayerGoals } from './PlayerGoalsService';

function isHOFEligible(position: string, career: any): boolean {
  if ((career.games ?? 0) < HOF_MIN_GAMES) return false;
  const thresholds = HOF_THRESHOLDS[position];
  if (!thresholds) return false;
  return thresholds.some((t: any) => (parseFloat(career[t.stat]) || 0) >= t.value);
}


// ─── Apply Pending Stadium Upgrades ───────────────────────────────────────────
function applyPendingStadiumUpgrades(): void {
  db.prepare(`
    UPDATE team_finances
    SET stadium_upgrade_level = stadium_upgrade_level + 1,
        stadium_capacity = stadium_capacity + 8000,
        pending_upgrade = 0
    WHERE pending_upgrade = 1 AND stadium_upgrade_level < 5
  `).run();
}

// ─── Dynamic Revenue Recalculation ────────────────────────────────────────────
function recalculateTeamFinances(completedSeason: number): void {
  const allTeams = db.prepare('SELECT id FROM teams').all() as any[];
  const BASE_REVENUE: Record<string, number> = { large: 360, medium: 260, small: 185 };
  const BASE_RATE: Record<string, number>  = { large: 0.82, medium: 0.72, small: 0.62 };

  const recRows = db.prepare(`
    SELECT t.id as team_id,
      COALESCE(SUM(CASE WHEN (g.home_team_id=t.id AND g.home_score>g.away_score)
                        OR (g.away_team_id=t.id AND g.away_score>g.home_score) THEN 1 ELSE 0 END),0) as wins,
      COUNT(g.id) as played
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id=t.id OR g.away_team_id=t.id)
      AND g.season=? AND g.is_simulated=1 AND g.is_playoff=0 AND (g.is_preseason=0 OR g.is_preseason IS NULL)
    GROUP BY t.id
  `).all(completedSeason) as any[];

  const recordMap = new Map(recRows.map((r: any) => [r.team_id, r]));

  const updFinances = db.prepare(
    'UPDATE team_finances SET attendance_rate=?, season_revenue=?, owner_budget=? WHERE team_id=?'
  );

  db.transaction(() => {
    for (const team of allTeams) {
      const fin = db.prepare('SELECT * FROM team_finances WHERE team_id=?').get(team.id) as any;
      if (!fin) continue;
      const rec = recordMap.get(team.id);
      const winPct = rec && rec.played >= 4 ? rec.wins / rec.played : 0.5;

      const baseRate = BASE_RATE[fin.market_size] ?? 0.72;
      const winBonus = (winPct - 0.5) * 0.18;  // ±9% based on winning
      const newRate = Math.max(0.45, Math.min(0.97, baseRate + winBonus));

      const baseRev = BASE_REVENUE[fin.market_size] ?? 260;
      const winRevBonus = (winPct - 0.5) * 60;  // ±30M based on winning
      const newRev = Math.max(baseRev * 0.6, Math.round((baseRev + winRevBonus) * 10) / 10);
      const newBudget = Math.round(newRev * (fin.market_size === 'large' ? 1.08 : 1.06) * 10) / 10;

      updFinances.run(Math.round(newRate * 1000) / 1000, newRev, newBudget, team.id);
    }
  })();
}

// ─── Open Free Agency ─────────────────────────────────────────────────────────
export function openFreeAgency(userTeamId: number): { newFas: number; cpuResigns: number } {
  const season = getCurrentSeason();
  const key = `fa_open_${season}`;
  const already = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  if (already) return { newFas: 0, cpuResigns: 0 };

  cpuRosterCuts(userTeamId);
  const { resigned: cpuResigns } = cpuResignAttempts(userTeamId);

  contractRepo.decrementYears();
  let newFas = 0;
  db.transaction(() => {
    for (const { player_id } of db.prepare(
      'SELECT player_id FROM contracts WHERE years_remaining <= 0'
    ).all() as any[]) {
      contractRepo.delete(player_id);
      playerRepo.releaseToFA(player_id);
      newFas++;
    }
  })();

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(key);
  return { newFas, cpuResigns };
}

export async function advanceSeason(): Promise<AdvanceSeasonResult> {
  const current = getCurrentSeason();
  const next = current + 1;
  const userTeamId = settingsRepo.getUserTeamId() ?? -1;

  // Force-retire any announcing_retirement players not resolved last offseason
  for (const p of db.prepare(`
    SELECT id, first_name, last_name, position, age, overall_rating
    FROM players WHERE roster_status = 'announcing_retirement'
  `).all() as any[]) {
    db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(p.id);
    contractRepo.delete(p.id);
    logNewsEvent({
      eventType: 'retirement', category: 'season',
      headline: `${p.first_name} ${p.last_name} Retires`,
      detail: `${p.position} · Age ${p.age} · ${p.overall_rating} OVR — a career comes to an end.`,
      playerId: p.id, season: current,
    });
  }

  // ── Age all active players ─────────────────────────────────────────────────
  db.prepare("UPDATE players SET age = age + 1 WHERE roster_status != 'retired'").run();

  const players = db.prepare(`
    SELECT id, age, overall_rating, speed, strength, awareness, dev_trait, position,
           throw_accuracy, throw_power, catching, route_running, tackle_rating, coverage, pass_rush
    FROM players WHERE roster_status != 'retired'
  `).all() as any[];

  // ── Progression ───────────────────────────────────────────────────────────
  const progressionTable: Record<string, Record<string, [number, number]>> = {
    young:   { Normal: [0, 1], Star: [1, 2], Superstar: [2, 3], 'X-Factor': [3, 4] },
    rising:  { Normal: [0, 1], Star: [0, 2], Superstar: [1, 2], 'X-Factor': [2, 3] },
    prime:   { Normal: [-1, 0], Star: [0, 1], Superstar: [0, 1], 'X-Factor': [0, 1] },
    decline: { Normal: [-2,-1], Star: [-1, 0], Superstar: [-1, 0], 'X-Factor': [-1, 0] },
    old:     { Normal: [-3,-2], Star: [-2,-1], Superstar: [-2,-1], 'X-Factor': [-1, 0] },
    veteran: { Normal: [-4,-3], Star: [-3,-2], Superstar: [-3,-2], 'X-Factor': [-2,-1] },
  };

  const updatePlayer = db.prepare(`
    UPDATE players SET overall_rating = ?, speed = ?, strength = ?, awareness = ?,
    throw_accuracy = ?, throw_power = ?, catching = ?, route_running = ?,
    tackle_rating = ?, coverage = ?, pass_rush = ? WHERE id = ?
  `);

  const attr = (cur: number, growP: number, decP: number): number => {
    const r = Math.random();
    if (r < growP) return Math.min(99, cur + 1);
    if (r < growP + decP) return Math.max(40, cur - 1);
    return cur;
  };

  db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const bracket =
        p.age <= 23 ? 'young' : p.age <= 26 ? 'rising' : p.age <= 29 ? 'prime' :
        p.age <= 32 ? 'decline' : p.age <= 35 ? 'old' : 'veteran';
      const [min, max] = progressionTable[bracket][trait] ?? [0, 0];
      const newOvr = Math.max(40, Math.min(99, p.overall_rating + Math.floor(Math.random() * (max - min + 1)) + min));
      const isYoung = p.age <= 26, isOld = p.age >= 32, pos = p.position;
      const isRecvr = ['WR','TE','RB','HB','FB'].includes(pos);
      const isDef = ['DL','DE','DT','LE','RE','IDL','LB','MLB','OLB','CB','S','FS','SS'].includes(pos);
      updatePlayer.run(newOvr,
        attr(p.speed ?? 70, isYoung ? 0.20 : 0.03, p.age >= 34 ? 0.70 : p.age >= 31 ? 0.40 : p.age >= 29 ? 0.15 : 0.03),
        attr(p.strength ?? 70, p.age <= 25 ? 0.35 : 0.05, isOld ? 0.30 : 0.05),
        attr(p.awareness ?? 70, isYoung ? 0.35 : p.age <= 31 ? 0.15 : 0.05, p.age >= 35 ? 0.30 : 0.05),
        attr(p.throw_accuracy ?? 70, isYoung && pos === 'QB' ? 0.40 : 0.03, isOld ? 0.25 : 0.04),
        attr(p.throw_power ?? 70, isYoung && pos === 'QB' ? 0.25 : 0.02, isOld ? 0.30 : 0.05),
        attr(p.catching ?? 70, isYoung && isRecvr ? 0.35 : 0.04, isOld ? 0.25 : 0.04),
        attr(p.route_running ?? 70, isYoung && ['WR','TE'].includes(pos) ? 0.35 : 0.03, isOld ? 0.20 : 0.04),
        attr(p.tackle_rating ?? 70, isYoung && isDef ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
        attr(p.coverage ?? 70, isYoung && ['CB','S','FS','SS','LB','MLB','OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
        attr(p.pass_rush ?? 70, isYoung && ['DL','DE','DT','LE','RE','IDL','LB','OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
        p.id,
      );
    }
  })();

  // ── Breakouts ─────────────────────────────────────────────────────────────
  const breakoutIds = new Set<number>();
  for (const row of db.prepare(`
    SELECT s.player_id, p.age, p.position,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
           SUM(s.rush_yards) as rush_yards, SUM(s.rec_yards) as rec_yards,
           SUM(s.sacks) as sacks, SUM(s.def_interceptions) as def_int,
           SUM(s.tackles) + SUM(s.assisted_tackles) as total_tkl
    FROM stats s JOIN players p ON s.player_id = p.id
    WHERE s.season = ? AND s.is_playoff = 0
    GROUP BY s.player_id
  `).all(current) as any[]) {
    const isBreakout =
      (row.position === 'QB' && (row.pass_yards > 4000 || row.pass_tds > 30)) ||
      (['RB','HB','FB'].includes(row.position) && row.rush_yards > 1300) ||
      (['WR','TE'].includes(row.position) && row.rec_yards > 1100) ||
      row.sacks > 10 || row.def_int > 5 || row.total_tkl > 130;
    if (isBreakout && row.age <= 28) breakoutIds.add(row.player_id);
  }
  if (breakoutIds.size > 0) {
    db.transaction(() => {
      for (const pid of breakoutIds) {
        const pp = db.prepare('SELECT age FROM players WHERE id = ?').get(pid) as any;
        db.prepare('UPDATE players SET overall_rating = MIN(99, overall_rating + ?) WHERE id = ?')
          .run(pp?.age <= 24 ? 2 : 1, pid);
      }
    })();
  }

  // ── Practice Squad Development ────────────────────────────────────────────
  db.transaction(() => {
    for (const ps of db.prepare(`
      SELECT id, age, overall_rating FROM players
      WHERE roster_status = 'practice_squad' AND age <= 25
    `).all() as any[]) {
      const headroom = Math.max(0, 80 - ps.overall_rating);
      if (headroom === 0) continue;
      const bonus =
        ps.age <= 21 ? Math.min(headroom, Math.floor(Math.random() * 3) + 1) :
        ps.age <= 23 ? Math.min(headroom, Math.floor(Math.random() * 2) + 1) :
        Math.min(headroom, Math.random() < 0.45 ? 1 : 0);
      if (bonus > 0)
        db.prepare('UPDATE players SET overall_rating = overall_rating + ? WHERE id = ?').run(bonus, ps.id);
    }
  })();

  // ── Dev Trait Evolution ───────────────────────────────────────────────────
  const setTrait = db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
  db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal', rand = Math.random();
      if (trait === 'X-Factor') {
        if (p.age >= 32 || p.overall_rating < 88 || rand < 0.04) setTrait.run('Superstar', p.id);
      } else if (trait === 'Superstar') {
        if (p.age >= 34 || p.overall_rating < 82 || rand < 0.05) setTrait.run('Star', p.id);
      } else if (trait === 'Star') {
        if (p.age >= 36 || p.overall_rating < 76 || rand < 0.06) setTrait.run('Normal', p.id);
        else if (p.age <= 27 && p.overall_rating >= 84 && rand < 0.05) setTrait.run('Superstar', p.id);
      } else {
        if (p.age <= 26 && p.overall_rating >= 76 && rand < 0.08) setTrait.run('Star', p.id);
        else if (p.age <= 24 && p.overall_rating >= 83 && rand < 0.04) setTrait.run('Superstar', p.id);
      }
    }
  })();

  // ── Retirement ────────────────────────────────────────────────────────────
  const retired: { id: number; name: string; position: string; age: number; ovr: number }[] = [];
  const announcingRetirements: { id: number; name: string; position: string; age: number; ovr: number }[] = [];
  db.transaction(() => {
    for (const p of db.prepare(`
      SELECT id, first_name, last_name, position, age, overall_rating, team_id
      FROM players WHERE roster_status IN ('active','free_agent') AND age >= 30
    `).all() as any[]) {
      const base =
        p.age >= 40 ? 0.80 : p.age >= 38 ? 0.55 : p.age >= 36 ? 0.35 :
        p.age >= 34 ? 0.18 : p.age >= 32 ? 0.08 : p.age >= 30 ? 0.03 : 0;
      const retireChance = p.overall_rating < 65 ? base * 2.5 : p.overall_rating >= 88 ? base * 0.5 : base;
      if (Math.random() < retireChance) {
        const name = `${p.first_name} ${p.last_name}`;
        if (p.team_id && p.roster_status === 'active' && p.overall_rating >= 72 && p.age <= 36) {
          db.prepare("UPDATE players SET roster_status = 'announcing_retirement' WHERE id = ?").run(p.id);
          announcingRetirements.push({ id: p.id, name, position: p.position, age: p.age, ovr: p.overall_rating });
          logNewsEvent({
            eventType: 'retirement_announcement', category: 'season',
            headline: `${name} Announces Retirement Plans`,
            detail: `${p.position} · Age ${p.age} · ${p.overall_rating} OVR — considering hanging up the cleats.`,
            playerId: p.id, teamId: p.team_id, season: current,
          });
        } else {
          db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(p.id);
          contractRepo.delete(p.id);
          retired.push({ id: p.id, name, position: p.position, age: p.age, ovr: p.overall_rating });
          if (p.overall_rating >= 78) {
            logNewsEvent({
              eventType: 'retirement', category: 'season',
              headline: `${name} Retires`,
              detail: `${p.position} · Age ${p.age} · ${p.overall_rating} OVR`,
              playerId: p.id, season: current,
            });
          }
        }
      }
    }
  })();

  // ── Morale Update ─────────────────────────────────────────────────────────
  const teamWinPcts: Record<number, number> = {};
  for (const row of db.prepare(`
    SELECT t.id,
      SUM(CASE WHEN (g.home_team_id=t.id AND g.home_score>g.away_score)
               OR (g.away_team_id=t.id AND g.away_score>g.home_score) THEN 1 ELSE 0 END) as wins,
      COUNT(g.id) as played
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id=t.id OR g.away_team_id=t.id)
      AND g.season=? AND g.is_simulated=1 AND g.is_playoff=0 AND (g.is_preseason=0 OR g.is_preseason IS NULL)
    GROUP BY t.id
  `).all(current) as any[]) {
    teamWinPcts[row.id] = row.played > 0 ? row.wins / row.played : 0.5;
  }

  const moraleUpdate = db.prepare('UPDATE players SET morale = ? WHERE id = ?');
  db.transaction(() => {
    for (const p of db.prepare(`
      SELECT p.id, p.team_id, p.morale, c.years_remaining,
             (SELECT COUNT(DISTINCT s.game_id) FROM stats s WHERE s.player_id = p.id AND s.season = ?) as gp
      FROM players p
      LEFT JOIN contracts c ON c.player_id = p.id
      WHERE p.roster_status = 'active'
    `).all(current) as any[]) {
      const winPct = p.team_id ? (teamWinPcts[p.team_id] ?? 0.5) : 0.5;
      const base = p.morale ?? 75;
      let delta = winPct >= 0.625 ? 8 : winPct >= 0.5 ? 2 : winPct >= 0.375 ? -3 : -8;
      if (p.years_remaining === 1) delta -= 5;
      if ((p.gp ?? 0) === 0) delta -= 5;
      else if ((p.gp ?? 0) >= 14) delta += 3;
      delta += Math.floor(Math.random() * 7) - 3;
      moraleUpdate.run(Math.max(40, Math.min(100, base + delta)), p.id);
    }
  })();

  // ── Open Free Agency (idempotent) ─────────────────────────────────────────
  const { cpuResigns } = openFreeAgency(userTeamId);

  // ── Contract Demand Events ────────────────────────────────────────────────
  for (const row of db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.team_id,
           c.years_remaining,
           COALESCE(SUM(s.pass_yards), 0) as pass_yards, COALESCE(SUM(s.pass_tds), 0) as pass_tds,
           COALESCE(SUM(s.rush_yards), 0) as rush_yards, COALESCE(SUM(s.rec_yards), 0) as rec_yards,
           COALESCE(SUM(CAST(s.sacks AS REAL)), 0) as sacks,
           COALESCE(SUM(s.def_interceptions), 0) as def_int,
           COALESCE(SUM(s.tackles) + SUM(s.assisted_tackles), 0) as total_tkl
    FROM players p
    JOIN contracts c ON c.player_id = p.id
    LEFT JOIN stats s ON s.player_id = p.id AND s.season = ? AND s.is_playoff = 0
    WHERE c.years_remaining = 1 AND p.overall_rating >= 78 AND p.roster_status = 'active'
    GROUP BY p.id
  `).all(current) as any[]) {
    const pos = row.position as string;
    const isElite =
      (pos === 'QB' && (row.pass_yards > 3500 || row.pass_tds > 24)) ||
      (['RB','HB','FB'].includes(pos) && row.rush_yards > 1000) ||
      (['WR','TE'].includes(pos) && row.rec_yards > 900) ||
      row.sacks > 8 || row.def_int > 4 || row.total_tkl > 110 ||
      row.overall_rating >= 86;
    if (isElite) {
      logNewsEvent({
        eventType: 'contract_demand', category: 'transactions',
        headline: `${row.first_name} ${row.last_name} Seeking Contract Extension`,
        detail: `${pos} · ${row.overall_rating} OVR · Enters the offseason in the final year of their deal.`,
        playerId: row.id, teamId: row.team_id ?? undefined, season: next,
      });
    }
  }

  db.prepare("UPDATE players SET injury_status = 'healthy', weeks_out = 0, injury_type = NULL").run();
  db.prepare("UPDATE players SET roster_status = 'free_agent', is_free_agent = 1 WHERE roster_status = 'waivers'").run();

  // Clear resolved holdouts/demands from prior season
  db.prepare("UPDATE players SET holdout_status = NULL, holdout_weeks = 0, trade_demand = 0").run();

  // ── Archive Career Stats ──────────────────────────────────────────────────
  db.prepare(`
    INSERT INTO career_stats_history (
      player_id, season, team_id, games, completions, pass_attempts, pass_yards,
      pass_tds, interceptions, rush_attempts, rush_yards, rush_tds, targets, receptions,
      rec_yards, rec_tds, tackles, assisted_tackles, sacks, tfl, forced_fumbles,
      fumble_recoveries, def_interceptions, pass_deflections, def_tds
    )
    SELECT s.player_id, s.season, MAX(s.team_id),
      COUNT(DISTINCT s.game_id), SUM(s.completions), SUM(s.pass_attempts), SUM(s.pass_yards),
      SUM(s.pass_tds), SUM(s.interceptions), SUM(s.rush_attempts), SUM(s.rush_yards),
      SUM(s.rush_tds), SUM(s.targets), SUM(s.receptions), SUM(s.rec_yards), SUM(s.rec_tds),
      SUM(s.tackles), SUM(s.assisted_tackles), SUM(s.sacks), SUM(s.tfl), SUM(s.forced_fumbles),
      SUM(s.fumble_recoveries), SUM(s.def_interceptions), SUM(s.pass_deflections), SUM(s.def_tds)
    FROM stats s WHERE s.season = ? AND s.is_playoff = 0
    GROUP BY s.player_id, s.season
    ON CONFLICT(player_id, season) DO UPDATE SET
      team_id=excluded.team_id, games=excluded.games, completions=excluded.completions,
      pass_attempts=excluded.pass_attempts, pass_yards=excluded.pass_yards,
      pass_tds=excluded.pass_tds, interceptions=excluded.interceptions,
      rush_attempts=excluded.rush_attempts, rush_yards=excluded.rush_yards,
      rush_tds=excluded.rush_tds, targets=excluded.targets, receptions=excluded.receptions,
      rec_yards=excluded.rec_yards, rec_tds=excluded.rec_tds, tackles=excluded.tackles,
      assisted_tackles=excluded.assisted_tackles, sacks=excluded.sacks, tfl=excluded.tfl,
      forced_fumbles=excluded.forced_fumbles, fumble_recoveries=excluded.fumble_recoveries,
      def_interceptions=excluded.def_interceptions, pass_deflections=excluded.pass_deflections,
      def_tds=excluded.def_tds
  `).run(current);

  db.prepare('DELETE FROM stats WHERE season < ?').run(current - 1);
  db.prepare('DELETE FROM news_events WHERE season < ?').run(next - 2);

  // ── HOF Inductions ────────────────────────────────────────────────────────
  const hofInductees: { name: string; position: string }[] = [];
  db.transaction(() => {
    for (const r of retired) {
      if (db.prepare('SELECT id FROM hall_of_fame WHERE player_id = ?').get(r.id)) continue;
      const detail = db.prepare('SELECT dev_trait FROM players WHERE id = ?').get(r.id) as any;
      const career = db.prepare(`
        SELECT SUM(games) as games,
               SUM(pass_yards) as pass_yards, SUM(pass_tds) as pass_tds,
               SUM(rush_yards) as rush_yards, SUM(rush_tds) as rush_tds,
               SUM(rec_yards) as rec_yards, SUM(rec_tds) as rec_tds,
               SUM(receptions) as receptions, SUM(tackles) as tackles,
               SUM(CAST(sacks AS REAL)) as sacks,
               SUM(def_interceptions) as def_interceptions,
               SUM(pass_deflections) as pass_deflections
        FROM career_stats_history WHERE player_id = ?
      `).get(r.id) as any;
      if (!career?.games || !isHOFEligible(r.position, career)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO hall_of_fame (
          player_id, name, position, inducted_season, dev_trait, peak_ovr, career_games,
          career_pass_yards, career_pass_tds, career_rush_yards, career_rush_tds,
          career_rec_yards, career_rec_tds, career_receptions,
          career_tackles, career_sacks, career_def_ints, career_pass_deflections
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        r.id, r.name, r.position, next, detail?.dev_trait ?? 'Normal', r.ovr,
        career.games ?? 0, career.pass_yards ?? 0, career.pass_tds ?? 0,
        career.rush_yards ?? 0, career.rush_tds ?? 0, career.rec_yards ?? 0,
        career.rec_tds ?? 0, career.receptions ?? 0, career.tackles ?? 0,
        career.sacks ?? 0, career.def_interceptions ?? 0, career.pass_deflections ?? 0,
      );
      hofInductees.push({ name: r.name, position: r.position });
      logNewsEvent({
        eventType: 'hof', category: 'season',
        headline: `${r.name} Inducted into the Hall of Fame`,
        detail: `${r.position} · ${career.games} career games · a legend of the league.`,
        playerId: r.id, season: next,
      });
    }
  })();

  // ── Season Awards ─────────────────────────────────────────────────────────
  const mvpRow = db.prepare(`
    SELECT p.id, p.first_name || ' ' || p.last_name as name, p.position
    FROM stats s JOIN players p ON s.player_id = p.id
    WHERE s.season = ? AND s.is_playoff = 0
    GROUP BY s.player_id
    ORDER BY (SUM(s.pass_yards)*0.04 + SUM(s.pass_tds)*6 - SUM(s.interceptions)*3
      + SUM(s.rush_yards)*0.1 + SUM(s.rush_tds)*6
      + SUM(s.rec_yards)*0.1 + SUM(s.rec_tds)*6) DESC LIMIT 1
  `).get(current) as any;
  if (mvpRow) logNewsEvent({
    eventType: 'award', category: 'season',
    headline: `${mvpRow.name} Named League MVP`,
    detail: `${mvpRow.position} wins the most prestigious individual award of the ${current} season.`,
    playerId: mvpRow.id, season: next,
  });

  const dpoyRow = db.prepare(`
    SELECT p.id, p.first_name || ' ' || p.last_name as name, p.position
    FROM stats s JOIN players p ON s.player_id = p.id
    WHERE s.season = ? AND s.is_playoff = 0
      AND p.position IN ('DL','LB','CB','S','DE','DT','LE','RE','IDL','MLB','OLB','FS','SS','LOLB','ROLB')
    GROUP BY s.player_id
    ORDER BY (SUM(s.tackles)*2 + SUM(s.sacks)*10 + SUM(s.def_interceptions)*8
      + SUM(s.pass_deflections)*2 + SUM(s.forced_fumbles)*5) DESC LIMIT 1
  `).get(current) as any;
  if (dpoyRow) logNewsEvent({
    eventType: 'award', category: 'season',
    headline: `${dpoyRow.name} Named Defensive Player of the Year`,
    detail: `${dpoyRow.position} wins the top defensive honor of the ${current} season.`,
    playerId: dpoyRow.id, season: next,
  });

  replenishFAPool();
  decrementCoachContracts();
  progressCoachXP(current);
  evaluateOwnerGoals(current, userTeamId);
  evaluatePlayerGoals(current);

  settingsRepo.set('current_season', String(next));
  generatePlayerGoals(next, userTeamId);
  checkCapEscalation(next);
  checkExpansionVote(next);
  checkCpuRelocation(next);

  // ── Apply Pending Stadium Upgrades ──────────────────────────────────────────
  applyPendingStadiumUpgrades();

  // ── Dynamic Revenue Update ────────────────────────────────────────────────
  recalculateTeamFinances(current);

  // ── Random League Events ──────────────────────────────────────────────────
  checkLeagueEvents(next);

  // ── Holdouts & Trade Demands ──────────────────────────────────────────────
  checkHoldoutsAndDemands(userTeamId);

  return { nextSeason: next, retired, announcingRetirements, cpuResigns, breakouts: breakoutIds.size, hofInductees };
}
