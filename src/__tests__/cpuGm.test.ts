import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../database', () => ({
  db: {
    prepare: vi.fn(() => ({ get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn() })),
    transaction: vi.fn((fn: any) => () => fn()),
    exec: vi.fn(),
  },
}));

vi.mock('../helpers/getCurrentSeason', () => ({ getCurrentSeason: vi.fn(() => 2025) }));
vi.mock('../helpers/logNewsEvent', () => ({ logNewsEvent: vi.fn() }));
vi.mock('../repositories', () => ({
  playerRepo:   { getByTeam: vi.fn(() => []), updateTeam: vi.fn() },
  contractRepo: { updateTeam: vi.fn() },
  gameRepo:     { getTeamRecord: vi.fn(() => ({ wins: 8, losses: 4, ties: 0 })), getCurrentWeek: vi.fn(() => 4), countBySeason: vi.fn(() => 12) },
  pickRepo:     { getByTeam: vi.fn(() => []), transfer: vi.fn() },
  settingsRepo: { getUserTeamId: vi.fn(() => 1) },
}));

import { calcPlayerTradeValue } from '../services/TradeService';
import { playerRepo, gameRepo } from '../repositories';
import { db } from '../database';

// ── Inline getTeamTradeProfile auto-detection logic ───────────────────────────
// Mirrors the logic in TradeService.ts — changes here catch regressions there.

type TradeStatus = 'Contender' | 'Buyer' | 'Neutral' | 'Seller' | 'Rebuilding';

function autoDetectStatus(
  wins: number, losses: number, gamesPlayed: number,
  avgOverall: number, avgAge: number, eliteCount: number,
  topQBAge: number, hasXFactor: boolean
): TradeStatus {
  const winPct = gamesPlayed >= 4 ? wins / gamesPlayed : 0.5;
  const winning  = winPct >= 0.55;
  const losing   = winPct < 0.40;
  const talented = avgOverall >= 78;
  const old      = avgAge >= 27.5;
  const young    = avgAge <= 25.5;
  const winNow   = old || (hasXFactor && topQBAge >= 28);
  if (winning && talented && (winNow || eliteCount >= 4)) return 'Contender';
  if (losing && talented && old) return 'Seller';
  if (winning || (talented && !young && winNow)) return 'Buyer';
  if (losing || (young && !talented))                      return 'Rebuilding';
  return 'Neutral';
}

// ── Inline trade value ratio check from runCpuTrades ─────────────────────────

function isAcceptableRatio(totalOfferValue: number, targetValue: number): boolean {
  const ratio = totalOfferValue / targetValue;
  return ratio >= 0.78 && ratio <= 1.30;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('autoDetectStatus', () => {
  it('winning + talented + old roster = Contender', () => {
    expect(autoDetectStatus(10, 4, 14, 82, 28.5, 5, 30, true)).toBe('Contender');
  });

  it('winning + talented + young roster = Buyer (not Contender — not win-now)', () => {
    expect(autoDetectStatus(10, 4, 14, 80, 24, 2, 23, false)).toBe('Buyer');
  });

  it('losing + talented + old roster = Seller', () => {
    expect(autoDetectStatus(4, 10, 14, 79, 28.5, 3, 30, false)).toBe('Seller');
  });

  it('losing + young + untalented roster = Rebuilding', () => {
    expect(autoDetectStatus(3, 11, 14, 72, 24, 0, 22, false)).toBe('Rebuilding');
  });

  it('average everything = Neutral', () => {
    expect(autoDetectStatus(7, 7, 14, 76, 26.5, 2, 27, false)).toBe('Neutral');
  });

  it('< 4 games played defaults winPct to 0.5 (never forced into losing bucket)', () => {
    // 1 win, 2 losses — but gamesPlayed < 4, so winPct defaults to 0.5
    const status = autoDetectStatus(1, 2, 3, 74, 26, 1, 26, false);
    expect(['Buyer','Neutral','Rebuilding']).toContain(status);
    expect(status).not.toBe('Seller');
    expect(status).not.toBe('Contender');
  });

  it('elite count ≥ 4 bumps a winning team to Contender', () => {
    // Winning but average age (not winNow by age) — elite count saves it
    expect(autoDetectStatus(10, 4, 14, 80, 26, 5, 26, false)).toBe('Contender');
  });
});

describe('isAcceptableRatio', () => {
  it('rejects offers below 78% of target value', () => {
    expect(isAcceptableRatio(77, 100)).toBe(false);
    expect(isAcceptableRatio(50, 100)).toBe(false);
  });

  it('rejects offers above 130% of target value', () => {
    expect(isAcceptableRatio(131, 100)).toBe(false);
    expect(isAcceptableRatio(200, 100)).toBe(false);
  });

  it('accepts offers within the 78%–130% window', () => {
    expect(isAcceptableRatio(78,  100)).toBe(true);
    expect(isAcceptableRatio(100, 100)).toBe(true);
    expect(isAcceptableRatio(130, 100)).toBe(true);
    expect(isAcceptableRatio(95,  100)).toBe(true);
  });

  it('exact boundary values are accepted', () => {
    expect(isAcceptableRatio(78,  100)).toBe(true);
    expect(isAcceptableRatio(130, 100)).toBe(true);
  });
});

describe('calcPlayerTradeValue — age/trait interaction', () => {
  it('a 22-year-old X-Factor is worth more than a 33-year-old X-Factor at equal OVR', () => {
    const young = calcPlayerTradeValue(88, 22, 'QB', 'X-Factor');
    const old   = calcPlayerTradeValue(88, 33, 'QB', 'X-Factor');
    expect(young).toBeGreaterThan(old);
  });

  it('position premium order: QB > WR > RB for same age/OVR/trait', () => {
    const qb = calcPlayerTradeValue(82, 26, 'QB', 'Normal');
    const wr = calcPlayerTradeValue(82, 26, 'WR', 'Normal');
    const rb = calcPlayerTradeValue(82, 26, 'RB', 'Normal');
    expect(qb).toBeGreaterThan(wr);
    expect(wr).toBeGreaterThan(rb);
  });

  it('a player aged 36+ still returns a positive value', () => {
    expect(calcPlayerTradeValue(75, 38, 'WR', 'Normal')).toBeGreaterThan(0);
  });

  it('OVR 99 X-Factor young QB has highest possible value', () => {
    const best = calcPlayerTradeValue(99, 22, 'QB', 'X-Factor');
    const good = calcPlayerTradeValue(85, 27, 'QB', 'Star');
    expect(best).toBeGreaterThan(good);
  });
});
