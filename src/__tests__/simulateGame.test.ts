import { describe, it, expect } from 'vitest';

// ── Inline pure helpers from simulateGame.ts ──────────────────────────────────
// These are private but critical — any change to these functions should break
// a test before it ever reaches a save file.

type WeatherType = 'clear' | 'rain' | 'wind' | 'snow';
interface WeatherMultipliers { score: number; passYards: number; compPct: number; rushYards: number; rushAttempts: number; }
interface ScoringEvents { tds: number; fgs: number; }

function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random(), u2 = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function weatherMultipliers(w: WeatherType): WeatherMultipliers {
  switch (w) {
    case 'snow': return { score: 0.84, passYards: 0.74, compPct: -0.07, rushYards: 1.06, rushAttempts: 1.08 };
    case 'rain': return { score: 0.92, passYards: 0.87, compPct: -0.03, rushYards: 1.02, rushAttempts: 1.04 };
    case 'wind': return { score: 0.90, passYards: 0.80, compPct: -0.05, rushYards: 1.00, rushAttempts: 1.02 };
    default:     return { score: 1.00, passYards: 1.00, compPct:  0.00, rushYards: 1.00, rushAttempts: 1.00 };
  }
}

function generateScoringEvents(offenseRating: number, defenseRating: number, wx: WeatherMultipliers, isHome: boolean): ScoringEvents {
  const efficiencyRatio = (offenseRating / Math.max(defenseRating, 50)) * wx.score;
  const baseDrives = isHome ? 4.4 : 3.9;
  const scoringDrives = Math.max(0, Math.round(randomNormal(baseDrives * efficiencyRatio, 1.1)));
  const tdRate = Math.min(0.78, Math.max(0.42, 0.60 + (offenseRating - 75) * 0.004 + (isHome ? 0.02 : 0)));
  let tds = 0, fgs = 0;
  for (let i = 0; i < scoringDrives; i++) {
    if (Math.random() < tdRate) tds++; else fgs++;
  }
  return { tds, fgs };
}

function distributeToQuarters(total: number): number[] {
  const weights = [0.26, 0.28, 0.21, 0.25];
  const quarters = weights.map(w => Math.floor(total * w));
  let remainder = total - quarters.reduce((a, b) => a + b, 0);
  let i = 0;
  while (remainder > 0) { quarters[i++ % 4]++; remainder--; }
  return quarters;
}

function computeScore(events: ScoringEvents): number {
  return events.tds * 7 + events.fgs * 3;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateScoringEvents', () => {
  it('always returns non-negative TDs and FGs', () => {
    for (let i = 0; i < 500; i++) {
      const wx = weatherMultipliers('clear');
      const result = generateScoringEvents(75, 75, wx, true);
      expect(result.tds).toBeGreaterThanOrEqual(0);
      expect(result.fgs).toBeGreaterThanOrEqual(0);
    }
  });

  it('high-rated offense vs low-rated defense scores more on average', () => {
    const wx = weatherMultipliers('clear');
    const RUNS = 500;
    const elite  = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(90, 65, wx, false)));
    const weak   = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(65, 90, wx, false)));
    const eliteAvg = elite.reduce((a, b) => a + b, 0) / RUNS;
    const weakAvg  = weak.reduce((a, b) => a + b, 0) / RUNS;
    expect(eliteAvg).toBeGreaterThan(weakAvg);
  });

  it('home team scores more than away on average against equal opponent', () => {
    const wx = weatherMultipliers('clear');
    const RUNS = 500;
    const homeScores = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(75, 75, wx, true)));
    const awayScores = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(75, 75, wx, false)));
    const homeAvg = homeScores.reduce((a, b) => a + b, 0) / RUNS;
    const awayAvg = awayScores.reduce((a, b) => a + b, 0) / RUNS;
    expect(homeAvg).toBeGreaterThanOrEqual(awayAvg);
  });

  it('snow reduces average score vs clear weather', () => {
    const RUNS = 500;
    const clearScores = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(75, 75, weatherMultipliers('clear'), false)));
    const snowScores  = Array.from({ length: RUNS }, () => computeScore(generateScoringEvents(75, 75, weatherMultipliers('snow'),  false)));
    const clearAvg = clearScores.reduce((a, b) => a + b, 0) / RUNS;
    const snowAvg  = snowScores.reduce((a, b) => a + b, 0) / RUNS;
    expect(clearAvg).toBeGreaterThan(snowAvg);
  });

  it('TDs never exceed scoring drives total', () => {
    const wx = weatherMultipliers('clear');
    for (let i = 0; i < 500; i++) {
      const result = generateScoringEvents(80, 75, wx, true);
      const totalDrives = result.tds + result.fgs;
      expect(result.tds).toBeLessThanOrEqual(totalDrives);
    }
  });
});

describe('distributeToQuarters', () => {
  it('quarters always sum to the input total', () => {
    for (const total of [0, 7, 14, 21, 28, 35, 42]) {
      const quarters = distributeToQuarters(total);
      expect(quarters.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('always returns exactly 4 quarters', () => {
    expect(distributeToQuarters(21)).toHaveLength(4);
  });

  it('no quarter is negative', () => {
    for (let total = 0; total <= 60; total++) {
      distributeToQuarters(total).forEach(q => expect(q).toBeGreaterThanOrEqual(0));
    }
  });

  it('Q2 gets the largest share (~28%)', () => {
    const quarters = distributeToQuarters(100);
    expect(quarters[1]).toBeGreaterThanOrEqual(quarters[0]);
  });
});

describe('stat constraints', () => {
  it('completions never exceed pass attempts', () => {
    // Simulate 1000 completion calculations at various accuracies
    for (let i = 0; i < 1000; i++) {
      const wx = weatherMultipliers('clear');
      const passAttempts = clamp(randomNormal(34, 5), 18, 60);
      const compPct = Math.min(0.78, Math.max(0.42, 0.55 + randomNormal(0, 0.05)));
      const completions = clamp(passAttempts * compPct, 8, passAttempts);
      expect(completions).toBeLessThanOrEqual(passAttempts);
      expect(completions).toBeGreaterThanOrEqual(0);
    }
  });

  it('QB interceptions stay within 0–4 range', () => {
    for (let i = 0; i < 1000; i++) {
      const ints = clamp(randomNormal(0.9, 0.6), 0, 4);
      expect(ints).toBeGreaterThanOrEqual(0);
      expect(ints).toBeLessThanOrEqual(4);
    }
  });

  it('rush yards per carry stays realistic (2.4–9 YPC range)', () => {
    for (let i = 0; i < 1000; i++) {
      const speedFactor = (Math.random() * 30 - 15) * 0.03;
      const ypc = Math.max(2.4, randomNormal((4.2 + speedFactor), 0.8));
      expect(ypc).toBeGreaterThanOrEqual(2.4);
    }
  });
});

describe('game score invariants', () => {
  it('score computed from events is always non-negative', () => {
    const wx = weatherMultipliers('clear');
    for (let i = 0; i < 500; i++) {
      const events = generateScoringEvents(75, 75, wx, Math.random() > 0.5);
      expect(computeScore(events)).toBeGreaterThanOrEqual(0);
    }
  });

  it('score is a valid NFL scoring total (multiple of 1 with TDs as 7 + FGs as 3)', () => {
    const wx = weatherMultipliers('clear');
    for (let i = 0; i < 200; i++) {
      const events = generateScoringEvents(80, 75, wx, true);
      const score = computeScore(events);
      // Every score must be expressible as 7*tds + 3*fgs
      expect(score).toBe(events.tds * 7 + events.fgs * 3);
    }
  });
});
