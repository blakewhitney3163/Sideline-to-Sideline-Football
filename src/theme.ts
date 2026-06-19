// Central color palette — import as: import { T } from './theme';
export const T = {
  // Backgrounds
  bgPage:   '#0f172a',   // slate-900 — deep navy
  bgPanel:  '#1e293b',   // slate-800 — card surface
  bgCard:   '#263548',   // slate-750 — slightly raised
  bgInput:  '#1a2535',   // input fields
  bgDeep:   '#0a1120',   // deepest recesses / sidebars

  // Borders
  borderFaint:  '#1e293b',   // barely visible separator
  borderMid:    '#334155',   // standard card border (slate-700)
  borderStrong: '#475569',   // emphasis border (slate-600)

  // Text
  textPrimary:   '#f1f5f9',   // slate-100 — headings / key values
  textSecondary: '#cbd5e1',   // slate-300 — body copy
  textMuted:     '#94a3b8',   // slate-400 — labels / secondary info
  textDim:       '#64748b',   // slate-500 — de-emphasized / placeholders

  // Accents
  gold:   '#fbbf24',   // amber-400
  green:  '#4ade80',   // green-400
  blue:   '#60a5fa',   // blue-400
  orange: '#fb923c',   // orange-400
  red:    '#f87171',   // red-400

  // Tinted backgrounds (dark, for badges / highlights)
  bgGreen:    '#052e16',   // very dark green
  bgBlue:     '#172554',   // very dark blue
  bgOrange:   '#431407',   // very dark orange
  bgGold:     '#3d2800',   // very dark amber
  bgRed:      '#450a0a',   // very dark red
  bgSelected: '#1e3a5f',   // selected row / active item
} as const;
