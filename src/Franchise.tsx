import React, { useEffect, useState } from 'react';

declare const window: any;

interface Contract {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  annual_salary: number;
  years_remaining: number;
  years_total: number;
  guaranteed_amount: number;
  guaranteed_pct: number;
  contract_id: number;
}

interface CapSummary {
  total_cap: number;
  used_cap: number;
  available_cap: number;
}

interface Props {
  userTeam: { id: number; city: string; name: string };
  currentSeason: number;
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

const TRAIT_META: Record<string, { color: string; short: string }> = {
  'Normal':    { color: '#444',    short: '' },
  'Star':      { color: '#4FC3F7', short: 'S' },
  'Superstar': { color: '#FF8740', short: 'SS' },
  'X-Factor':  { color: '#FFD700', short: 'XF' },
};

function ratingColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4caf50';
  if (r >= 70) return '#FF8740';
  return '#888';
}

function trajectory(age: number): { label: string; color: string } {
  if (age <= 26) return { label: '↑', color: '#4caf50' };
  if (age <= 30) return { label: '→', color: '#FF8740' };
  return { label: '↓', color: '#777' };
}

function fmtSalary(m: number): string {
  return `$${m.toFixed(1)}M`;
}

function guaranteeColor(pct: number): string {
  if (pct >= 60) return '#4caf50';
  if (pct >= 35) return '#FF8740';
  return '#888';
}

// Contract quality badge: compares salary to position-market norms
function contractGrade(salary: number, pos: string, ovr: number): { label: string; color: string } | null {
  const marketMax: Record<string, number> = {
    QB: 55, WR: 38, DL: 45, LB: 22, CB: 28, TE: 20, OL: 26, S: 22, RB: 18, K: 5,
  };
  const max = marketMax[pos] ?? 20;
  const expectedAtOvr = max * Math.pow(Math.max(0, (ovr - 50)) / 49, 2) * 1.15;
  const ratio = salary / Math.max(expectedAtOvr, 1);
  if (ratio < 0.75) return { label: 'TEAM DEAL', color: '#4caf50' };
  if (ratio > 1.35) return { label: 'OVERPAID', color: '#e57373' };
  return null;
}

