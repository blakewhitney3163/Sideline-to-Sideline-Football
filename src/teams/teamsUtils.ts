import { T } from '../theme';
import { Player, RatingCol } from './types';

export const POSITION_ORDER = [
  'QB', 'HB', 'FB',
  'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'IDL',
  'MLB', 'OLB', 'LOLB', 'ROLB', 'WILL', 'MIKE',
  'CB', 'FS', 'SS',
  'K',
];

export const OFF_POSITIONS = ['QB', 'RB', 'HB', 'FB', 'WR', 'TE'];
export const DEF_POSITIONS = ['DE', 'DT', 'DL', 'LE', 'RE', 'IDL', 'MLB', 'OLB', 'ILB', 'LOLB', 'ROLB', 'LB', 'WILL', 'MIKE', 'CB', 'FS', 'SS', 'S'];

export function getRatingCols(pos: string): RatingCol[] {
  if (pos === 'QB')
    return [{ label: 'SPD', key: 'speed' }, { label: 'ACC', key: 'throw_accuracy' }, { label: 'PWR', key: 'throw_power' }, { label: 'AWR', key: 'awareness' }];
  if (['RB', 'HB', 'FB'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'STR', key: 'strength' }, { label: 'CAT', key: 'catching' }, { label: 'AWR', key: 'awareness' }];
  if (['WR', 'TE'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'CAT', key: 'catching' }, { label: 'RTE', key: 'route_running' }, { label: 'AWR', key: 'awareness' }];
  if (['LT', 'LG', 'C', 'RG', 'RT'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'STR', key: 'strength' }, { label: 'AWR', key: 'awareness' }];
  if (['LE', 'RE', 'DT', 'IDL', 'DE'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'STR', key: 'strength' }, { label: 'PRSH', key: 'pass_rush' }, { label: 'AWR', key: 'awareness' }];
  if (['MLB', 'OLB', 'LB', 'LOLB', 'ROLB', 'WILL', 'MIKE', 'ILB'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'TKL', key: 'tackle_rating' }, { label: 'COV', key: 'coverage' }, { label: 'AWR', key: 'awareness' }];
  if (['CB', 'FS', 'SS', 'S'].includes(pos))
    return [{ label: 'SPD', key: 'speed' }, { label: 'COV', key: 'coverage' }, { label: 'TKL', key: 'tackle_rating' }, { label: 'AWR', key: 'awareness' }];
  if (pos === 'K')
    return [{ label: 'KPW', key: 'kick_power' }, { label: 'KAC', key: 'kick_accuracy' }, { label: 'AWR', key: 'awareness' }];
  return [{ label: 'SPD', key: 'speed' }, { label: 'STR', key: 'strength' }, { label: 'AWR', key: 'awareness' }];
}

export function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return T.textSecondary;
}

export function attrColor(v: number): string {
  if (v >= 90) return '#FFD700';
  if (v >= 80) return '#4FC3F7';
  if (v >= 70) return '#81C784';
  return T.textMuted;
}

export const CAREER_HEADERS: Record<string, string[]> = {
  QB:  ['Season', 'G', 'YDS', 'TD', 'INT', 'CMP%'],
  RB:  ['Season', 'G', 'YDS', 'TD', 'YPC', 'REC/REYDS'],
  WR:  ['Season', 'G', 'YDS', 'TD', 'REC/TGT', 'CTH%'],
  TE:  ['Season', 'G', 'YDS', 'TD', 'REC/TGT', 'CTH%'],
  DEF: ['Season', 'G', 'TOT TKL', 'SACKS', 'TFL', 'INT', 'PD'],
  K:   ['Season', 'G', 'FGM/FGA', 'FG%', 'XPM/XPA'],
};

export function getCareerHeaders(pos: string): string[] {
  if (DEF_POSITIONS.includes(pos)) return CAREER_HEADERS.DEF;
  return CAREER_HEADERS[pos] ?? ['Season', 'G', 'YDS', 'TD', 'REC', 'TGT'];
}

export function showStats(pos: string): boolean {
  return OFF_POSITIONS.includes(pos) || DEF_POSITIONS.includes(pos) || pos === 'K';
}

export function getAvailablePositions(players: Player[]): string[] {
  const posSet = new Set(players.map(p => p.position_label || p.position));
  return POSITION_ORDER.filter(p => posSet.has(p));
}
