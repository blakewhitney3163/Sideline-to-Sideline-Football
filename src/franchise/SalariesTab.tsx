import React, { useState } from 'react';
import { Contract, CapSummary } from './types';
import { POSITIONS, TRAIT_META, ratingColor, fmtSalary, fairMarketValue } from './utils';

interface Props {
  contracts: Contract[];
  cap: CapSummary | null;
  currentSeason?: number;
}

type SortKey = 'salary' | 'years' | 'ovr' | 'age' | 'gtd';
type View = 'players' | 'schedule';

const POS_GROUPS: Record<string, string[]> = {
  QB:  ['QB'],
  RB:  ['RB'],
  WR:  ['WR'],
  TE:  ['TE'],
  OL:  ['OL', 'LT', 'LG', 'C', 'RG', 'RT'],
  DL:  ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL'],
  LB:  ['LB', 'MLB', 'OLB', 'LOLB', 'ROLB', 'MIKE', 'WILL'],
  CB:  ['CB'],
  S:   ['S', 'FS', 'SS'],
  K:   ['K'],
};

const GROUP_COLOR: Record<string, string> = {
  QB: '#FF8740', RB: '#f9a825', WR: '#7986cb', TE: '#4db6ac',
  OL: '#81c784', DL: '#e57373', LB: '#ff8a65', CB: '#ba68c8', S: '#4fc3f7', K: '#90a4ae',
};

function getPosGroup(pos: string): string {
  for (const [group, positions] of Object.entries(POS_GROUPS)) {
    if (positions.includes(pos)) return group;
  }
  return pos;
}