export default function Franchise({ userTeam, currentSeason }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [cap, setCap] = useState<CapSummary | null>(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [extendingId, setExtendingId] = useState<number | null>(null);
  const [extendYears, setExtendYears] = useState(3);
  const [extendSalary, setExtendSalary] = useState('');
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => { loadData(); }, [userTeam.id]);

  const loadData = async () => {
    const [c, s] = await Promise.all([
      window.api.getTeamContracts(userTeam.id),
      window.api.getCapSummary(userTeam.id),
    ]);
    setContracts(c);
    setCap(s);
  };

  const openExtend = (contract: Contract) => {
    setExtendingId(contract.id);
    setReleasingId(null);
    setExtendYears(Math.min(contract.years_remaining + 2, 5));
    setExtendSalary(contract.annual_salary.toFixed(1));
  };

  const handleExtend = async () => {
    if (!extendingId || working) return;
    const salary = parseFloat(extendSalary);
    if (isNaN(salary) || salary <= 0) return;

    const current = contracts.find(c => c.id === extendingId);
    const capImpact = salary - (current?.annual_salary ?? 0);
    if (cap && capImpact > cap.available_cap + 0.1) {
      alert(`Not enough cap space. Need $${capImpact.toFixed(1)}M more.`);
      return;
    }

    setWorking(true);
    await window.api.extendPlayer({ playerId: extendingId, years: extendYears, salary });
    setExtendingId(null);
    await loadData();
    setWorking(false);
  };

  const handleRelease = async () => {
    if (!releasingId || working) return;
    setWorking(true);
    await window.api.releasePlayer(releasingId);
    setReleasingId(null);
    await loadData();
    setWorking(false);
  };

  const filtered = contracts
    .filter(c => posFilter === 'ALL' || c.position === posFilter)
    .sort((a, b) => {
      if (sortBy === 'salary') return b.annual_salary - a.annual_salary;
      if (sortBy === 'years')  return a.years_remaining - b.years_remaining;
      if (sortBy === 'ovr')    return b.overall_rating - a.overall_rating;
      if (sortBy === 'age')    return a.age - b.age;
      return 0;
    });

  const expiring  = contracts.filter(c => c.years_remaining === 1).length;
  const capPct    = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor  = capPct > 90 ? '#e57373' : capPct > 75 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);

  const currentExtend   = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const extendSalaryNum = parseFloat(extendSalary) || 0;
  const capDelta        = currentExtend ? extendSalaryNum - currentExtend.annual_salary : 0;
  const newAvailable    = cap ? cap.available_cap - capDelta : 0;

  return (
    <div style={{ padding: '20px 24px', fontFamily: "'Inter', sans-serif", background: '#0d0d0d', minHeight: '100vh', color: '#ccc' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', letterSpacing: 1 }}>Franchise Management</div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
          {userTeam.city} {userTeam.name} · {currentSeason} Season
        </div>
      </div>

      {/* Cap Bar */}
      {cap && (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#555', fontWeight: 'bold', letterSpacing: 1 }}>SALARY CAP</span>
            <span style={{ fontSize: 13, color: capColor, fontWeight: 'bold' }}>{fmtSalary(cap.used_cap)} used</span>
            <span style={{ fontSize: 12, color: '#333' }}>/</span>
            <span style={{ fontSize: 12, color: '#555' }}>{fmtSalary(cap.total_cap)} cap</span>
            <span style={{ fontSize: 12, color: '#4caf50', marginLeft: 'auto' }}>{fmtSalary(cap.available_cap)} available</span>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(capPct, 100)}%`, height: '100%', background: capColor, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#444' }}>
              Guaranteed on books: <span style={{ color: '#FF8740' }}>{fmtSalary(totalGuaranteed)}</span>
            </span>
            {expiring > 0 && (
              <span style={{ fontSize: 11, color: '#e57373' }}>
                ⚠ {expiring} expiring this offseason
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {POSITIONS.map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)} style={{
              padding: '3px 9px',
              background: posFilter === pos ? '#FF8740' : '#141414',
              border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`,
              borderRadius: 3, color: posFilter === pos ? '#000' : '#555',
              fontSize: 11, cursor: 'pointer', fontWeight: posFilter === pos ? 'bold' : 'normal',
            }}>
              {pos}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5, color: '#ccc', padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}>
          <option value="salary">Sort: Salary</option>
          <option value="years">Sort: Expiring First</option>
          <option value="ovr">Sort: OVR</option>
          <option value="age">Sort: Age</option>
        </select>
      </div>

      {/* Contract Table */}
      <div style={{ border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 1fr', background: '#111', padding: '8px 14px', fontSize: 10, color: '#444', fontWeight: 'bold', letterSpacing: 1 }}>
          <div>PLAYER</div>
          <div>AGE / OVR</div>
          <div>DEV</div>
          <div>SALARY / GTD</div>
          <div>YEARS</div>
          <div></div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#333', fontSize: 13 }}>No contracts found</div>
        ) : (
          filtered.map(contract => {
            const isExpiring  = contract.years_remaining === 1;
            const trait       = TRAIT_META[contract.dev_trait] ?? TRAIT_META['Normal'];
            const traj        = trajectory(contract.age);
            const isExtending = extendingId === contract.id;
            const isReleasing = releasingId === contract.id;
            const grade       = contractGrade(contract.annual_salary, contract.position, contract.overall_rating);
            const gtdPct      = contract.guaranteed_pct ?? 0;

            return (
              <div key={contract.id} style={{ borderTop: '1px solid #151515' }}>
                {/* Main Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr 1fr', padding: '10px 14px', alignItems: 'center', background: isExtending ? '#0f1a0f' : isReleasing ? '#1a0f0f' : 'transparent' }}>

                  {/* Player Name */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>
                        {contract.first_name} {contract.last_name}
                      </span>
                      {trait.short && (
                        <span style={{ fontSize: 9, fontWeight: 'bold', color: trait.color, border: `1px solid ${trait.color}`, borderRadius: 2, padding: '1px 3px' }}>
                          {trait.short}
                        </span>
                      )}
                      {grade && (
                        <span style={{ fontSize: 9, fontWeight: 'bold', color: grade.color, border: `1px solid ${grade.color}`, borderRadius: 2, padding: '1px 4px' }}>
                          {grade.label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>
                      {contract.position_label || contract.position}
                    </div>
                  </div>

                  {/* Age / OVR */}
                  <div>
                    <span style={{ fontSize: 12, color: traj.color }}>{contract.age} {traj.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 'bold', color: ratingColor(contract.overall_rating), marginLeft: 8 }}>
                      {contract.overall_rating}
                    </span>
                  </div>

                  {/* Dev trait */}
                  <div style={{ fontSize: 11, color: trait.color }}>
                    {contract.dev_trait === 'Normal' ? '—' : contract.dev_trait}
                  </div>

                  {/* Salary + Guarantee */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ddd' }}>
                      {fmtSalary(contract.annual_salary)}
                    </div>
                    {gtdPct > 0 && (
                      <div style={{ fontSize: 10, color: guaranteeColor(gtdPct), marginTop: 1 }}>
                        {fmtSalary(contract.guaranteed_amount ?? 0)} GTD · {gtdPct.toFixed(0)}%
                      </div>
                    )}
                  </div>

                  {/* Years */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Progress dots */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: contract.years_total }).map((_, i) => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: i < contract.years_remaining ? '#FF8740' : '#222',
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: isExpiring ? '#e57373' : '#555', marginLeft: 4 }}>
                      {contract.years_remaining}yr{isExpiring ? ' ⚠' : ''}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => isExtending ? setExtendingId(null) : openExtend(contract)}
                      style={{ padding: '4px 10px', background: isExtending ? '#1a3a1a' : '#141414', border: `1px solid ${isExtending ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: isExtending ? '#4caf50' : '#555', fontSize: 11, cursor: 'pointer' }}>
                      {isExtending ? 'Cancel' : 'Extend'}
                    </button>
                    <button onClick={() => isReleasing ? setReleasingId(null) : (setReleasingId(contract.id), setExtendingId(null))}
                      style={{ padding: '4px 10px', background: isReleasing ? '#3a0a0a' : '#141414', border: `1px solid ${isReleasing ? '#e57373' : '#2a2a2a'}`, borderRadius: 4, color: isReleasing ? '#e57373' : '#555', fontSize: 11, cursor: 'pointer' }}>
                      {isReleasing ? 'Cancel' : 'Cut'}
                    </button>
                  </div>
                </div>

                {/* Extend Panel */}
                {isExtending && currentExtend && (
                  <div style={{ background: '#0c160c', borderTop: '1px solid #1a2a1a', padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, color: '#4caf50', fontWeight: 'bold', letterSpacing: 1, marginBottom: 10 }}>
                      OFFER EXTENSION — {contract.first_name} {contract.last_name}
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1, 2, 3, 4, 5].map(y => (
                            <button key={y} onClick={() => setExtendYears(y)} style={{
                              width: 32, height: 32, background: extendYears === y ? '#4caf50' : '#141414',
                              border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`,
                              borderRadius: 4, color: extendYears === y ? '#000' : '#555',
                              fontWeight: 'bold', fontSize: 12, cursor: 'pointer',
                            }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#555', fontSize: 13 }}>$</span>
                          <input type="number" value={extendSalary} onChange={e => setExtendSalary(e.target.value)}
                            min="0.1" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555', fontSize: 13 }}>M</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>CAP IMPACT</div>
                        <div style={{ fontSize: 12, color: capDelta > 0 ? '#e57373' : '#4caf50' }}>
                          {capDelta > 0 ? '+' : ''}{fmtSalary(capDelta)} vs current
                        </div>
                        <div style={{ fontSize: 11, color: '#444' }}>
                          {fmtSalary(Math.max(0, newAvailable))} remaining after
                        </div>
                      </div>
                      <button onClick={handleExtend} disabled={working || newAvailable < 0}
                        style={{ padding: '8px 20px', background: newAvailable < 0 ? '#1a1a1a' : '#2a4a2a', border: `1px solid ${newAvailable < 0 ? '#333' : '#4caf50'}`, borderRadius: 5, color: newAvailable < 0 ? '#333' : '#4caf50', fontSize: 12, cursor: newAvailable < 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                        {working ? '...' : 'Confirm Extension'}
                      </button>
                    </div>
                    {newAvailable < 0 && (
                      <div style={{ fontSize: 11, color: '#e57373', marginTop: 8 }}>
                        Over cap by {fmtSalary(Math.abs(newAvailable))} — reduce salary or cut a player first.
                      </div>
                    )}
                  </div>
                )}

                {/* Release Confirmation */}
                {isReleasing && (
                  <div style={{ background: '#160c0c', borderTop: '1px solid #2a1a1a', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#e57373' }}>
                      Release {contract.first_name} {contract.last_name}? Frees {fmtSalary(contract.annual_salary)} in cap space.
                    </span>
                    <button onClick={handleRelease} disabled={working}
                      style={{ padding: '6px 16px', background: '#3a0a0a', border: '1px solid #e57373', borderRadius: 4, color: '#e57373', fontSize: 12, cursor: 'pointer' }}>
                      {working ? '...' : 'Confirm Release'}
                    </button>
                    <button onClick={() => setReleasingId(null)}
                      style={{ padding: '6px 16px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#555', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {contracts.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#333' }}>
          {filtered.length} player{filtered.length !== 1 ? 's' : ''} · {fmtSalary(filtered.reduce((s, c) => s + c.annual_salary, 0))} shown
        </div>
      )}
    </div>
  );
}