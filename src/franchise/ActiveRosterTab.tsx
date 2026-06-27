import React, { useRef, useState, useEffect } from 'react';
import { Contract, CapSummary, RosterSpots } from './types';
import { POSITIONS, TRAIT_META, ratingColor, trajectory, fmtSalary, contractGrade } from './utils';

interface Props {
  contracts: Contract[];
  cap: CapSummary | null;
  rosterSpots: RosterSpots | null;
  posFilter: string;
  setPosFilter: (p: string) => void;
  sortBy: 'position' | 'salary' | 'years' | 'ovr' | 'age';
  setSortBy: (s: 'position' | 'salary' | 'years' | 'ovr' | 'age') => void;
  rosterSearch: string;
  setRosterSearch: (v: string) => void;
  extendingId: number | null;
  setExtendingId: (id: number | null) => void;
  extendYears: number;
  setExtendYears: (y: number) => void;
  releasingId: number | null;
  setReleasingId: (id: number | null) => void;
  demotingId: number | null;
  setDemotingId: (id: number | null) => void;
  handleExtend: (salary: string) => void;
  handleRelease: () => void;
  handleDemoteToPs: (playerId: number) => void;
  working: boolean;
  onPlayerClick?: (playerId: number) => void;
}

function moraleColor(morale: number): string {
  if (morale >= 80) return '#4caf50';
  if (morale >= 60) return '#FF8740';
  return '#e57373';
}

