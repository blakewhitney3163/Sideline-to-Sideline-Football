import { db } from '../database';
import { logNewsEvent } from '../helpers/logNewsEvent';

interface StatRow {
  player_id: number;
  pass_attempts?: number;
  completions?: number;
  pass_yards?: number;
  pass_tds?: number;
  interceptions?: number;
  rush_attempts?: number;
  rush_yards?: number;
  rush_tds?: number;
  targets?: number;
  receptions?: number;
  rec_yards?: number;
  rec_tds?: number;
  tackles?: number;
  assisted_tackles?: number;
  sacks?: number;
  tfl?: number;
  def_interceptions?: number;
  pass_deflections?: number;
  fg_made?: number;
  fg_att?: number;
}

function gradePerformance(stat: StatRow, position: string): number {
  const s = stat;
  let grade = 50;

  switch (position) {
    case 'QB': {
      const att = s.pass_attempts ?? 0;
      const cmp = s.completions ?? 0;
      const yds = s.pass_yards ?? 0;
      const tds = s.pass_tds ?? 0;
      const ints = s.interceptions ?? 0;
      if (att < 5) return 50; // didn't really play
      const compPct = cmp / att;
      if (compPct >= 0.72) grade += 18;
      else if (compPct >= 0.62) grade += 10;
      else if (compPct < 0.50) grade -= 12;
      grade += Math.min(yds / 15, 22); // up to +22 for 330 yards
      grade += tds * 9;
      grade -= ints * 16;
      grade += Math.min((s.rush_yards ?? 0) / 25, 5);
      break;
    }
    case 'RB': {
      const att = s.rush_attempts ?? 0;
      const yds = s.rush_yards ?? 0;
      const tds = s.rush_tds ?? 0;
      if (att < 3) return 50;
      const ypc = att > 0 ? yds / att : 0;
      if (ypc >= 5.5) grade += 20;
      else if (ypc >= 4.5) grade += 10;
      else if (ypc < 3.0 && att > 6) grade -= 14;
      grade += Math.min(yds / 8, 22);
      grade += tds * 12;
      grade += Math.min((s.rec_yards ?? 0) / 15, 8);
      break;
    }
    case 'WR':
    case 'TE': {
      const tgts = s.targets ?? 0;
      const yds = s.rec_yards ?? 0;
      const tds = s.rec_tds ?? 0;
      const recs = s.receptions ?? 0;
      if (tgts < 2) return 50;
      const ypr = tgts > 0 ? yds / tgts : 0;
      if (ypr >= 12) grade += 20;
      else if (ypr >= 8) grade += 10;
      else if (ypr < 4 && tgts > 4) grade -= 8;
      grade += Math.min(yds / 8, 22);
      grade += tds * 12;
      if (tgts > 5 && recs / tgts < 0.35) grade -= 10;
      break;
    }
    case 'OL': {
      // No direct stats — slight positive bias since blockers rarely get graded
      return 58;
    }
    case 'DL': {
      const tkl = (s.tackles ?? 0) + (s.assisted_tackles ?? 0) * 0.5;
      const sacks = s.sacks ?? 0;
      const tfl = s.tfl ?? 0;
      grade += Math.min(tkl * 4, 20);
      grade += sacks * 18;
      grade += tfl * 6;
      break;
    }
    case 'LB': {
      const tkl = (s.tackles ?? 0) + (s.assisted_tackles ?? 0) * 0.5;
      const sacks = s.sacks ?? 0;
      const tfl = s.tfl ?? 0;
      const ints = s.def_interceptions ?? 0;
      grade += Math.min(tkl * 3.5, 22);
      grade += sacks * 14;
      grade += tfl * 5;
      grade += ints * 18;
      break;
    }
    case 'CB':
    case 'S': {
      const tkl = (s.tackles ?? 0) + (s.assisted_tackles ?? 0) * 0.5;
      const ints = s.def_interceptions ?? 0;
      const pds = s.pass_deflections ?? 0;
      const sacks = s.sacks ?? 0;
      grade += Math.min(tkl * 3, 18);
      grade += ints * 22;
      grade += pds * 8;
      grade += sacks * 10;
      break;
    }
    case 'K': {
      const made = s.fg_made ?? 0;
      const att = s.fg_att ?? 0;
      if (att === 0) return 55;
      const pct = made / att;
      if (pct === 1.0) grade += made >= 3 ? 30 : 18;
      else if (pct >= 0.75) grade += 8;
      else grade -= 15;
      break;
    }
    default:
      return 50;
  }

  return Math.max(0, Math.min(100, grade));
}

