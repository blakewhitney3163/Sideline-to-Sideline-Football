import { db } from './database';

const NFL_TEAMS = [
  { name: 'Ravens',     city: 'Baltimore',   abbreviation: 'BAL', conference: 'AFC', division: 'North' },
  { name: 'Bengals',    city: 'Cincinnati',   abbreviation: 'CIN', conference: 'AFC', division: 'North' },
  { name: 'Browns',     city: 'Cleveland',    abbreviation: 'CLE', conference: 'AFC', division: 'North' },
  { name: 'Steelers',   city: 'Pittsburgh',   abbreviation: 'PIT', conference: 'AFC', division: 'North' },
  { name: 'Texans',     city: 'Houston',      abbreviation: 'HOU', conference: 'AFC', division: 'South' },
  { name: 'Colts',      city: 'Indianapolis', abbreviation: 'IND', conference: 'AFC', division: 'South' },
  { name: 'Jaguars',    city: 'Jacksonville', abbreviation: 'JAX', conference: 'AFC', division: 'South' },
  { name: 'Titans',     city: 'Tennessee',    abbreviation: 'TEN', conference: 'AFC', division: 'South' },
  { name: 'Bills',      city: 'Buffalo',      abbreviation: 'BUF', conference: 'AFC', division: 'East'  },
  { name: 'Dolphins',   city: 'Miami',        abbreviation: 'MIA', conference: 'AFC', division: 'East'  },
  { name: 'Patriots',   city: 'New England',  abbreviation: 'NE',  conference: 'AFC', division: 'East'  },
  { name: 'Jets',       city: 'New York',     abbreviation: 'NYJ', conference: 'AFC', division: 'East'  },
  { name: 'Broncos',    city: 'Denver',       abbreviation: 'DEN', conference: 'AFC', division: 'West'  },
  { name: 'Chiefs',     city: 'Kansas City',  abbreviation: 'KC',  conference: 'AFC', division: 'West'  },
  { name: 'Raiders',    city: 'Las Vegas',    abbreviation: 'LV',  conference: 'AFC', division: 'West'  },
  { name: 'Chargers',   city: 'Los Angeles',  abbreviation: 'LAC', conference: 'AFC', division: 'West'  },
  { name: 'Bears',      city: 'Chicago',      abbreviation: 'CHI', conference: 'NFC', division: 'North' },
  { name: 'Lions',      city: 'Detroit',      abbreviation: 'DET', conference: 'NFC', division: 'North' },
  { name: 'Packers',    city: 'Green Bay',    abbreviation: 'GB',  conference: 'NFC', division: 'North' },
  { name: 'Vikings',    city: 'Minnesota',    abbreviation: 'MIN', conference: 'NFC', division: 'North' },
  { name: 'Falcons',    city: 'Atlanta',      abbreviation: 'ATL', conference: 'NFC', division: 'South' },
  { name: 'Panthers',   city: 'Carolina',     abbreviation: 'CAR', conference: 'NFC', division: 'South' },
  { name: 'Saints',     city: 'New Orleans',  abbreviation: 'NO',  conference: 'NFC', division: 'South' },
  { name: 'Buccaneers', city: 'Tampa Bay',    abbreviation: 'TB',  conference: 'NFC', division: 'South' },
  { name: 'Cowboys',    city: 'Dallas',       abbreviation: 'DAL', conference: 'NFC', division: 'East'  },
  { name: 'Giants',     city: 'New York',     abbreviation: 'NYG', conference: 'NFC', division: 'East'  },
  { name: 'Eagles',     city: 'Philadelphia', abbreviation: 'PHI', conference: 'NFC', division: 'East'  },
  { name: 'Commanders', city: 'Washington',   abbreviation: 'WAS', conference: 'NFC', division: 'East'  },
  { name: 'Cardinals',  city: 'Arizona',      abbreviation: 'ARI', conference: 'NFC', division: 'West'  },
  { name: 'Rams',       city: 'Los Angeles',  abbreviation: 'LAR', conference: 'NFC', division: 'West'  },
  { name: '49ers',      city: 'San Francisco', abbreviation: 'SF', conference: 'NFC', division: 'West'  },
  { name: 'Seahawks',   city: 'Seattle',      abbreviation: 'SEA', conference: 'NFC', division: 'West'  },
];

export function seedTeams(): void {
  const insert = db.prepare(`
    INSERT INTO teams(name, city, abbreviation, conference, division)
    VALUES (@name, @city, @abbreviation, @conference, @division)
  `);
  const seed = db.transaction(() => { for (const team of NFL_TEAMS) insert.run(team); });
  seed();
  console.log('32 teams inserted successfully');
}
