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

interface PracticePlayer {
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

// Real 2026 NFL market rates by position and OVR tier
function contractGrade(salary: number, pos: string, ovr: number, devTrait: string = 'Normal'): { label: string; color: string } | null {
  // X-Factor players are franchise cornerstones — big contracts are expected
  if (devTrait === 'X-Factor' || devTrait === 'Superstar') return null;

  const marketRates: Record<string, [number, number][]> = {
    //  [OVR floor, fair annual $M] pairs — interpolated between tiers
    QB: [[99,65],[93,50],[88,35],[83,20],[78,10],[73,4],[70,1.5]],
    WR: [[99,45],[93,35],[88,25],[83,16],[78,8],[73,3],[70,1.5]],
    DL: [[99,38],[93,30],[88,22],[83,14],[78,7],[73,3],[70,1.5]],
    CB: [[99,32],[93,25],[88,18],[83,11],[78,5],[73,2.5],[70,1.5]],
    OL: [[99,36],[93,30],[88,24],[83,18],[78,9],[73,3],[70,1.5]],
    LB: [[99,26],[93,20],[88,15],[83,9],[78,4.5],[73,2],[70,1.5]],
    TE: [[99,24],[93,19],[88,14],[83,8],[78,4],[73,2],[70,1.5]],
    S:  [[99,22],[93,17],[88,12],[83,7],[78,3.5],[73,1.8],[70,1.5]],
    RB: [[99,18],[93,14],[88,10],[83,6],[78,3],[73,1.5],[70,1.2]],
    K:  [[99,8],[93,6],[88,5],[83,4],[78,3],[73,2],[70,1]],
  };

  const rates = marketRates[pos] ?? marketRates['LB'];
  let fairValue = rates[rates.length - 1][1];

  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal]   = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      fairValue = lowSal + t * (highSal - lowSal);
      break;
    }
  }

  const ratio = salary / Math.max(fairValue, 1);
  if (ratio < 0.70) return { label: 'TEAM DEAL', color: '#4caf50' };
  if (ratio > 2.00) return { label: 'OVERPAID',  color: '#e57373' };
  return null;
}

