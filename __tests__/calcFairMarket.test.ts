import { describe, it, expect, vi } from 'vitest';

vi.mock('../database', () => ({
  db: {
    prepare: vi.fn(() => ({ get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) })),
    transaction: vi.fn((fn: any) => () => fn()),
    exec: vi.fn(),
  },
}));
vi.mock('../repositories', () => ({
  playerRepo: { getById: vi.fn(), getActiveCount: vi.fn(() => 50), getByTeam: vi.fn(() => []), activate: vi.fn(), updateTeam: vi.fn() },
  contractRepo: { create: vi.fn(), updateTeam: vi.fn() },
  gameRepo: { getWinRecord: vi.fn(() => ({ wins: 6, played: 10 })), getCurrentWeek: vi.fn(() => 5), countBySeason: vi.fn(() => 10) },
  pickRepo: { getById: vi.fn(), getByTeam: vi.fn(() => []), transfer: vi.fn() },
}));
vi.mock('../helpers/getCurrentSeason', () => ({ getCurrentSeason: vi.fn(() => 2024) }));
vi.mock('../helpers/logNewsEvent', () => ({ logNewsEvent: vi.fn() }));

import { calcFairMarket } from '../services/ContractService';

describe('calcFairMarket', () => {
  it('returns higher salary for higher OVR at same position', () => {
    const low  = calcFairMarket(72, 'QB', 'Normal');
    const high = calcFairMarket(90, 'QB', 'Normal');
    expect(high).toBeGreaterThan(low);
  });

  it('X-Factor earns more than Normal at same OVR and position', () => {
    const normal  = calcFairMarket(85, 'WR', 'Normal');
    const xFactor = calcFairMarket(85, 'WR', 'X-Factor');
    expect(xFactor).toBeGreaterThan(normal);
  });

  it('QB market rate exceeds RB at same OVR and dev trait', () => {
    const qb = calcFairMarket(82, 'QB', 'Normal');
    const rb = calcFairMarket(82, 'RB', 'Normal');
    expect(qb).toBeGreaterThan(rb);
  });

  it('returns a positive number for any valid input', () => {
    expect(calcFairMarket(70, 'K',  'Normal')).toBeGreaterThan(0);
    expect(calcFairMarket(99, 'QB', 'X-Factor')).toBeGreaterThan(0);
  });

  it('falls back gracefully for an unknown position', () => {
    expect(() => calcFairMarket(80, 'UNKNOWN', 'Normal')).not.toThrow();
  });

  it('Superstar multiplier is between Normal and X-Factor', () => {
    const normal     = calcFairMarket(85, 'QB', 'Normal');
    const superstar  = calcFairMarket(85, 'QB', 'Superstar');
    const xFactor    = calcFairMarket(85, 'QB', 'X-Factor');
    expect(superstar).toBeGreaterThan(normal);
    expect(xFactor).toBeGreaterThan(superstar);
  });
});
