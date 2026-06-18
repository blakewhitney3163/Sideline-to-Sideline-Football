import React from 'react';
import { T } from '../theme';
import { tdBase, thStyle } from './utils';

interface Props {
  rows: any[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
}

export default function TeamStatsTable({ rows, sortKey, sortDir, onSort }: Props) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const SortHdr = ({ k, label }: { k: string; label: string }) => (
    <th
      onClick={() => onSort(k)}
      style={{
        ...thStyle, textAlign: 'right', cursor: 'pointer',
        color: sortKey === k ? '#FF8740' : T.textDim, userSelect: 'none',
      }}
    >
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );

  if (rows.length === 0) {
    return (
      <div style={{ color: T.textMuted, padding: '24px 0', fontSize: 13 }}>
        No team stats yet — simulate some games first.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.borderFaint}` }}>
            <th style={{ ...thStyle, textAlign: 'left', width: 32 }}>#</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>W-L</th>
            <SortHdr k="ppg"      label="PPG" />
            <SortHdr k="papg"     label="PAPG" />
            <SortHdr k="ypg"      label="YPG" />
            <SortHdr k="to_diff"  label="TO DIFF" />
            <SortHdr k="to_given" label="GIVEAWAYS" />
            <SortHdr k="to_taken" label="TAKEAWAYS" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const diffColor = t.to_diff > 0 ? '#4caf50' : t.to_diff < 0 ? '#e57373' : T.textMuted;
            return (
              <tr key={t.id ?? i} style={{ borderBottom: `1px solid ${T.borderFaint}` }}>
                <td style={{ ...tdBase, color: T.textDim }}>{i + 1}</td>
                <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 600 }}>{t.city} {t.name}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textMuted }}>{t.wins}–{t.losses}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textPrimary }}>{t.ppg}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textMuted }}>{t.papg}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textMuted }}>{(t.ypg ?? 0).toLocaleString()}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: diffColor, fontWeight: 600 }}>{t.to_diff > 0 ? '+' : ''}{t.to_diff}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textMuted }}>{t.to_given}</td>
                <td style={{ ...tdBase, textAlign: 'right', color: T.textMuted }}>{t.to_taken}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
