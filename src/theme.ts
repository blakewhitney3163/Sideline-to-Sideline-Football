// Central color palette — import as: import { T } from './theme';
export const T = {
  // Backgrounds
  bgPage:   '#1a2d45',   // main navy background
  bgPanel:  '#213754',   // panels, lists
  bgCard:   '#2a4268',   // cards, rows, elevated
  bgInput:  '#1e3250',   // inputs, selects
  bgDeep:   '#14243a',   // darkest elements

  // Borders
  borderFaint:  '#2d4a6a',
  borderMid:    '#3a5a80',
  borderStrong: '#4a6a90',

  // Text
  textPrimary:   '#dce8f8',  // light blue-white
  textSecondary: '#8aaac8',
  textMuted:     '#5a7a9a',
  textDim:       '#3a5a7a',

  // Accents (unchanged)
  gold:   '#FFD700',
  green:  '#4caf50',
  blue:   '#4FC3F7',
  orange: '#FF8740',
  red:    '#e57373',

  // Tinted backgrounds
  bgGreen:    '#1a3525',
  bgBlue:     '#152d50',
  bgOrange:   '#3a2510',
  bgGold:     '#352e0a',
  bgRed:      '#3a1515',
  bgSelected: '#1a3055',
} as const;