export default function SalariesTab({ contracts, cap, currentSeason }: Props) {
  const [view, setView] = useState<View>('players');
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('salary');
  const [search, setSearch] = useState('');
  const [expandedYear, setExpandedYear] = useState<number | null>(1);

  const capPct = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capBarColor = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';

  const filtered = contracts
    .filter(c => posFilter === 'ALL' || c.position === posFilter || c.position_label === posFilter)
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'salary') return b.annual_salary - a.annual_salary;
      if (sortBy === 'years') return b.years_remaining - a.years_remaining;
      if (sortBy === 'ovr') return b.overall_rating - a.overall_rating;
      if (sortBy === 'age') return a.age - b.age;
      if (sortBy === 'gtd') return (b.guaranteed_amount ?? 0) - (a.guaranteed_amount ?? 0);
      return 0;
    });

  const totalShown = filtered.reduce((s, c) => s + c.annual_salary, 0);
  const totalGuaranteed = filtered.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);
  const maxYears = contracts.length > 0 ? Math.max(...contracts.map(c => c.years_remaining)) : 0;
  const totalCap = cap?.total_cap ?? 279.2;

  const scheduleYears = Array.from({ length: maxYears }, (_, i) => {
    const yr = i + 1;
    const active = contracts.filter(c => c.years_remaining >= yr);
    const expiring = contracts.filter(c => c.years_remaining === yr);
    const totalHit = active.reduce((s, c) => s + c.annual_salary, 0);
    const available = totalCap - totalHit;
    const byGroup: Record<string, { count: number; hit: number }> = {};
    for (const c of active) {
      const g = getPosGroup(c.position_label || c.position);
      if (!byGroup[g]) byGroup[g] = { count: 0, hit: 0 };
      byGroup[g].count++;
      byGroup[g].hit += c.annual_salary;
    }
    return { yr, active, expiring, totalHit, available, byGroup };
  });

  return (
    <>
      {cap && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#0d1b0d', border: '1px solid #1a2a1a', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#555', letterSpacing: 1 }}>SALARY CAP · {currentSeason ?? 'CURRENT'} SEASON</span>
            <span style={{ fontSize: 11, color: capBarColor, fontWeight: 700 }}>
              {fmtSalary(cap.used_cap)} / {fmtSalary(cap.total_cap)}
              <span style={{ color: '#555', fontWeight: 400, marginLeft: 8 }}>
                ({cap.available_cap >= 0 ? fmtSalary(cap.available_cap) + ' available' : 'OVER by ' + fmtSalary(Math.abs(cap.available_cap))})
              </span>
            </span>
          </div>
          <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(capPct, 100)}%`, height: '100%', background: capBarColor, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['players', 'schedule'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '5px 16px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 4,
            background: view === v ? '#FF8740' : '#111',
            border: `1px solid ${view === v ? '#FF8740' : '#222'}`,
            color: view === v ? '#000' : '#555',
            fontWeight: view === v ? 'bold' : 'normal',
            textTransform: 'uppercase',
          }}>
            {v === 'players' ? 'Players' : 'Cap Schedule'}
          </button>
        ))}
      </div>

      {view === 'players' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {POSITIONS.map(pos => (
              <button key={pos} onClick={() => setPosFilter(pos)} style={{
                padding: '3px 9px', background: posFilter === pos ? '#FF8740' : '#141414',
                border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`, borderRadius: 3,
                color: posFilter === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
                fontWeight: posFilter === pos ? 'bold' : 'normal',
              }}>{pos}</button>
            ))}
            <select onChange={e => setSortBy(e.target.value as SortKey)} value={sortBy} style={{
              background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
              color: '#ccc', padding: '4px 10px', fontSize: 12, marginLeft: 'auto',
            }}>
              <option value="salary">Sort: Salary</option>
              <option value="gtd">Sort: Guaranteed</option>
              <option value="years">Sort: Years Left</option>
              <option value="ovr">Sort: OVR</option>
              <option value="age">Sort: Age</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player..."
              style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5, color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 50px 40px 90px 90px 80px 70px', padding: '4px 10px', fontSize: 10, color: '#444', letterSpacing: 1, borderBottom: '1px solid #1a1a1a' }}>
            <span>PLAYER</span><span style={{ textAlign: 'center' }}>POS</span><span style={{ textAlign: 'center' }}>OVR</span>
            <span style={{ textAlign: 'center' }}>AGE</span><span style={{ textAlign: 'right' }}>SALARY/YR</span>
            <span style={{ textAlign: 'right' }}>GUARANTEED</span><span style={{ textAlign: 'center' }}>YEARS</span>
            <span style={{ textAlign: 'right' }}>VALUE</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: '#333', fontSize: 12, padding: '20px 10px', textAlign: 'center' }}>No contracts found</div>
          ) : filtered.map(c => {
            const trait = TRAIT_META[c.dev_trait] ?? TRAIT_META['Normal'];
            const fmv = fairMarketValue(c.position, c.overall_rating, c.dev_trait);
            const ratio = c.annual_salary / Math.max(fmv, 1);
            const valueColor = ratio < 0.70 ? '#4caf50' : ratio > 2.00 ? '#e57373' : '#888';
            const valueLabel = ratio < 0.70 ? 'DEAL' : ratio > 2.00 ? 'OVER' : 'FAIR';
            const isExpiring = c.years_remaining === 1;
            const gtdPct = c.guaranteed_pct ?? 0;
            const isRookie = (c as any).is_rookie_deal === 1;
            const hasFifthOption = (c as any).fifth_year_option_eligible === 1;

            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 60px 50px 40px 90px 90px 80px 70px',
                padding: '6px 10px', borderBottom: '1px solid #111',
                background: isExpiring ? '#140a00' : 'transparent', alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ color: '#ddd', fontSize: 12, fontWeight: 600 }}>{c.first_name} {c.last_name}</span>
                    {trait.short && <span style={{ background: trait.bg, color: trait.color, fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                    {isRookie && <span style={{ background: '#4FC3F722', color: '#4FC3F7', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>ROOKIE</span>}
                    {hasFifthOption && <span style={{ background: '#66BB6A22', color: '#66BB6A', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>5th Opt</span>}
                    {isExpiring && <span style={{ color: '#FF8740', fontSize: 9, fontWeight: 700 }}>⚠ EXP</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', color: '#666', fontSize: 11 }}>{c.position_label || c.position}</div>
                <div style={{ textAlign: 'center', color: ratingColor(c.overall_rating), fontSize: 13, fontWeight: 700 }}>{c.overall_rating}</div>
                <div style={{ textAlign: 'center', color: '#777', fontSize: 11 }}>{c.age}</div>
                <div style={{ textAlign: 'right', color: '#ccc', fontSize: 12, fontWeight: 600 }}>{fmtSalary(c.annual_salary)}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: gtdPct >= 60 ? '#4caf50' : gtdPct >= 35 ? '#FF8740' : '#555', fontSize: 12 }}>{fmtSalary(c.guaranteed_amount ?? 0)}</div>
                  {gtdPct > 0 && <div style={{ color: '#444', fontSize: 10 }}>{gtdPct.toFixed(0)}% GTD</div>}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginBottom: 2 }}>
                    {Array.from({ length: Math.min(c.years_total, 7) }).map((_, i) => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: 1, background: i < c.years_remaining ? '#4caf50' : '#1a1a1a', border: '1px solid #2a2a2a' }} />
                    ))}
                  </div>
                  <div style={{ color: isExpiring ? '#FF8740' : '#555', fontSize: 10 }}>{c.years_remaining}/{c.years_total}yr</div>
                </div>
                <div style={{ textAlign: 'right', color: valueColor, fontSize: 11, fontWeight: 700 }}>{valueLabel}</div>
              </div>
            );
          })}

          {filtered.length > 0 && (
            <div style={{ padding: '8px 10px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: 24, fontSize: 11, color: '#444', marginTop: 4 }}>
              <span>{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
              <span>Total: <span style={{ color: '#ccc' }}>{fmtSalary(totalShown)}</span></span>
              <span>Guaranteed: <span style={{ color: '#FF8740' }}>{fmtSalary(totalGuaranteed)}</span></span>
            </div>
          )}
        </>
      )}

      {view === 'schedule' && (
        <div>
          {scheduleYears.length === 0 ? (
            <div style={{ color: '#333', fontSize: 13, padding: '20px 10px', textAlign: 'center' }}>No contracts on books</div>
          ) : scheduleYears.map(({ yr, active, expiring, totalHit, available, byGroup }) => {
            const hitPct = (totalHit / totalCap) * 100;
            const barColor = hitPct > 100 ? '#e57373' : hitPct > 90 ? '#FF8740' : '#4caf50';
            const isExpanded = expandedYear === yr;
            const seasonLabel = currentSeason ? currentSeason + yr - 1 : `Year ${yr}`;
            return (
              <div key={yr} style={{ marginBottom: 8, border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
                <div onClick={() => setExpandedYear(isExpanded ? null : yr)}
                  style={{ padding: '12px 14px', background: '#111', cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ color: '#FF8740', fontSize: 12, fontWeight: 700, letterSpacing: 1, minWidth: 80 }}>{seasonLabel}</span>
                    <span style={{ color: '#ccc', fontSize: 14, fontWeight: 700 }}>{fmtSalary(totalHit)}</span>
                    <span style={{ color: barColor, fontSize: 11 }}>{hitPct.toFixed(1)}% of cap</span>
                    <span style={{ color: available >= 0 ? '#4caf50' : '#e57373', fontSize: 11, marginLeft: 'auto' }}>
                      {available >= 0 ? `${fmtSalary(available)} available` : `⚠ OVER by ${fmtSalary(Math.abs(available))}`}
                    </span>
                    <span style={{ color: '#333', fontSize: 11 }}>{active.length} players</span>
                    <span style={{ color: '#444', fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${Math.min(hitPct, 100)}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                    {Object.entries(byGroup).sort((a, b) => b[1].hit - a[1].hit).map(([group, { hit }]) => (
                      <div key={group} title={`${group}: ${fmtSalary(hit)}`}
                        style={{ flex: hit, background: GROUP_COLOR[group] ?? '#555', minWidth: 2 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                    {Object.entries(byGroup).sort((a, b) => b[1].hit - a[1].hit).map(([group, { hit }]) => (
                      <span key={group} style={{ fontSize: 10, color: GROUP_COLOR[group] ?? '#555' }}>{group} {fmtSalary(hit)}</span>
                    ))}
                  </div>
                  {expiring.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#FF8740' }}>
                      ⚠ {expiring.length} expiring: {expiring.map(p => `${p.first_name} ${p.last_name}`).join(', ')}
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div style={{ background: '#0d0d0d', borderTop: '1px solid #1a1a1a' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 50px 80px 60px', padding: '4px 14px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #141414' }}>
                      <span>PLAYER</span><span style={{ textAlign: 'center' }}>POS</span><span style={{ textAlign: 'center' }}>OVR</span><span style={{ textAlign: 'right' }}>SALARY</span><span style={{ textAlign: 'center' }}>YRS LEFT</span>
                    </div>
                    {active.slice().sort((a, b) => b.annual_salary - a.annual_salary).map(c => {
                      const isLastYear = c.years_remaining === yr;
                      const trait = TRAIT_META[c.dev_trait] ?? TRAIT_META['Normal'];
                      return (
                        <div key={c.id} style={{
                          display: 'grid', gridTemplateColumns: '2fr 60px 50px 80px 60px',
                          padding: '5px 14px', borderBottom: '1px solid #111',
                          background: isLastYear ? '#1a0e00' : 'transparent', alignItems: 'center',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ color: isLastYear ? '#FF8740' : '#bbb', fontSize: 12, fontWeight: isLastYear ? 700 : 400 }}>
                              {c.first_name} {c.last_name}
                            </span>
                            {trait.short && <span style={{ background: trait.bg, color: trait.color, fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                            {(c as any).is_rookie_deal === 1 && <span style={{ color: '#4FC3F7', fontSize: 9, fontWeight: 700 }}>R</span>}
                            {isLastYear && <span style={{ color: '#FF8740', fontSize: 9, fontWeight: 700 }}>EXP</span>}
                          </div>
                          <div style={{ textAlign: 'center', color: '#555', fontSize: 11 }}>{c.position_label || c.position}</div>
                          <div style={{ textAlign: 'center', color: ratingColor(c.overall_rating), fontSize: 12, fontWeight: 700 }}>{c.overall_rating}</div>
                          <div style={{ textAlign: 'right', color: '#ccc', fontSize: 12 }}>{fmtSalary(c.annual_salary)}</div>
                          <div style={{ textAlign: 'center', color: isLastYear ? '#FF8740' : '#444', fontSize: 11 }}>{c.years_remaining}yr</div>
                        </div>
                      );
                    })}
                    <div style={{ padding: '6px 14px', fontSize: 11, color: '#444', display: 'flex', gap: 20 }}>
                      <span>{active.length} players on books</span>
                      <span>Total hit: <span style={{ color: '#ccc' }}>{fmtSalary(totalHit)}</span></span>
                      {expiring.length > 0 && <span style={{ color: '#FF8740' }}>{expiring.length} coming off books</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 6, fontSize: 10, color: '#333', textAlign: 'right' }}>
            Cap ceiling: {fmtSalary(totalCap)} · {maxYears} contract year{maxYears !== 1 ? 's' : ''} on books
          </div>
        </div>
      )}
    </>
  );
}