export default function ActiveRosterTab({
  contracts, cap, rosterSpots,
  posFilter, setPosFilter, sortBy, setSortBy, rosterSearch, setRosterSearch,
  extendingId, setExtendingId, extendYears, setExtendYears,
  releasingId, setReleasingId,
  demotingId, setDemotingId,
  handleExtend, handleRelease, handleDemoteToPs, working, onPlayerClick,
}: Props) {
  const salaryInputRef = useRef<HTMLInputElement>(null);
  const [capSalary, setCapSalary] = useState('');

  useEffect(() => {
    if (extendingId) {
      const c = contracts.find(x => x.id === extendingId);
      setCapSalary(c ? c.annual_salary.toFixed(1) : '');
      setTimeout(() => salaryInputRef.current?.focus(), 60);
    } else {
      setCapSalary('');
    }
  }, [extendingId]);

  const filtered = contracts
    .filter(c => posFilter === 'ALL' || c.position === posFilter || c.position_label === posFilter)
    .filter(c => {
      if (!rosterSearch.trim()) return true;
      const q = rosterSearch.toLowerCase();
      return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'position') {
        const ORDER = ['QB','HB','FB','WR','TE','LT','LG','C','RG','RT','OL',
          'DE','DT','NT','MLB','LOLB','ROLB','LB','CB','FS','SS','S','K','P','KR','PR'];
        const ai = ORDER.indexOf(a.position ?? '');
        const bi = ORDER.indexOf(b.position ?? '');
        const posA = ai === -1 ? 99 : ai;
        const posB = bi === -1 ? 99 : bi;
        if (posA !== posB) return posA - posB;
        return b.overall_rating - a.overall_rating;
      }
      if (sortBy === 'salary') return b.annual_salary - a.annual_salary;
      if (sortBy === 'years') return a.years_remaining - b.years_remaining;
      if (sortBy === 'ovr') return b.overall_rating - a.overall_rating;
      if (sortBy === 'age') return a.age - b.age;
      return 0;
    });

  const currentExtend = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const capSalaryNum = parseFloat(capSalary) || 0;
  const capDelta = currentExtend ? capSalaryNum - currentExtend.annual_salary : 0;
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
          <option value="position">Sort: Position</option>
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

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 120px', gap: '0 8px', padding: '4px 8px', marginBottom: 4 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 120px', gap: '0 8px', alignItems: 'center' }}>

              {/* Player name + morale bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    onClick={() => onPlayerClick?.(contract.id)}
                    style={{ color: '#ddd', fontSize: 13, fontWeight: 600, cursor: onPlayerClick ? 'pointer' : 'default', textDecoration: onPlayerClick ? 'underline' : 'none', textDecorationColor: '#444' }}
                  >
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
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  onClick={() => isExtending
                    ? setExtendingId(null)
                    : (setExtendingId(contract.id), setReleasingId(null), setDemotingId(null), setExtendYears(2))}
                  style={{ padding: '4px 8px', background: isExtending ? '#1a3a1a' : '#141414', border: `1px solid ${isExtending ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: isExtending ? '#4caf50' : '#555', fontSize: 11, cursor: 'pointer' }}>
                  {isExtending ? 'Cancel' : 'Extend'}
                </button>
                <button
                  onClick={() => {
                    const isDemoting = demotingId === contract.id;
                    isDemoting ? setDemotingId(null) : (setDemotingId(contract.id), setExtendingId(null), setReleasingId(null));
                  }}
                  disabled={!!(rosterSpots && rosterSpots.psFree <= 0)}
                  title={rosterSpots && rosterSpots.psFree <= 0 ? 'Practice squad full' : 'Send to practice squad'}
                  style={{
                    padding: '4px 8px', fontSize: 11, cursor: rosterSpots && rosterSpots.psFree <= 0 ? 'not-allowed' : 'pointer',
                    borderRadius: 4,
                    background: demotingId === contract.id ? '#1a1a3a' : '#141414',
                    border: `1px solid ${demotingId === contract.id ? '#7986cb' : '#2a2a2a'}`,
                    color: demotingId === contract.id ? '#7986cb' : rosterSpots && rosterSpots.psFree <= 0 ? '#2a2a2a' : '#555',
                    opacity: rosterSpots && rosterSpots.psFree <= 0 ? 0.4 : 1,
                  }}>
                  ↓ PS
                </button>
                <button
                  onClick={() => isReleasing ? setReleasingId(null) : (setReleasingId(contract.id), setExtendingId(null), setDemotingId(null))}
                  style={{ padding: '4px 8px', background: isReleasing ? '#3a0a0a' : '#141414', border: `1px solid ${isReleasing ? '#e57373' : '#2a2a2a'}`, borderRadius: 4, color: isReleasing ? '#e57373' : '#555', fontSize: 11, cursor: 'pointer' }}>
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
                    <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>ADD YEARS</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1,2,3,4,5].map(y => (
                        <button key={y} onClick={() => setExtendYears(y)} style={{ width: 32, height: 32, background: extendYears === y ? '#4caf50' : '#141414', border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: extendYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>+{y}</button>
                      ))}
                    </div>
                    <div style={{ color: '#4caf50', fontSize: 10, marginTop: 4 }}>
                      {currentExtend.years_remaining}yr remaining → <strong>{currentExtend.years_remaining + extendYears}yr total</strong>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#444' }}>$</span>
                      <input
                        key={`salary-${extendingId}`}
                        ref={salaryInputRef}
                        type="text"
                        inputMode="decimal"
                        defaultValue={currentExtend.annual_salary.toFixed(1)}
                        onChange={e => setCapSalary(e.target.value)}
                        placeholder="0.0"
                        style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }}
                      />
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
                  <button
                    onClick={() => handleExtend(salaryInputRef.current?.value ?? capSalary)}
                    disabled={working || newAvailable < 0}
                    style={{ padding: '7px 18px', background: newAvailable < 0 ? '#141414' : '#4caf50', border: 'none', borderRadius: 4, color: newAvailable < 0 ? '#333' : '#000', fontWeight: 700, fontSize: 12, cursor: newAvailable < 0 ? 'not-allowed' : 'pointer' }}>
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

            {demotingId === contract.id && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#0d0d1a', border: '1px solid #2a2a5a', borderRadius: 6 }}>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>
                  Send {contract.first_name} {contract.last_name} to the practice squad?
                </div>
                <div style={{ color: '#555', fontSize: 11, marginBottom: 8 }}>
                  Contract drops to PS minimum ($1.2M). Frees {fmtSalary(Math.max(0, contract.annual_salary - 1.165))} in cap space.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDemoteToPs(contract.id)}
                    disabled={working}
                    style={{ padding: '6px 16px', background: '#7986cb', border: 'none', borderRadius: 4, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {working ? '...' : 'Confirm → PS'}
                  </button>
                  <button onClick={() => setDemotingId(null)} style={{ padding: '6px 16px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#555', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
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
