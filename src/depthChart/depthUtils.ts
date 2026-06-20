import { T } from '../theme';

export const POSITION_GROUPS = [
  'QB', 'RB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'DE', 'DT',
  'MLB', 'OLB', 'CB', 'FS', 'SS', 'K',
];

export const GROUP_LABELS: Record<string, string> = {
  QB:  'Quarterback',
  RB:  'Running Back',
  WR:  'Wide Receiver',
  TE:  'Tight End',
  LT:  'Left Tackle',
  LG:  'Left Guard',
  C:   'Center',
  RG:  'Right Guard',
  RT:  'Right Tackle',
  DE:  'Defensive End',
  DT:  'Defensive Tackle',
  MLB: 'Middle Linebacker',
  OLB: 'Outside Linebacker',
  CB:  'Cornerback',
  FS:  'Free Safety',
  SS:  'Strong Safety',
  K:   'Kicker',
};

export const TRAIT_META: Record<string, { color: string; short: string }> = {
  Normal:    { color: T.textDim,    short: '' },
  Star:      { color: '#4FC3F7',    short: 'S' },
  Superstar: { color: '#FF8740',    short: 'SS' },
  'X-Factor':{ color: '#FFD700',    short: 'XF' },
};

export function ovrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return T.textSecondary;
}

export function injuryMeta(status: string): { label: string; color: string; bg: string } | null {
  if (status === 'ir')           return { label: 'IR',  color: '#e57373', bg: T.bgRed };
  if (status === 'out')          return { label: 'OUT', color: '#FF8740', bg: T.bgOrange };
  if (status === 'questionable') return { label: 'Q',   color: '#FFD700', bg: T.bgGold };
  return null;
}
