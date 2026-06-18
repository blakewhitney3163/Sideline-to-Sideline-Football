import { db } from './database';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomRating(): number {
  return randomInt(60, 95);
}

function generateName(): { first_name: string; last_name: string } {
  const firstNames = ['James', 'Marcus', 'Tyler', 'Jordan', 'Derek', 'Chris', 'Mike', 'Ryan', 'Jake', 'Aaron', 'Kevin', 'Brandon', 'Justin', 'Travis', 'Logan'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris'];
  return {
    first_name: firstNames[randomInt(0, firstNames.length - 1)],
    last_name: lastNames[randomInt(0, lastNames.length - 1)],
  };
}

const POSITION_GROUPS = [
  { position: 'QB', count: 2 }, { position: 'RB', count: 4 },
  { position: 'WR', count: 6 }, { position: 'TE', count: 2 },
  { position: 'OL', count: 8 }, { position: 'DL', count: 6 },
  { position: 'LB', count: 6 }, { position: 'CB', count: 6 },
  { position: 'S',  count: 4 }, { position: 'K',  count: 1 },
];

export function generatePlayers(): void {
  const insert = db.prepare(`
    INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent)
    VALUES (@first_name, @last_name, @position, @age, @overall_rating, @speed, @strength, @awareness, @team_id, 0)
  `);
  const teams = db.prepare('SELECT id FROM teams').all() as { id: number }[];
  let totalPlayers = 0;

  const gen = db.transaction(() => {
    for (const team of teams) {
      for (const group of POSITION_GROUPS) {
        for (let i = 0; i < group.count; i++) {
          const name = generateName();
          insert.run({ ...name, position: group.position, age: randomInt(21, 35),
            overall_rating: randomRating(), speed: randomRating(),
            strength: randomRating(), awareness: randomRating(), team_id: team.id });
          totalPlayers++;
        }
      }
    }
  });

  gen();
  console.log(`${totalPlayers} players generated successfully`);
}