function calcDelta(grade: number, ovr: number, age: number, devTrait: string): number {
  const r = () => Math.random();

  // Base delta from grade
  let delta = 0;
  if (grade >= 82) {
    // Excellent: high chance of +1, small chance of +2
    if (r() < 0.62) delta = 1;
    if (delta === 1 && r() < 0.10) delta = 2;
  } else if (grade >= 67) {
    // Good: moderate chance of +1
    if (r() < 0.30) delta = 1;
  } else if (grade >= 45) {
    // Average: no change
    delta = 0;
  } else if (grade >= 32) {
    // Below average: small chance of -1
    if (r() < 0.22) delta = -1;
  } else {
    // Poor: higher chance of -1
    if (r() < 0.48) delta = -1;
  }

  // Age modifier
  if (delta > 0) {
    if (age <= 22) {
      // Very young — bonus chance of extra gain
      if (r() < 0.20) delta += 1;
    } else if (age >= 34) {
      // Older players rarely improve
      if (r() < 0.55) delta = 0;
    } else if (age >= 31) {
      if (r() < 0.30) delta = 0;
    }
  }

  if (delta < 0) {
    if (age <= 24) {
      // Young players are more resilient
      if (r() < 0.60) delta = 0;
    } else if (age >= 34) {
      // Accelerated regression for veterans
      if (r() < 0.30) delta -= 1;
    }
  }

  // Dev trait bonus on positive delta
  if (delta > 0) {
    const bonus = devTrait === 'X-Factor' ? 0.22
      : devTrait === 'Superstar' ? 0.14
      : devTrait === 'Star' ? 0.07
      : 0;
    if (bonus > 0 && r() < bonus) delta += 1;
  }

  // OVR ceiling — harder to gain at elite levels
  if (delta > 0) {
    if (ovr >= 95 && r() < 0.90) delta = 0;
    else if (ovr >= 91 && r() < 0.70) delta = 0;
    else if (ovr >= 87 && r() < 0.45) delta = 0;
  }

  // OVR floor — avoid piling on low-rated players
  if (delta < 0 && ovr <= 52 && r() < 0.55) delta = 0;

  return delta;
}

export function progressPlayers(gameStats: StatRow[], season: number, week: number): void {
  if (gameStats.length === 0) return;

  const playerIds = [...new Set(gameStats.map(s => s.player_id))];
  const ph = playerIds.map(() => '?').join(',');

  const players = db.prepare(
    `SELECT id, first_name, last_name, position, age, overall_rating, dev_trait, team_id
     FROM players WHERE id IN (${ph})`
  ).all(...playerIds) as any[];

  const playerMap = new Map(players.map((p: any) => [p.id, p]));

  for (const stat of gameStats) {
    const player = playerMap.get(stat.player_id);
    if (!player || !player.team_id) continue; // skip free agents / unknowns

    const grade = gradePerformance(stat, player.position);
    const delta = calcDelta(grade, player.overall_rating, player.age, player.dev_trait);
    if (delta === 0) continue;

    const newOvr = Math.max(40, Math.min(99, player.overall_rating + delta));
    db.prepare('UPDATE players SET overall_rating = ? WHERE id = ?').run(newOvr, player.id);

    // Breakout event: +2 OVR in a single game, or strong young player hitting a threshold
    const isBreakout =
      delta >= 2 ||
      (delta === 1 && player.age <= 24 && player.overall_rating >= 68 && grade >= 85);

    if (isBreakout) {
      logNewsEvent({
        eventType: 'breakout',
        category: 'season',
        headline: `${player.first_name} ${player.last_name} Is Breaking Out`,
        detail: `${player.position} · Age ${player.age} · climbed to ${newOvr} OVR after a standout Week ${week} performance.`,
        teamId: player.team_id,
        playerId: player.id,
        season,
        week,
      });
    }
  }
}
