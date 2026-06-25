import { db } from '../database';
import { scoutRepo, Scout } from '../repositories/ScoutRepository';

const FIRST_NAMES = [
  'Dave', 'Mike', 'Tony', 'Rick', 'Steve', 'Paul', 'Jeff', 'Chris',
  'Matt', 'Dan', 'Kevin', 'Scott', 'Brian', 'Gary', 'Ray', 'John',
  'Bob', 'Frank', 'Mark', 'Tim', 'Bill', 'Greg', 'Tom', 'Jim',
  'Ron', 'Ken', 'Ed', 'Sam', 'Pete', 'Carl', 'Leon', 'Derek',
];

const LAST_NAMES = [
  'Harrison', 'Freeman', 'Bradley', 'Banks', 'Lawson', 'Nguyen',
  'Patel', 'Walsh', 'Grant', 'Porter', 'Burns', 'Warren', 'Pierce',
  'Carr', 'Byrd', 'Goodwin', 'Calhoun', 'Holt', 'Bauer', 'Cruz',
  'Diaz', 'Okafor', 'Morrow', 'Stokes', 'Frost', 'Vega', 'Novak',
  'Marsh', 'Holloway', 'Decker', 'Tanner', 'Wiley', 'Ingram', 'Cross',
];

const SPECIALTIES: Scout['specialty'][] = ['Offense', 'Defense', 'College', 'National', 'Regional'];

function randName(): { first: string; last: string } {
  return {
    first: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
    last: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
  };
}

function randSpecialty(): Scout['specialty'] {
  return SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];
}

function salaryForRating(r: number): number {
  if (r >= 80) return Math.round((2.5 + Math.random() * 1.5) * 10) / 10;
  if (r >= 65) return Math.round((1.5 + Math.random() * 1.0) * 10) / 10;
  if (r >= 50) return Math.round((0.8 + Math.random() * 0.7) * 10) / 10;
  return Math.round((0.4 + Math.random() * 0.4) * 10) / 10;
}

function generateScoutRating(tier: 'team_low' | 'team_mid' | 'team_high' | 'pool'): number {
  const rand = Math.random();
  switch (tier) {
    case 'team_low':  return Math.round(25 + rand * 20);
    case 'team_mid':  return Math.round(35 + rand * 25);
    case 'team_high': return Math.round(50 + rand * 25);
    case 'pool':      return Math.round(20 + rand * 65);
  }
}

export function generateAllScouts(): void {
  const teams = db.prepare('SELECT id FROM teams').all() as { id: number }[];

  db.transaction(() => {
    for (const team of teams) {
      // Each team starts with 2 scouts of varied quality
      const tiers: Array<'team_low' | 'team_mid' | 'team_high'> = ['team_low', 'team_mid', 'team_high'];
      const numScouts = 2;
      for (let i = 0; i < numScouts; i++) {
        const tier = tiers[Math.min(i, tiers.length - 1)];
        const rating = generateScoutRating(tier);
        const { first, last } = randName();
        scoutRepo.create(
          team.id, first, last, rating,
          randSpecialty(), salaryForRating(rating), Math.floor(Math.random() * 4)
        );
      }
    }

    // Free-agent pool: 40 scouts of varying quality
    for (let i = 0; i < 40; i++) {
      const rating = generateScoutRating('pool');
      const { first, last } = randName();
      scoutRepo.create(
        null, first, last, rating,
        randSpecialty(), salaryForRating(rating), 0
      );
    }
  })();

  console.log(`Scouts generated: ${teams.length * 2} team scouts + 40 FA pool`);
}

export function hireScout(teamId: number, scoutId: number): { success: boolean; reason?: string } {
  const scout = scoutRepo.getById(scoutId);
  if (!scout) return { success: false, reason: 'Scout not found.' };
  if (scout.team_id !== null) return { success: false, reason: 'Scout is already on a staff.' };
  scoutRepo.assignToTeam(scoutId, teamId);
  return { success: true };
}

export function fireScout(scoutId: number): { success: boolean; reason?: string } {
  const scout = scoutRepo.getById(scoutId);
  if (!scout) return { success: false, reason: 'Scout not found.' };
  if (scout.team_id === null) return { success: false, reason: 'Scout is already a free agent.' };
  scoutRepo.release(scoutId);
  return { success: true };
}

export function replenishScoutPool(): void {
  const available = scoutRepo.countAvailable();
  if (available < 15) {
    const toAdd = 15 - available;
    for (let i = 0; i < toAdd; i++) {
      const rating = generateScoutRating('pool');
      const { first, last } = randName();
      scoutRepo.create(null, first, last, rating, randSpecialty(), salaryForRating(rating), 0);
    }
  }
}

export function getScoutsByTeam(teamId: number): Scout[] {
  return scoutRepo.getByTeam(teamId);
}

export function getAvailableScouts(): Scout[] {
  return scoutRepo.getAvailable();
}

export function getWeeklyScoutPoints(teamId: number): number {
  return scoutRepo.getWeeklyPoints(teamId);
}

/** Called each offseason — grow scouts by 1-3 OVR, increase years_on_staff. */
export function progressScouts(): void {
  const allTeamScouts = db.prepare(
    'SELECT * FROM scouts WHERE team_id IS NOT NULL'
  ).all() as Scout[];

  const update = db.prepare('UPDATE scouts SET overall_rating = ?, years_on_staff = ? WHERE id = ?');
  db.transaction(() => {
    for (const scout of allTeamScouts) {
      const growth = scout.years_on_staff >= 2 ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 2);
      const newRating = Math.min(95, scout.overall_rating + growth);
      update.run(newRating, scout.years_on_staff + 1, scout.id);
    }
  })();
}
