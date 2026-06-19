import { db } from '../database';
import { coachingRepo, Coach } from '../repositories/CoachingRepository';

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

export function hireCoach(teamId: number, coachId: number): { success: boolean; reason?: string } {
  const coach = coachingRepo.getById(coachId);
  if (!coach) return { success: false, reason: 'Coach not found.' };
  if (coach.team_id !== null) return { success: false, reason: 'Coach is already under contract.' };

  // Release whoever holds this role on the team
  const existing = coachingRepo.getByTeamAndRole(teamId, coach.role);
  if (existing) coachingRepo.release(existing.id);

  coachingRepo.assignToTeam(coachId, teamId);
  return { success: true };
}

export function fireCoach(coachId: number): { success: boolean; reason?: string } {
  const coach = coachingRepo.getById(coachId);
  if (!coach) return { success: false, reason: 'Coach not found.' };
  if (coach.team_id === null) return { success: false, reason: 'Coach is already a free agent.' };
  coachingRepo.release(coachId);
  return { success: true };
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
