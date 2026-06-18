import { RecordMode, RecordRow, StatCategory } from './types';

export const TRAIT_META: Record<string, { color: string; short: string }> = {
  Normal:     { color: '#444',    short: '' },
  Star:       { color: '#4FC3F7', short: 'S' },
  Superstar:  { color: '#FF8740', short: 'SS' },
  'X-Factor': { color: '#FFD700', short: 'XF' },
};

export function ratingColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4caf50';
  if (r >= 70) return '#FF8740';
  return '#888';
}

export const CATEGORIES: { id: StatCategory; label: string }[] = [
  { id: 'passing',   label: 'Passing' },
  { id: 'rushing',   label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'passTds',   label: 'Pass TDs' },
  { id: 'tds',       label: 'Skill TDs' },
  { id: 'tackles',   label: 'Tackles' },
  { id: 'sacks',     label: 'Sacks' },
  { id: 'defInts',   label: 'INTs / PDs' },
];

export type ColDef = { label: string; key: string; fmt?: (v: number) => string };

export function columns(cat: StatCategory): ColDef[] {
  const gCol: ColDef = { label: 'G', key: 'games_played' };
  switch (cat) {
    case 'passing':
      return [gCol, { label: 'YDS', key: 'pass_yards' }, { label: 'TD', key: 'pass_tds' },
        { label: 'INT', key: 'interceptions' }, { label: 'CMP', key: 'completions' }, { label: 'ATT', key: 'pass_attempts' }];
    case 'rushing':
      return [gCol, { label: 'YDS', key: 'rush_yards' }, { label: 'TD', key: 'rush_tds' },
        { label: 'ATT', key: 'rush_attempts' }, { label: 'YPC', key: '_ypc', fmt: (v) => v.toFixed(1) }];
    case 'receiving':
      return [gCol, { label: 'YDS', key: 'rec_yards' }, { label: 'TD', key: 'rec_tds' },
        { label: 'REC', key: 'receptions' }, { label: 'TGT', key: 'targets' }];
    case 'passTds':
      return [gCol, { label: 'PASS TD', key: 'pass_tds' }, { label: 'YDS', key: 'pass_yards' },
        { label: 'CMP', key: 'completions' }, { label: 'ATT', key: 'pass_attempts' }];
    case 'tds':
      return [gCol, { label: 'TOT TDs', key: '_skill_tds' }, { label: 'RUSH TD', key: 'rush_tds' },
        { label: 'REC TD', key: 'rec_tds' }];
    case 'tackles':
      return [gCol, { label: 'SOLO', key: 'tackles' }, { label: 'ASST', key: 'assisted_tackles' },
        { label: 'TOTAL', key: '_total_tkl' }, { label: 'TFL', key: 'tfl' }, { label: 'SACKS', key: 'sacks' }];
    case 'sacks':
      return [gCol, { label: 'SACKS', key: 'sacks' }, { label: 'TFL', key: 'tfl' },
        { label: 'FF', key: 'forced_fumbles' }, { label: 'SOLO TKL', key: 'tackles' }];
    case 'defInts':
      return [gCol, { label: 'INT', key: 'def_interceptions' }, { label: 'PD', key: 'pass_deflections' },
        { label: 'DEF TD', key: '_def_tds' }, { label: 'SOLO TKL', key: 'tackles' }];
  }
}

export function getValue(row: RecordRow, key: string): number {
  if (key === '_ypc')       return (row as any).rush_attempts > 0 ? (row as any).rush_yards / (row as any).rush_attempts : 0;
  if (key === '_skill_tds') return ((row as any).rush_tds || 0) + ((row as any).rec_tds || 0);
  if (key === '_total_tkl') return ((row as any).tackles || 0) + ((row as any).assisted_tackles || 0);
  if (key === '_def_tds')   return 0;
  return (row as any)[key] ?? 0;
}

export function hofKeyStat(e: HofEntry): string {
  switch (e.position) {
    case 'QB': return e.career_pass_yards >= 40000 ? `${e.career_pass_yards.toLocaleString()} pass yds` : `${e.career_pass_tds} pass TDs`;
    case 'RB': return e.career_rush_yards >= 10000 ? `${e.career_rush_yards.toLocaleString()} rush yds` : `${e.career_rush_tds} rush TDs`;
    case 'WR':
    case 'TE': return e.career_rec_yards >= 8000 ? `${e.career_rec_yards.toLocaleString()} rec yds`
                   : e.career_receptions >= 600   ? `${e.career_receptions} rec`
                   : `${e.career_rec_tds} rec TDs`;
    case 'DL':
    case 'LB': return e.career_sacks >= 80 ? `${e.career_sacks.toFixed(1)} sacks` : `${e.career_tackles} tackles`;
    case 'CB':
    case 'S':  return e.career_def_ints >= 25 ? `${e.career_def_ints} INTs` : `${e.career_pass_deflections} PDs`;
    default:   return `${e.career_games} games`;
  }
}

export function gridTemplate(cols: ColDef[], mode: RecordMode): string {
  const seasonCol = mode === 'season' ? ' 60px' : '';
  return `30px 1fr 50px 40px ${cols.map(() => '80px').join(' ')}${seasonCol}`;
}