export default function Franchise({ userTeam, currentSeason }: Props) {
  const [contracts,    setContracts]    = useState<Contract[]>([]);
  const [practiceSquad, setPracticeSquad] = useState<PracticePlayer[]>([]);
  const [cap,          setCap]          = useState<CapSummary | null>(null);
  const [posFilter,    setPosFilter]    = useState('ALL');
  const [sortBy,       setSortBy]       = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [activeTab,    setActiveTab]    = useState<'roster' | 'ps'>('roster');
  const [extendingId,  setExtendingId]  = useState<number | null>(null);
  const [extendYears,  setExtendYears]  = useState(3);
  const [extendSalary, setExtendSalary] = useState('');
  const [releasingId,  setReleasingId]  = useState<number | null>(null);
  const [working,      setWorking]      = useState(false);

  useEffect(() => { loadData(); }, [userTeam.id]);

  const loadData = async () => {
    const [c, s, ps] = await Promise.all([
      window.api.getTeamContracts(userTeam.id),
      window.api.getCapSummary(userTeam.id),
      window.api.getPracticeSquad(userTeam.id),
    ]);
    setContracts(c);
    setCap(s);
    setPracticeSquad(ps);
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

  const expiring      = contracts.filter(c => c.years_remaining === 1).length;
  const capPct        = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor      = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);

  const currentExtend  = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const extendSalaryNum = parseFloat(extendSalary) || 0;
  const capDelta       = currentExtend ? extendSalaryNum - currentExtend.annual_salary : 0;
  const newAvailable   = cap ? cap.available_cap - capDelta : 0;

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 1 }}>Franchise Management</div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
          {userTeam.city} {userTeam.name} · {currentSeason} Season
        </div>
      </div>

      {/* Cap Bar */}
      {cap && (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#444', letterSpacing: 2 }}>SALARY CAP</span>
            <span style={{ fontSize: 18, fontWeight: 'bold', color: capColor }}>{fmtSalary(cap.used_cap)} used</span>
            <span style={{ color: '#333' }}>/</span>
            <span style={{ fontSize: 14, color: '#666' }}>{fmtSalary(cap.total_cap)} cap</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: cap.available_cap < 0 ? '#e57373' : '#4caf50', fontWeight: 'bold' }}>
              {cap.available_cap < 0 ? '⚠ OVER CAP ' : ''}{fmtSalary(cap.available_cap)} {cap.available_cap >= 0 ? 'available' : ''}
            </span>
          </div>
          <div style={{ background: '#0d0d0d', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(capPct, 100)}%`, height: '100%', background: capColor, borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#444' }}>
            <span>Guaranteed on books: <span style={{ color: '#666' }}>{fmtSalary(totalGuaranteed)}</span></span>
            {expiring > 0 && (
              <span style={{ color: '#FF8740' }}>⚠ {expiring} expiring this offseason</span>
            )}
            <span style={{ marginLeft: 'auto' }}>{contracts.length} / 53 active</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['roster', 'ps'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '5px 16px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 4,
            background: activeTab === tab ? '#FF8740' : '#111',
            border: `1px solid ${activeTab === tab ? '#FF8740' : '#222'}`,
            color: activeTab === tab ? '#000' : '#555',
            fontWeight: activeTab === tab ? 'bold' : 'normal',
          }}>
            {tab === 'roster' ? `ACTIVE ROSTER (${contracts.length})` : `PRACTICE SQUAD (${practiceSquad.length})`}
          </button>
        ))}
      </div>

      {/* ── Active Roster Tab ── */}
      {activeTab === 'roster' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)} style={{
                  padding: '3px 9px',
                  background: posFilter === pos ? '#FF8740' : '#141414',
                  border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`,
                  borderRadius: 3, color: posFilter === pos ? '#000' : '#555',
                  fontSize: 11, cursor: 'pointer', fontWeight: posFilter === pos ? 'bold' : 'normal',
                }}>{pos}</button>
              ))}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{
              background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
              color: '#ccc', padding: '4px 10px', fontSize: 12, marginLeft: 'auto',
            }}>
              <option value="salary">Sort: Salary</option>
              <option value="years">Sort: Expiring First</option>
              <option value="ovr">Sort: OVR</option>
              <option value="age">Sort: Age</option>
            </select>
          </div>

          {/* Table Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 160px 100px 120px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span>
            <span>AGE / OVR</span>
            <span>DEV</span>
            <span>SALARY / GTD</span>
            <span>YEARS</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No contracts found</div>
          ) : (
            filtered.map(contract => {
              const isExpiring  = contract.years_remaining === 1;
              const trait       = TRAIT_META[contract.dev_trait] ?? TRAIT_META['Normal'];
              const traj        = trajectory(contract.age);
              const isExtending = extendingId === contract.id;
              const isReleasing = releasingId === contract.id;
              const grade = contractGrade(contract.annual_salary, contract.position, contract.overall_rating, contract.dev_trait);
              const gtdPct      = contract.guaranteed_pct ?? 0;

              return (
                <div key={contract.id} style={{ borderBottom: '1px solid #111', background: isExtending || isReleasing ? '#0f0f0f' : 'transparent' }}>
                  {/* Main Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 160px 100px 120px', gap: 8, padding: '8px 12px', alignItems: 'center' }}>

                    {/* Player Name */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: 13 }}>
                          {contract.first_name} {contract.last_name}
                        </span>
                        {trait.short && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>
                            {trait.short}
                          </span>
                        )}
                        {grade && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: grade.color + '22', color: grade.color, fontWeight: 'bold', letterSpacing: 1 }}>
                            {grade.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>
                        {contract.position_label || contract.position}
                      </div>
                    </div>

                    {/* Age / OVR */}
                    <div>
                      <span style={{ color: traj.color, fontSize: 12 }}>{contract.age} {traj.label}</span>
                      <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(contract.overall_rating) }}>
                        {contract.overall_rating}
                      </span>
                    </div>

                    {/* Dev Trait */}
                    <div style={{ fontSize: 11, color: TRAIT_META[contract.dev_trait]?.color ?? '#444' }}>
                      {contract.dev_trait === 'Normal' ? '—' : contract.dev_trait}
                    </div>

                    {/* Salary + Guarantee */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ccc' }}>
                        {fmtSalary(contract.annual_salary)}
                      </div>
                      {gtdPct > 0 && (
                        <div style={{ fontSize: 10, color: gtdPct >= 60 ? '#4caf50' : gtdPct >= 35 ? '#FF8740' : '#555', marginTop: 1 }}>
                          {fmtSalary(contract.guaranteed_amount ?? 0)} GTD · {gtdPct.toFixed(0)}%
                        </div>
                      )}
                    </div>

                    {/* Years */}
                    <div>
                      <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                        {Array.from({ length: contract.years_total }).map((_, i) => (
                          <div key={i} style={{
                            width: 8, height: 8, borderRadius: 2,
                            background: i < contract.years_remaining
                              ? (isExpiring ? '#e57373' : '#4caf50')
                              : '#1a1a1a',
                          }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: isExpiring ? '#e57373' : '#555' }}>
                        {contract.years_remaining}yr{isExpiring ? ' ⚠' : ''}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => isExtending ? setExtendingId(null) : openExtend(contract)} style={{
                        padding: '4px 10px', background: isExtending ? '#1a3a1a' : '#141414',
                        border: `1px solid ${isExtending ? '#4caf50' : '#2a2a2a'}`,
                        borderRadius: 4, color: isExtending ? '#4caf50' : '#555', fontSize: 11, cursor: 'pointer',
                      }}>
                        {isExtending ? 'Cancel' : 'Extend'}
                      </button>
                      <button onClick={() => isReleasing ? setReleasingId(null) : (setReleasingId(contract.id), setExtendingId(null))} style={{
                        padding: '4px 10px', background: isReleasing ? '#3a0a0a' : '#141414',
                        border: `1px solid ${isReleasing ? '#e57373' : '#2a2a2a'}`,
                        borderRadius: 4, color: isReleasing ? '#e57373' : '#555', fontSize: 11, cursor: 'pointer',
                      }}>
                        {isReleasing ? 'Cancel' : 'Cut'}
                      </button>
                    </div>
                  </div>

                  {/* Extend Panel */}
                  {isExtending && currentExtend && (
                    <div style={{ margin: '0 12px 12px', padding: '14px 18px', background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#4caf50', letterSpacing: 2, marginBottom: 12 }}>
                        OFFER EXTENSION — {contract.first_name} {contract.last_name}
                      </div>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>YEARS</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(y => (
                              <button key={y} onClick={() => setExtendYears(y)} style={{
                                width: 32, height: 32,
                                background: extendYears === y ? '#4caf50' : '#141414',
                                border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`,
                                borderRadius: 4, color: extendYears === y ? '#000' : '#555',
                                fontWeight: 'bold', fontSize: 12, cursor: 'pointer',
                              }}>{y}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#555' }}>$</span>
                            <input type="number" value={extendSalary} onChange={e => setExtendSalary(e.target.value)}
                              min="0.1" step="0.5"
                              style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                            <span style={{ color: '#555' }}>M</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>CAP IMPACT</div>
                          <div style={{ fontSize: 13, color: capDelta > 0 ? '#e57373' : '#4caf50' }}>
                            {capDelta > 0 ? '+' : ''}{fmtSalary(capDelta)} vs current
                          </div>
                          <div style={{ fontSize: 11, color: '#444', marginTop: 3 }}>
                            {fmtSalary(Math.max(0, newAvailable))} remaining after
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button onClick={handleExtend} disabled={working} style={{
                            padding: '8px 20px', background: '#1a3a1a', border: '1px solid #4caf50',
                            borderRadius: 4, color: '#4caf50', fontSize: 12, cursor: 'pointer', fontWeight: 'bold',
                          }}>
                            {working ? '...' : 'Confirm Extension'}
                          </button>
                        </div>
                      </div>
                      {newAvailable < 0 && (
                        <div style={{ marginTop: 10, fontSize: 11, color: '#e57373' }}>
                          Over cap by {fmtSalary(Math.abs(newAvailable))} — reduce salary or cut a player first.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Release Confirmation */}
                  {isReleasing && (
                    <div style={{ margin: '0 12px 12px', padding: '12px 18px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: '#e57373', marginBottom: 10 }}>
                        Release {contract.first_name} {contract.last_name}? Frees {fmtSalary(contract.annual_salary)} in cap space.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleRelease} disabled={working} style={{
                          padding: '6px 16px', background: '#3a0a0a', border: '1px solid #e57373',
                          borderRadius: 4, color: '#e57373', fontSize: 12, cursor: 'pointer',
                        }}>
                          {working ? '...' : 'Confirm Release'}
                        </button>
                        <button onClick={() => setReleasingId(null)} style={{
                          padding: '6px 16px', background: '#141414', border: '1px solid #2a2a2a',
                          borderRadius: 4, color: '#555', fontSize: 12, cursor: 'pointer',
                        }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {contracts.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: '#333', textAlign: 'right' }}>
              {filtered.length} player{filtered.length !== 1 ? 's' : ''} · {fmtSalary(filtered.reduce((s, c) => s + c.annual_salary, 0))} shown
            </div>
          )}
        </>
      )}

      {/* ── Practice Squad Tab ── */}
      {activeTab === 'ps' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span>
            <span>AGE / OVR</span>
            <span>DEV</span>
            <span>SALARY</span>
          </div>
          {practiceSquad.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No practice squad players</div>
          ) : (
            practiceSquad.map(p => {
              const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
              const traj  = trajectory(p.age);
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px', gap: 8, padding: '8px 12px', borderBottom: '1px solid #111', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontSize: 13 }}>{p.first_name} {p.last_name}</span>
                      {trait.short && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>
                          {trait.short}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{p.position_label || p.position}</div>
                  </div>
                  <div>
                    <span style={{ color: traj.color, fontSize: 12 }}>{p.age} {traj.label}</span>
                    <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(p.overall_rating) }}>
                      {p.overall_rating}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: trait.color }}>
                    {p.dev_trait === 'Normal' ? '—' : p.dev_trait}
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>{fmtSalary(p.annual_salary ?? 1.165)}</div>
                </div>
              );
            })
          )}
          <div style={{ marginTop: 12, fontSize: 11, color: '#333', textAlign: 'right' }}>
            {practiceSquad.length} / 16 practice squad slots used
          </div>
        </div>
      )}

    </div>
  );
}