import { db } from '../database';
import { coachingRepo, Coach } from '../repositories/CoachingRepository';
import { logNewsEvent } from '../helpers/logNewsEvent';

// ─── Name Pool ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Mike', 'Bill', 'Andy', 'Sean', 'Kyle', 'Matt', 'Robert', 'Frank',
  'Greg', 'Dan', 'Jim', 'Steve', 'John', 'Tom', 'Brian', 'Kevin',
  'Ron', 'Chuck', 'Dave', 'Pat', 'Todd', 'Josh', 'Wade', 'Ken',
  'Ray', 'Doug', 'Mark', 'Chris', 'Eric', 'Scott', 'Rick', 'Gary',
  'Herm', 'Vince', 'Tony', 'Jon', 'Don', 'Carl', 'Lou', 'Norv',
];

const LAST_NAMES = [
  'Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore',
  'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez',
  'Lewis', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King',
  'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson',
  'Carter', 'Mitchell', 'Perez', 'Turner', 'Phillips', 'Campbell', 'Parker',
  'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Rogers', 'Reed',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randName(): { first: string; last: string } {
  return {
    first: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
    last: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
  };
}

function randInt(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function clampR(r: number): number {
  return Math.max(40, Math.min(99, Math.round(r)));
}

function generateTierRating(): number {
  const r = Math.random();
  if (r < 0.10) return randInt(88, 96);
  if (r < 0.35) return randInt(78, 87);
  if (r < 0.70) return randInt(67, 77);
  return randInt(55, 66);
}

function generateRatings(role: 'HC' | 'OC' | 'DC' | 'ST'): {
  overall: number; offense: number; defense: number; development: number;
} {
  const base = generateTierRating();
  if (role === 'HC') {
    return {
      overall: base,
      offense: clampR(base + randInt(-8, 5)),
      defense: clampR(base + randInt(-8, 5)),
      development: clampR(base + randInt(-5, 8)),
    };
  }
  if (role === 'OC') {
    return {
      offense: base,
      overall: clampR(base + randInt(-10, 0)),
      defense: clampR(base + randInt(-20, -8)),
      development: clampR(base + randInt(-12, 0)),
    };
  }
  if (role === 'DC') {
    return {
      defense: base,
      overall: clampR(base + randInt(-10, 0)),
      offense: clampR(base + randInt(-20, -8)),
      development: clampR(base + randInt(-12, 0)),
    };
  }
  // ST
  return {
    overall: base,
    offense: clampR(base + randInt(-15, -5)),
    defense: clampR(base + randInt(-15, -5)),
    development: clampR(base + randInt(-10, 0)),
  };
}

function salaryFor(rating: number): number {
  if (rating >= 88) return Math.round((4.0 + Math.random() * 4.0) * 10) / 10;
  if (rating >= 78) return Math.round((2.0 + Math.random() * 2.0) * 10) / 10;
  if (rating >= 67) return Math.round((1.0 + Math.random() * 1.0) * 10) / 10;
  return Math.round((0.5 + Math.random() * 0.5) * 10) / 10;
}

function expFor(rating: number): number {
  const base = rating >= 88 ? 15 : rating >= 78 ? 8 : rating >= 67 ? 3 : 1;
  return base + Math.floor(Math.random() * 8);
}

function buildCoach(role: 'HC' | 'OC' | 'DC' | 'ST', teamId: number | null) {
  const { first, last } = randName();
  const r = generateRatings(role);
  const primary = role === 'OC' ? r.offense : role === 'DC' ? r.defense : r.overall;
  return {
    teamId, role, firstName: first, lastName: last,
    overallRating: r.overall, offenseRating: r.offense,
    defenseRating: r.defense, developmentRating: r.development,
    experience: expFor(primary), salary: salaryFor(primary),
    yearsRemaining: randInt(1, 4),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateAllCoachingStaff(): void {
  const teams = db.prepare('SELECT id FROM teams').all() as { id: number }[];
  const roles: Array<'HC' | 'OC' | 'DC' | 'ST'> = ['HC', 'OC', 'DC', 'ST'];

  db.transaction(() => {
    for (const team of teams) {
      for (const role of roles) {
        const c = buildCoach(role, team.id);
        coachingRepo.create(
          c.teamId, c.role, c.firstName, c.lastName,
          c.overallRating, c.offenseRating, c.defenseRating,
          c.developmentRating, c.experience, c.salary, c.yearsRemaining
        );
      }
    }
    // 4 free-agent coaches per role in the available pool
    for (const role of roles) {
      for (let i = 0; i < 4; i++) {
        const c = buildCoach(role, null);
        coachingRepo.create(
          null, c.role, c.firstName, c.lastName,
          c.overallRating, c.offenseRating, c.defenseRating,
          c.developmentRating, c.experience, c.salary, c.yearsRemaining
        );
      }
    }
  })();

  console.log(`Coaching staff generated for ${teams.length} teams + 16 pool coaches`);
}

export function getStaffByTeam(teamId: number): Coach[] {
  return coachingRepo.getByTeam(teamId);
}

export function getAvailableCoaches(role?: string): Coach[] {
  return coachingRepo.getAvailable(role);
}

export function hireCoach(
  teamId: number,
  coachId: number,
  yearsRemaining: number = 1
): { success: boolean; reason?: string } {
  const coach = coachingRepo.getById(coachId);
  if (!coach) return { success: false, reason: 'Coach not found.' };
  if (coach.team_id !== null) return { success: false, reason: 'Coach is already under contract.' };

  // Release whoever holds this role on the team
  const existing = coachingRepo.getByTeamAndRole(teamId, coach.role);
  if (existing) coachingRepo.release(existing.id);

  const years = Math.max(1, Math.min(4, yearsRemaining));
  coachingRepo.assignToTeam(coachId, teamId, years);
  return { success: true };
}

export function decrementCoachContracts(): { released: number } {
  return coachingRepo.decrementContracts();
}

export function fireCoach(coachId: number): { success: boolean; reason?: string } {
  const coach = coachingRepo.getById(coachId);
  if (!coach) return { success: false, reason: 'Coach not found.' };
  if (coach.team_id === null) return { success: false, reason: 'Coach is already a free agent.' };
  coachingRepo.release(coachId);
  return { success: true };
}


// ─── Coaching XP Thresholds ────────────────────────────────────────────────────
// Cumulative XP required to reach each level (index = level number)
const XP_THRESHOLDS = [0, 0, 150, 400, 800, 1400, 2250, 3400, 4900, 6850, 9350];
const MAX_COACH_LEVEL = 10;

export function getCoachTierLabel(level: number): string {
  if (level >= 9) return 'Legendary';
  if (level >= 7) return 'Elite';
  if (level >= 5) return 'Experienced';
  if (level >= 3) return 'Competent';
  return 'Developing';
}

export function xpToNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_COACH_LEVEL) return 0;
  return XP_THRESHOLDS[currentLevel + 1] - XP_THRESHOLDS[currentLevel];
}

export function xpIntoCurrentLevel(totalXp: number, currentLevel: number): number {
  if (currentLevel >= MAX_COACH_LEVEL) return 0;
  return totalXp - XP_THRESHOLDS[currentLevel];
}

// ─── Season XP Progression ────────────────────────────────────────────────────
export function progressCoachXP(season: number): void {
  const coaches = db.prepare(
    'SELECT * FROM coaching_staff WHERE team_id IS NOT NULL'
  ).all() as any[];

  if (coaches.length === 0) return;

  // Build win/playoff/champion lookup per team
  const winRows = db.prepare(`
    SELECT t.id as team_id,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
               OR   (g.away_team_id = t.id AND g.away_score > g.home_score)
               THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN ((g.home_team_id = t.id AND g.home_score > g.away_score)
                 OR  (g.away_team_id = t.id AND g.away_score > g.home_score))
               AND g.is_playoff = 1 THEN 1 ELSE 0 END) as playoff_wins
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1
    GROUP BY t.id
  `).all(season) as any[];

  const teamStats = new Map<number, { wins: number; playoffWins: number }>();
  for (const r of winRows) teamStats.set(r.team_id, { wins: r.wins ?? 0, playoffWins: r.playoff_wins ?? 0 });

  // Determine champion and conference champions from champions table
  const champRow = db.prepare(
    "SELECT team_id FROM champions WHERE season = ? AND round = 'Super Bowl'"
  ).get(season) as any;
  const confChampRows = db.prepare(
    "SELECT team_id FROM champions WHERE season = ? AND round IN ('NFC Championship', 'AFC Championship')"
  ).all(season) as any[];
  const superBowlChamp = champRow?.team_id ?? -1;
  const confChamps = new Set(confChampRows.map((r: any) => r.team_id));

  // Determine division winners
  const divWinRows = db.prepare(`
    SELECT t.conference, t.division,
      t.id as team_id,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
               OR   (g.away_team_id = t.id AND g.away_score > g.home_score)
               THEN 1 ELSE 0 END) as wins
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    GROUP BY t.id
  `).all(season) as any[];

  const divWinners = new Set<number>();
  const divBest = new Map<string, { teamId: number; wins: number }>();
  for (const r of divWinRows) {
    const key = `${r.conference}-${r.division}`;
    const cur = divBest.get(key);
    if (!cur || r.wins > cur.wins) divBest.set(key, { teamId: r.team_id, wins: r.wins });
  }
  for (const v of divBest.values()) divWinners.add(v.teamId);

  const updateXP = db.prepare('UPDATE coaching_staff SET coaching_xp = ?, coaching_level = ?, overall_rating = ?, offense_rating = ?, defense_rating = ? WHERE id = ?');

  db.transaction(() => {
    for (const coach of coaches) {
      const stats = teamStats.get(coach.team_id) ?? { wins: 0, playoffWins: 0 };
      const isChamp     = coach.team_id === superBowlChamp;
      const isConfChamp = confChamps.has(coach.team_id);
      const isDivWinner = divWinners.has(coach.team_id);
      const madePlayoffs = stats.playoffWins > 0;

      // Calculate XP earned this season
      let earned = 20; // base employment XP
      earned += stats.wins * 8;
      if (madePlayoffs)  earned += 30;
      if (isDivWinner)   earned += 50;
      if (isConfChamp)   earned += 80;
      if (isChamp)       earned += 150;

      const currentXP    = (coach.coaching_xp ?? 0) + earned;
      const currentLevel = coach.coaching_level ?? 1;

      // Determine new level
      let newLevel = currentLevel;
      while (newLevel < MAX_COACH_LEVEL && currentXP >= XP_THRESHOLDS[newLevel + 1]) {
        newLevel++;
      }

      // Rating boost on level-up (+1 OVR, +1 primary rating)
      let newOverall = coach.overall_rating;
      let newOffense = coach.offense_rating;
      let newDefense = coach.defense_rating;
      const levelsGained = newLevel - currentLevel;
      if (levelsGained > 0) {
        newOverall = Math.min(97, newOverall + levelsGained);
        if (coach.role === 'OC') newOffense = Math.min(97, newOffense + levelsGained);
        else if (coach.role === 'DC') newDefense = Math.min(97, newDefense + levelsGained);

        // HC candidate news event for coordinators reaching level 6
        if ((coach.role === 'OC' || coach.role === 'DC') && newLevel >= 6 && currentLevel < 6) {
          logNewsEvent({
            eventType: 'coaching',
            category: 'transactions',
            headline: `${coach.first_name} ${coach.last_name} Emerging as Top HC Candidate`,
            detail: `${coach.role === 'OC' ? 'Offensive' : 'Defensive'} Coordinator has reached elite coaching status and is drawing attention from teams seeking a head coach.`,
            season,
          });
        }
      }

      updateXP.run(currentXP, newLevel, newOverall, newOffense, newDefense, coach.id);
    }
  })();
}

export function replenishCoachPool(): void {
  const roles: Array<'HC' | 'OC' | 'DC' | 'ST'> = ['HC', 'OC', 'DC', 'ST'];
  for (const role of roles) {
    const available = coachingRepo.countAvailable(role);
    if (available < 3) {
      for (let i = 0; i < 3 - available; i++) {
        const c = buildCoach(role, null);
        coachingRepo.create(
          null, c.role, c.firstName, c.lastName,
          c.overallRating, c.offenseRating, c.defenseRating,
          c.developmentRating, c.experience, c.salary, c.yearsRemaining
        );
      }
    }
  }
}
