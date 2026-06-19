import React from 'react';
import { Contract, CapSummary, RosterSpots } from './types';
import { POSITIONS, TRAIT_META, ratingColor, trajectory, fmtSalary, contractGrade } from './utils';

interface Props {
  contracts: Contract[];
  cap: CapSummary | null;
  rosterSpots: RosterSpots | null;
  posFilter: string;
  setPosFilter: (p: string) => void;
  sortBy: 'salary' | 'years' | 'ovr' | 'age';
  setSortBy: (s: 'salary' | 'years' | 'ovr' | 'age') => void;
  rosterSearch: string;
  setRosterSearch: (v: string) => void;
  extendingId: number | null;
  setExtendingId: (id: number | null) => void;
  extendYears: number;
  setExtendYears: (y: number) => void;
  extendSalary: string;
  setExtendSalary: (s: string) => void;
  releasingId: number | null;
  setReleasingId: (id: number | null) => void;
  handleExtend: () => void;
  handleRelease: () => void;
  working: boolean;
}

function moraleColor(morale: number): string {
  if (morale >= 80) return '#4caf50';
  if (morale >= 60) return '#FF8740';
  return '#e57373';
}

export default function ActiveRosterTab({
  contracts, cap, rosterSpots,
  posFilter, setPosFilter, sortBy, setSortBy, rosterSearch, setRosterSearch,
  extendingId, setExtendingId, extendYears, setExtendYears, extendSalary, setExtendSalary,
  releasingId, setReleasingId,
  handleExtend, handleRelease, working,
}: Props) {
  const filtered = contracts
    .filter(c => posFilter === 'ALL' || (c.position_label || c.position) === posFilter)
    .filter(c => {
      if (!rosterSearch.trim()) return true;
      const q = rosterSearch.toLowerCase();
      return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'salary') return b.annual_salary - a.annual_salary;
      if (sortBy === 'years') return a.years_remaining - b.years_remaining;
      if (sortBy === 'ovr') return b.overall_rating - a.overall_rating;
      if (sortBy === 'age') return a.age - b.age;
      return 0;
    });

  const currentExtend = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const extendSalaryNum = parseFloat(extendSalary) || 0;
  const capDelta = currentExtend ? extendSalaryNum - currentExtend.annual_salary : 0;
  const newAvailable = cap ? cap.available_cap - capDelta : 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {POSITIONS.map(pos => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            padding: '3px 9px', background: posFilter === pos ? '#FF8740' : '#141414',
            border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`, borderRadius: 3,
            color: posFilter === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
            fontWeight: posFilter === pos ? 'bold' : 'normal',
          }}>{pos}</button>
        ))}
        <select onChange={e => setSortBy(e.target.value as any)} value={sortBy} style={{
          background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
          color: '#ccc', padding: '4px 10px', fontSize: 12, marginLeft: 'auto',
        }}>
          <option value="salary">Sort: Salary</option>
          <option value="years">Sort: Expiring First</option>
          <option value="ovr">Sort: OVR</option>
          <option value="age">Sort: Age</option>
        </select>
        <input
          placeholder="Search player…"
          value={rosterSearch}
          onChange={e => setRosterSearch(e.target.value)}
          style={{
            background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
            color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160,
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 80px', gap: '0 8px', padding: '4px 8px', marginBottom: 4 }}>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>PLAYER</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>AGE / OVR</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>DEV</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>SALARY / GTD</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>YEARS</span>
        <span />
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: '#333', fontSize: 13, padding: '20px 8px' }}>No contracts found</div>
      ) : filtered.map(contract => {
        const isExpiring = contract.years_remaining === 1;
        const trait = TRAIT_META[contract.dev_trait] ?? TRAIT_META['Normal'];
        const traj = trajectory(contract.age);
        const isExtending = extendingId === contract.id;
        const isReleasing = releasingId === contract.id;
        const grade = contractGrade(contract.annual_salary, contract.position, contract.overall_rating, contract.dev_trait);
        const gtdPct = contract.guaranteed_pct ?? 0;
        const morale = contract.morale ?? 75;
        const mColor = moraleColor(morale);

        return (
          <div key={contract.id} style={{
            background: isExpiring ? '#1a1200' : '#111',
            border: `1px solid ${isExpiring ? '#3a2800' : '#1a1a1a'}`,
            borderRadius: 6, padding: '10px 12px', marginBottom: 6,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 80px', gap: '0 8px', alignItems: 'center' }}>

              {/* Player name + morale bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#ddd', fontSize: 13, fontWeight: 600 }}>
                    {contract.first_name} {contract.last_name}
                  </span>
                  {trait.short && (
                    <span style={{ background: trait.bg, color: trait.color, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>
                      {trait.short}
                    </span>
                  )}
                  {grade && (
                    <span style={{ background: `${grade.color}22`, color: grade.color, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>
                      {grade.label}
                    </span>
                  )}
                </div>
                <div style={{ color: '#444', fontSize: 11, marginTop: 1 }}>
                  {contract.position_label || contract.position}
                </div>
                {/* Morale bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <div style={{ width: 48, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${morale}%`, height: '100%', background: mColor, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ color: mColor, fontSize: 9, fontWeight: 700 }}>{morale}</span>
                </div>
              </div>

              {/* Age / OVR */}
              <div>
                <div style={{ color: '#aaa', fontSize: 12 }}>{contract.age} <span style={{ color: '#444', fontSize: 10 }}>{traj.label}</span></div>
                <div style={{ color: ratingColor(contract.overall_rating), fontSize: 15, fontWeight: 700 }}>{contract.overall_rating}</div>
              </div>

              {/* Dev trait */}
              <div style={{ color: trait.color, fontSize: 12 }}>
                {contract.dev_trait === 'Normal' ? '—' : contract.dev_trait}
              </div>

              {/* Salary / GTD */}
              <div>
                <div style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>{fmtSalary(contract.annual_salary)}</div>
                {gtdPct > 0 && (
                  <div style={{ color: gtdPct >= 60 ? '#4caf50' : gtdPct >= 35 ? '#FF8740' : '#555', fontSize: 10, marginTop: 1 }}>
                    {fmtSalary(contract.guaranteed_amount ?? 0)} GTD · {gtdPct.toFixed(0)}%
                  </div>
                )}
              </div>

              {/* Years pips */}
              <div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                  {Array.from({ length: contract.years_total }).map((_, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: i < contract.years_remaining ? '#4caf50' : '#1a1a1a',
                      border: '1px solid #2a2a2a',
                    }} />
                  ))}
                </div>
                <div style={{ color: isExpiring ? '#FF8740' : '#555', fontSize: 11 }}>
                  {contract.years_remaining}yr{isExpiring ? ' ⚠' : ''}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => isExtending ? setExtendingId(null) : (setExtendingId(contract.id), setReleasingId(null), setExtendYears(Math.min(contract.years_remaining + 2, 5)), setExtendSalary(contract.annual_salary.toFixed(1)))}
                  style={{ padding: '4px 10px', background: isExtending ? '#1a3a1a' : '#141414', border: `1px solid ${isExtending ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: isExtending ? '#4caf50' : '#555', fontSize: 11, cursor: 'pointer' }}>
                  {isExtending ? 'Cancel' : 'Extend'}
                </button>
                <button
                  onClick={() => isReleasing ? setReleasingId(null) : (setReleasingId(contract.id), setExtendingId(null))}
                  style={{ padding: '4px 10px', background: isReleasing ? '#3a0a0a' : '#141414', border: `1px solid ${isReleasing ? '#e57373' : '#2a2a2a'}`, borderRadius: 4, color: isReleasing ? '#e57373' : '#555', fontSize: 11, cursor: 'pointer' }}>
                  {isReleasing ? 'Cancel' : 'Cut'}
                </button>
              </div>
            </div>

            {isExtending && currentExtend && (
              <div style={{ marginTop: 12, padding: '12px 14px', background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: 6 }}>
                <div style={{ color: '#4caf50', fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
                  OFFER EXTENSION — {contract.first_name} {contract.last_name}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>YEARS</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1,2,3,4,5].map(y => (
                        <button key={y} onClick={() => setExtendYears(y)} style={{ width: 32, height: 32, background: extendYears === y ? '#4caf50' : '#141414', border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: extendYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#444' }}>$</span>
                      <input type="text" inputMode="decimal" value={extendSalary} onChange={e => setExtendSalary(e.target.value)}
  placeholder="0.0"
  style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                      <span style={{ color: '#444' }}>M</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>CAP IMPACT</div>
                    <div style={{ color: capDelta > 0 ? '#e57373' : '#4caf50', fontSize: 13 }}>{capDelta > 0 ? '+' : ''}{fmtSalary(capDelta)} vs current</div>
                    <div style={{ color: '#444', fontSize: 11 }}>{fmtSalary(Math.max(0, newAvailable))} remaining after</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={handleExtend} disabled={working || newAvailable < 0} style={{ padding: '7px 18px', background: newAvailable < 0 ? '#141414' : '#4caf50', border: 'none', borderRadius: 4, color: newAvailable < 0 ? '#333' : '#000', fontWeight: 700, fontSize: 12, cursor: newAvailable < 0 ? 'not-allowed' : 'pointer' }}>
                    {working ? '...' : 'Confirm Extension'}
                  </button>
                  {newAvailable < 0 && <span style={{ color: '#e57373', fontSize: 11 }}>Over cap by {fmtSalary(Math.abs(newAvailable))} — reduce salary or cut a player first.</span>}
                </div>
              </div>
            )}

            {isReleasing && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 6 }}>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>
                  Release {contract.first_name} {contract.last_name}? Frees {fmtSalary(contract.annual_salary)} in cap space.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleRelease} style={{ padding: '6px 16px', background: '#e57373', border: 'none', borderRadius: 4, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {working ? '...' : 'Confirm Release'}
                  </button>
                  <button onClick={() => setReleasingId(null)} style={{ padding: '6px 16px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#555', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {contracts.length > 0 && (
        <div style={{ color: '#333', fontSize: 11, marginTop: 8, textAlign: 'right' }}>
          {filtered.length} player{filtered.length !== 1 ? 's' : ''} · {fmtSalary(filtered.reduce((s, c) => s + c.annual_salary, 0))} shown
        </div>
      )}
    </>
  );
}
