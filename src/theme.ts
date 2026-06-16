// Central color palette — import as: import { T } from './theme';
export const T = {
  // Backgrounds
  bgPage:   '#222',       // main app background
  bgPanel:  '#2c2c2c',   // panels, lists
  bgCard:   '#363636',   // cards, rows, elevated
  bgInput:  '#282828',   // inputs, selects
  bgDeep:   '#1a1a1a',   // deepest shadow elements

  // Borders
  borderFaint:  '#383838',
  borderMid:    '#464646',
  borderStrong: '#555',

  // Text
  textPrimary:   '#e0e0e0',
  textSecondary: '#aaa',
  textMuted:     '#888',
  textDim:       '#555',

  // Accents (unchanged)
  gold:   '#FFD700',
  green:  '#4caf50',
  blue:   '#4FC3F7',
  orange: '#FF8740',
  red:    '#e57373',

  // Tinted backgrounds
  bgGreen:    '#152515',
  bgBlue:     '#0a1f35',
  bgOrange:   '#251800',
  bgGold:     '#2a2500',
  bgRed:      '#2a1010',
  bgSelected: '#0a0e18',
} as const;