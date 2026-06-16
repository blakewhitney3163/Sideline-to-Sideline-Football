// Central color palette — import as: import { T } from './theme';
export const T = {
  // Backgrounds
  bgPage:   '#383838',    // main app background
  bgPanel:  '#444',       // panels, lists
  bgCard:   '#505050',    // cards, rows, elevated
  bgInput:  '#3e3e3e',    // inputs, selects
  bgDeep:   '#2c2c2c',    // deepest shadow elements

  // Borders
  borderFaint:  '#525252',
  borderMid:    '#606060',
  borderStrong: '#707070',

  // Text
  textPrimary:   '#efefef',
  textSecondary: '#bbb',
  textMuted:     '#999',
  textDim:       '#6a6a6a',

  // Accents (unchanged)
  gold:   '#FFD700',
  green:  '#4caf50',
  blue:   '#4FC3F7',
  orange: '#FF8740',
  red:    '#e57373',

  // Tinted backgrounds
  bgGreen:    '#1e3020',
  bgBlue:     '#122540',
  bgOrange:   '#302015',
  bgGold:     '#302a10',
  bgRed:      '#352015',
  bgSelected: '#162030',
} as const;