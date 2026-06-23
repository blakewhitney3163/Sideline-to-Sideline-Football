import { db } from './database';

// ─── Name Pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Marcus', 'Tyler', 'Jordan', 'Derek', 'Chris', 'Mike', 'Ryan',
  'Jake', 'Aaron', 'Kevin', 'Brandon', 'Justin', 'Travis', 'Logan', 'Darius',
  'Malik', 'Isaiah', 'Tyrone', 'Jamal', 'Andre', 'Dominic', 'Elijah', 'Xavier',
  'Terrell', 'Cameron', 'Devin', 'Jaylen', 'Trevon', 'Kendall', 'Carlos',
  'Anthony', 'Nathan', 'Kyle', 'Evan', 'Corey', 'Donte', 'Tanner', 'Cole',
  'Brock', 'Hunter', 'Drew', 'Blake', 'Grant', 'Chase', 'Bryce', 'Zach',
  'Will', 'Cody', 'Deon', 'Marquise', 'Jalen', 'Devon', 'Rashad', 'Desmond',
  'Quinton', 'Reginald', 'Sterling', 'Dwayne', 'Orlando', 'Tremayne',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson',
  'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis',
  'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'Hernandez', 'King', 'Wright',
  'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Gonzalez', 'Nelson',
  'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell',
  'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris',
  'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Cooper',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ri(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[ri(0, arr.length - 1)];
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function genName() {
  return { first_name: pick(FIRST_NAMES), last_name: pick(LAST_NAMES) };
}

// ─── Position Labels ─────────────────────────────────────────────────────────

const POSITION_LABEL_POOLS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['HB', 'HB', 'HB', 'FB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['LT', 'LG', 'C', 'RG', 'RT', 'LT', 'LG', 'RG', 'RT'],
  DL: ['DE', 'DE', 'DT', 'DT', 'DE', 'DT', 'DE'],
  LB: ['MLB', 'OLB', 'OLB', 'MLB', 'OLB', 'OLB', 'MLB'],
  CB: ['CB'],
  S:  ['FS', 'SS', 'FS', 'SS', 'FS'],
  K:  ['K'],
};

// ─── Overall Rating by Roster Slot ───────────────────────────────────────────

function getOverall(index: number, total: number): number {
  const ratio = index / total;
  if (ratio < 0.20) return ri(80, 95);   // top of depth chart
  if (ratio < 0.50) return ri(72, 84);   // starters / rotational
  if (ratio < 0.75) return ri(64, 76);   // backup
  return ri(56, 68);                      // depth / practice squad level
}

function getFaOverall(): number {
  return ri(55, 76);
}

// ─── Dev Trait ────────────────────────────────────────────────────────────────

function devTrait(ovr: number): string {
  const r = Math.random();
  // OVR 90+: ~5% XF, ~20% SS, ~60% Star, ~15% Normal
  if (ovr >= 90) return r < 0.05 ? 'X-Factor' : r < 0.25 ? 'Superstar' : r < 0.85 ? 'Star' : 'Normal';
  // OVR 85-89: ~2% XF, ~12% SS, ~60% Star, ~26% Normal
  if (ovr >= 85) return r < 0.02 ? 'X-Factor' : r < 0.14 ? 'Superstar' : r < 0.74 ? 'Star' : 'Normal';
  // OVR 80-84: ~0.5% XF, ~5% SS, ~45% Star, ~49.5% Normal
  if (ovr >= 80) return r < 0.005 ? 'X-Factor' : r < 0.055 ? 'Superstar' : r < 0.505 ? 'Star' : 'Normal';
  // OVR 70-79: ~0.1% XF, ~1% SS, ~20% Star, ~79% Normal
  if (ovr >= 70) return r < 0.001 ? 'X-Factor' : r < 0.011 ? 'Superstar' : r < 0.211 ? 'Star' : 'Normal';
  // Below 70: no elite traits
  return r < 0.04 ? 'Star' : 'Normal';
}

// ─── Age by Role ─────────────────────────────────────────────────────────────

function getAge(index: number, total: number): number {
  const ratio = index / total;
  if (ratio < 0.20) return ri(24, 33);
  if (ratio < 0.50) return ri(22, 30);
  return ri(21, 27);
}

// ─── Position-Specific Attributes ────────────────────────────────────────────

interface Attrs {
  speed: number; strength: number; awareness: number;
  throw_accuracy: number; throw_power: number;
  catching: number; route_running: number;
  tackle_rating: number; coverage: number; pass_rush: number;
  kickpower: number; kickaccuracy: number;
  runblocking: number; passblocking: number;
}

function genAttrs(position: string, ovr: number): Attrs {
  const b = (lo: number, hi: number) => clamp(ri(ovr + lo, ovr + hi), 40, 99);
  const flat = (lo: number, hi: number) => ri(lo, hi);

  const base: Attrs = {
    speed: b(-15, 5), strength: b(-15, 5), awareness: b(-10, 8),
    throw_accuracy: 40, throw_power: 40, catching: 40, route_running: 40,
    tackle_rating: 40, coverage: 40, pass_rush: 40,
    kickpower: 40, kickaccuracy: 40, runblocking: 40, passblocking: 40,
  };

  switch (position) {
    case 'QB': return { ...base,
      speed:         b(-22, -5),
      strength:      b(-18, -3),
      awareness:     b(-4, 10),
      throw_accuracy: b(-5, 8),
      throw_power:   b(-8, 8),
    };
    case 'RB': return { ...base,
      speed:    b(-5, 12),
      strength: b(-8, 8),
      catching: b(-14, 3),
      awareness: b(-10, 5),
    };
    case 'WR': return { ...base,
      speed:         b(-3, 13),
      strength:      b(-22, -6),
      catching:      b(-4, 10),
      route_running: b(-8, 8),
      awareness:     b(-10, 5),
    };
    case 'TE': return { ...base,
      speed:         b(-12, 3),
      strength:      b(-8, 8),
      catching:      b(-8, 8),
      route_running: b(-14, 2),
      awareness:     b(-8, 5),
    };
    case 'OL': return { ...base,
      speed:        b(-26, -10),
      strength:     b(-3, 13),
      awareness:    b(-8, 5),
      runblocking:  b(-5, 10),
      passblocking: b(-5, 10),
    };
    case 'DL': return { ...base,
      speed:        b(-12, 3),
      strength:     b(-3, 13),
      awareness:    b(-10, 5),
      tackle_rating: b(-8, 8),
      pass_rush:    b(-5, 10),
    };
    case 'LB': return { ...base,
      speed:        b(-8, 5),
      strength:     b(-8, 8),
      awareness:    b(-5, 8),
      tackle_rating: b(-5, 10),
      coverage:     b(-16, 0),
      pass_rush:    b(-12, 3),
    };
    case 'CB': return { ...base,
      speed:        b(-3, 13),
      strength:     b(-22, -5),
      awareness:    b(-8, 5),
      tackle_rating: b(-16, 0),
      coverage:     b(-5, 10),
    };
    case 'S': return { ...base,
      speed:        b(-5, 8),
      strength:     b(-12, 3),
      awareness:    b(-5, 8),
      tackle_rating: b(-8, 8),
      coverage:     b(-8, 8),
    };
    case 'K': return { ...base,
      speed:        flat(48, 72),
      strength:     flat(48, 72),
      awareness:    b(-8, 5),
      kickpower:    b(-5, 10),
      kickaccuracy: b(-5, 10),
    };
    default: return base;
  }
}

// ─── Roster Configuration ─────────────────────────────────────────────────────
// 53 players per team

const ROSTER_SLOTS: { position: string; count: number }[] = [
  { position: 'QB', count: 3  },
  { position: 'RB', count: 5  },
  { position: 'WR', count: 6  },
  { position: 'TE', count: 3  },
  { position: 'OL', count: 9  },
  { position: 'DL', count: 7  },
  { position: 'LB', count: 7  },
  { position: 'CB', count: 7  },
  { position: 'S',  count: 5  },
  { position: 'K',  count: 1  },
];

const FA_SLOTS: { position: string; count: number }[] = [
  { position: 'QB', count: 8  },
  { position: 'RB', count: 18 },
  { position: 'WR', count: 22 },
  { position: 'TE', count: 12 },
  { position: 'OL', count: 28 },
  { position: 'DL', count: 22 },
  { position: 'LB', count: 22 },
  { position: 'CB', count: 22 },
  { position: 'S',  count: 16 },
  { position: 'K',  count: 6  },
];

// ─── Main Export ─────────────────────────────────────────────────────────────

export function generatePlayers(): void {
    const insert = db.prepare(`
    INSERT INTO players (
      first_name, last_name, position, position_label, age, overall_rating,
      speed, strength, awareness, dev_trait,
      throw_accuracy, throw_power, catching, route_running,
      tackle_rating, coverage, pass_rush,
      kickpower, kickaccuracy, runblocking, passblocking,
      team_id, is_free_agent, roster_status
    ) VALUES (
      @first_name, @last_name, @position, @position_label, @age, @overall_rating,
      @speed, @strength, @awareness, @dev_trait,
      @throw_accuracy, @throw_power, @catching, @route_running,
      @tackle_rating, @coverage, @pass_rush,
      @kickpower, @kickaccuracy, @runblocking, @passblocking,
      @team_id, @is_free_agent, @roster_status
    )
  `);

  const teams = db.prepare('SELECT id FROM teams').all() as { id: number }[];
  let total = 0;

  db.transaction(() => {
    // Rostered players
    for (const team of teams) {
      for (const slot of ROSTER_SLOTS) {
        const labels = POSITION_LABEL_POOLS[slot.position] ?? [slot.position];
        for (let i = 0; i < slot.count; i++) {
          const ovr = getOverall(i, slot.count);
          const attrs = genAttrs(slot.position, ovr);
                  insert.run({
          ...genName(),
          position: slot.position,
          position_label: labels[i % labels.length],
          age: getAge(i, slot.count),
          overall_rating: ovr,
          ...attrs,
          dev_trait: devTrait(ovr),
          team_id: team.id,
          is_free_agent: 0,
          roster_status: 'active',
        });
          total++;
        }
      }
    }

    // Free agent pool
    for (const slot of FA_SLOTS) {
      const labels = POSITION_LABEL_POOLS[slot.position] ?? [slot.position];
      for (let i = 0; i < slot.count; i++) {
        const ovr = getFaOverall();
        const attrs = genAttrs(slot.position, ovr);
                insert.run({
          ...genName(),
          position: slot.position,
          position_label: labels[i % labels.length],
          age: ri(22, 34),
          overall_rating: ovr,
          ...attrs,
          dev_trait: devTrait(ovr),
          team_id: null,
          is_free_agent: 1,
          roster_status: 'free_agent',
        });
        total++;
      }
    }
  })();

  console.log(`${total} players generated (${teams.length * 53} rostered, ${FA_SLOTS.reduce((s, g) => s + g.count, 0)} free agents)`);
}

const MIN_FA_PER_POSITION: Record<string, number> = {
  QB: 5, RB: 12, WR: 14, TE: 7, OL: 16, DL: 14, LB: 14, CB: 14, S: 10, K: 4,
};

export function replenishFAPool(): void {
  const insert = db.prepare(`
    INSERT INTO players (
      first_name, last_name, position, position_label, age, overall_rating,
      speed, strength, awareness, dev_trait,
      throw_accuracy, throw_power, catching, route_running,
      tackle_rating, coverage, pass_rush,
      kickpower, kickaccuracy, runblocking, passblocking,
      team_id, is_free_agent, roster_status
    ) VALUES (
      @first_name, @last_name, @position, @position_label, @age, @overall_rating,
      @speed, @strength, @awareness, @dev_trait,
      @throw_accuracy, @throw_power, @catching, @route_running,
      @tackle_rating, @coverage, @pass_rush,
      @kickpower, @kickaccuracy, @runblocking, @passblocking,
      NULL, 1, 'free_agent'
    )
  `);

  db.transaction(() => {
    for (const [position, min] of Object.entries(MIN_FA_PER_POSITION)) {
      const current = (db.prepare(
        "SELECT COUNT(*) as cnt FROM players WHERE is_free_agent = 1 AND position = ?"
      ).get(position) as any).cnt as number;
      const toGenerate = Math.max(0, min - current);
      const labels = POSITION_LABEL_POOLS[position] ?? [position];
      for (let i = 0; i < toGenerate; i++) {
        const ovr = getFaOverall();
        const attrs = genAttrs(position, ovr);
        insert.run({
          ...genName(),
          position,
          position_label: labels[i % labels.length],
          age: ri(21, 31),
          overall_rating: ovr,
          ...attrs,
          dev_trait: devTrait(ovr),
        });
      }
    }
  })();
}
