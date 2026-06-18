import React from 'react';
import { RecordMode, RecordRow } from './types';
import { ColDef, TRAIT_META, ratingColor, getValue, gridTemplate } from './recordsUtils';

interface Props {
  rows: RecordRow[];
  cols: ColDef[];
  mode: RecordMode;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  loading: boolean;
}

export default function LeaderboardTable({ rows, cols, mode, sortKey, sortDir, onSort, loading }: Props) {
  if (loading) return (
    <div style={{ color: '#555', fontSize: 13, padding: '24px 0' }}>Loading records…</div>
  );

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = getValue(a, sortKey);
        const bv = getValue(b, sortKey);
        return sortDir === 'desc' ? bv - av : av - bv;
      })
    : rows;

  const gt = gridTemplate(cols, mode);

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: gt, gap: 4,
        padding: '6px 10px', fontSize: 9, color: '#333', letterSpacing: 1,
        borderBottom: '1px solid #222', marginBottom: 2,
      }}>
        <span>#</span>
        <span>PLAYER</span>
        <span>POS</span>
        <span>OVR</span>
        {cols.map(c => (
          <span key={c.key} onClick={() => onSort(c.key)}
            style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === c.key ? '#4FC3F7' : '#333' }}>
            {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
          </span>
        ))}
        {mode === 'season' && <span>SEASON</span>}
      </div>

      {rows.length === 0 ? (
        <div style={{ color: '#555', fontSize: 13, padding: '24px 0' }}>
          No records yet — simulate some games first.
        </div>
      ) : (
        sortedRows.map((row, idx) => {
          const isHist = !!row.is_historical;
          const trait = !isHist ? (TRAIT_META[row.dev_trait] ?? TRAIT_META['Normal']) : null;
          return (
            <div key={`${row.player_id}-${row.season ?? 'career'}`} style={{
              display: 'grid', gridTemplateColumns: gt, gap: 4, alignItems: 'center',
              padding: '7px 10px', marginBottom: 2, borderRadius: 4, fontSize: 12,
              background: isHist ? '#1a1500' : '#111',
              border: `1px solid ${isHist ? '#3a3000' : '#1a1a1a'}`,
            }}>
              <span style={{ color: isHist ? '#FFD700' : '#444', fontSize: isHist ? 14 : 12 }}>
                {isHist ? '🏆' : idx + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    color: isHist ? '#FFD700' : '#ddd', fontWeight: 600, fontSize: 13,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {row.player_name}
                  </span>
                  {isHist && (
                    <span style={{ color: '#FFD700', fontSize: 8, fontWeight: 700, background: '#2a2000', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                      NFL RECORD
                    </span>
                  )}
                  {!isHist && trait?.short && (
                    <span style={{ color: trait.color, fontSize: 9, fontWeight: 700, background: '#1a1a1a', padding: '1px 4px', borderRadius: 3 }}>
                      {trait.short}
                    </span>
                  )}
                </div>
                <div style={{ color: '#555', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.team_name}
                </div>
              </div>
              <span style={{ color: '#666', fontSize: 11 }}>{row.position}</span>
              <span style={{ color: isHist ? '#555' : ratingColor(row.overall_rating), fontWeight: 700, fontSize: 12 }}>
                {isHist ? '—' : row.overall_rating}
              </span>
              {cols.map(col => {
                const val = getValue(row, col.key);
                const formatted = col.fmt ? col.fmt(val) : (isHist && val === 0 ? '—' : val.toLocaleString());
                const isMainStat = col === cols[1];
                return (
                  <span key={col.key} style={{
                    color: isMainStat ? (isHist ? '#FFD700' : '#fff') : '#aaa',
                    fontWeight: isMainStat ? 700 : 400,
                    fontSize: isMainStat ? 13 : 12,
                  }}>
                    {formatted}
                  </span>
                );
              })}
              {mode === 'season' && <span style={{ color: '#555', fontSize: 11 }}>{row.season}</span>}
            </div>
          );
        })
      )}

      <div style={{ color: '#444', fontSize: 11, marginTop: 8 }}>
        {sortedRows.filter(r => !r.is_historical).length} in-game player{sortedRows.filter(r => !r.is_historical).length !== 1 ? 's' : ''} ·{' '}
        {mode === 'alltime' ? 'career totals' : 'single-season bests'} · gold rows are real NFL benchmarks
      </div>
    </>
  );
}
