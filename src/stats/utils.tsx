import React from 'react';
import { T } from '../theme';

export const TRAIT_META: Record<string, { color: string; label: string }> = {
  Normal:    { color: T.textDim,  label: '' },
  Star:      { color: '#4FC3F7',  label: 'Star' },
  Superstar: { color: '#FF8740',  label: 'Superstar' },
  'X-Factor':{ color: '#FFD700', label: 'X-Factor' },
};

export function ovrColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4FC3F7';
  if (r >= 70) return '#81C784';
  return T.textSecondary;
}

export const isQB   = (pos: string) => pos === 'QB';
export const isRB   = (pos: string) => ['RB', 'HB', 'FB'].includes(pos);
export const isWRTE = (pos: string) => ['WR', 'TE'].includes(pos);

export const tdBase: React.CSSProperties = {
  padding: '9px 10px', fontFamily: 'monospace', fontSize: 12,
};
export const thStyle: React.CSSProperties = {
  ...tdBase, color: T.borderStrong, fontSize: 10, letterSpacing: 1,
};

export function StatGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export function StatLine({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
      <span style={{ color: T.textMuted }}>{label}</span>
      <span style={{ color: color ?? T.textPrimary, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
