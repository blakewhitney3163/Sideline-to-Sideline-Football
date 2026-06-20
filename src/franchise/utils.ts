export const POSITIONS = [
  'ALL', 'QB', 'RB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'DE', 'DT',
  'MLB', 'OLB', 'CB', 'FS', 'SS', 'K',
];

export const TRAIT_META: Record<string, { color: string; short: string; bg: string }> = {
  Normal:    { color: '#444',    short: '',   bg: 'transparent' },
  Star:      { color: '#4FC3F7', short: 'S',  bg: '#2d3f5a' },
  Superstar: { color: '#FF8740', short: 'SS', bg: '#4a3020' },
  'X-Factor':{ color: '#FFD700', short: 'XF', bg: '#4a4020' },
};

export const MARKET_RATES: Record<string, [number, number][]> = {
  QB: [[99,65],[93,50],[88,35],[83,20],[78,10],[73,4],[70,1.5]],
  WR: [[99,45],[93,35],[88,25],[83,16],[78,8],[73,3],[70,1.5]],
  DL: [[99,38],[93,30],[88,22],[83,14],[78,7],[73,3],[70,1.5]],
  CB: [[99,32],[93,25],[88,18],[83,11],[78,5],[73,2.5],[70,1.5]],
  OL: [[99,36],[93,30],[88,24],[83,18],[78,9],[73,3],[70,1.5]],
  LB: [[99,26],[93,20],[88,15],[83,9],[78,4.5],[73,2],[70,1.5]],
  TE: [[99,24],[93,19],[88,14],[83,8],[78,4],[73,2],[70,1.5]],
  S:  [[99,22],[93,17],[88,12],[83,7],[78,3.5],[73,1.8],[70,1.5]],
  RB: [[99,18],[93,14],[88,10],[83,6],[78,3],[73,1.5],[70,1.2]],
  K:  [[99,8],[93,6],[88,5],[83,4],[78,3],[73,2],[70,1]],
};

const TRAIT_MUL: Record<string, number> = {
  Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45,
};

export function ratingColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4caf50';
  if (r >= 70) return '#FF8740';
  return '#888';
}

export function trajectory(age: number): { label: string; color: string } {
  if (age <= 26) return { label: '↑', color: '#4caf50' };
  if (age <= 30) return { label: '→', color: '#FF8740' };
  return { label: '↓', color: '#777' };
}

export function fmtSalary(m: number): string {
  return `$${m.toFixed(1)}M`;
}

export function interpolateMarket(pos: string, ovr: number): number {
  // Map granular positions to market rate group
  const posGroup: Record<string, string> = {
    LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
    DE: 'DL', DT: 'DL',
    MLB: 'LB', OLB: 'LB',
  };
  const rates = MARKET_RATES[posGroup[pos] ?? pos] ?? MARKET_RATES['LB'];
  let base = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal] = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      base = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  return base;
}

export function fairMarketValue(pos: string, ovr: number, devTrait = 'Normal'): number {
  return Math.round(interpolateMarket(pos, ovr) * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

export function askingPrice(pos: string, ovr: number, devTrait: string, age: number): number {
  const mv = fairMarketValue(pos, ovr, devTrait);
  // Slight premium for young players, modest discount for veterans
  const ageMul = age <= 26 ? 1.04 : age <= 30 ? 1.00 : 0.92;
  return Math.round(mv * ageMul * 10) / 10;
}

export function contractGrade(
  salary: number, pos: string, ovr: number, devTrait = 'Normal',
): { label: string; color: string } | null {
  if (devTrait === 'X-Factor' || devTrait === 'Superstar') return null;
  const fairValue = interpolateMarket(pos, ovr);
  const ratio = salary / Math.max(fairValue, 1);
  if (ratio < 0.70) return { label: 'TEAM DEAL', color: '#4caf50' };
  if (ratio > 2.00) return { label: 'OVERPAID',  color: '#e57373' };
  return null;
}
