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

interface FreeAgent {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
}

interface CapSummary {
  total_cap: number;
  used_cap: number;
  available_cap: number;
}

interface RosterSpots {
  active: number;
  ps: number;
  activeMax: number;
  psMax: number;
  activeFree: number;
  psFree: number;
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

const MARKET_RATES: Record<string, [number, number][]> = {
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

const TRAIT_MUL: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };

function interpolateMarket(pos: string, ovr: number): number {
  const rates = MARKET_RATES[pos] ?? MARKET_RATES['LB'];
  let base = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal]   = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      base = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  return base;
}

function fairMarketValue(pos: string, ovr: number, devTrait: string = 'Normal'): number {
  return Math.round(interpolateMarket(pos, ovr) * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

// Asking price = market value adjusted for age leverage
function askingPrice(pos: string, ovr: number, devTrait: string, age: number): number {
  const mv = fairMarketValue(pos, ovr, devTrait);
  const ageMul = age <= 28 ? 1.10 : age <= 32 ? 1.00 : 0.90;
  return Math.round(mv * ageMul * 10) / 10;
}

function contractGrade(salary: number, pos: string, ovr: number, devTrait: string = 'Normal'): { label: string; color: string } | null {
  if (devTrait === 'X-Factor' || devTrait === 'Superstar') return null;
  const fairValue = interpolateMarket(pos, ovr);
  const ratio = salary / Math.max(fairValue, 1);
  if (ratio < 0.70) return { label: 'TEAM DEAL', color: '#4caf50' };
  if (ratio > 2.00) return { label: 'OVERPAID',  color: '#e57373' };
  return null;
}

type Decision = 'pending' | 'resigned' | 'walking';

export default function Franchise({ userTeam, currentSeason }: Props) {
  const [contracts,       setContracts]       = useState<Contract[]>([]);
  const [practiceSquad,   setPracticeSquad]   = useState<PracticePlayer[]>([]);
  const [freeAgents,      setFreeAgents]      = useState<FreeAgent[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Contract[]>([]);
  const [cap,             setCap]             = useState<CapSummary | null>(null);
  const [rosterSpots,     setRosterSpots]     = useState<RosterSpots | null>(null);
  const [posFilter,       setPosFilter]       = useState('ALL');
  const [faPos,           setFaPos]           = useState('ALL');
  const [sortBy,          setSortBy]          = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [activeTab,       setActiveTab]       = useState<'roster' | 'ps' | 'fa' | 'offseason'>('roster');
  const [extendingId,     setExtendingId]     = useState<number | null>(null);
  const [extendYears,     setExtendYears]     = useState(3);
  const [extendSalary,    setExtendSalary]    = useState('');
  const [releasingId,     setReleasingId]     = useState<number | null>(null);
  const [signingId,       setSigningId]       = useState<number | null>(null);
  const [signYears,       setSignYears]       = useState(2);
  const [signSalary,      setSignSalary]      = useState('');
  const [resigningId,     setResigningId]     = useState<number | null>(null);
  const [resignYears,     setResignYears]     = useState(3);
  const [resignSalary,    setResignSalary]    = useState('');
  const [playerDecisions, setPlayerDecisions] = useState<Record<number, Decision>>({});
  const [working,         setWorking]         = useState(false);
  const [toast,           setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { loadData(); }, [userTeam.id]);

  useEffect(() => {
    if (activeTab === 'fa') loadFreeAgents();
    if (activeTab === 'offseason') loadExpiringContracts();
  }, [activeTab, faPos]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    const [c, s, ps, spots] = await Promise.all([
      window.api.getTeamContracts(userTeam.id),
      window.api.getCapSummary(userTeam.id),
      window.api.getPracticeSquad(userTeam.id),
      window.api.getRosterSpots(userTeam.id),
    ]);
    setContracts(c);
    setCap(s);
    setPracticeSquad(ps);
    setRosterSpots(spots);
  };

  const loadFreeAgents = async () => {
    const fa = await window.api.getFreeAgents(faPos === 'ALL' ? undefined : faPos);
    setFreeAgents(fa);
  };

  const loadExpiringContracts = async () => {
    const exp = await window.api.getExpiringContracts();
    setExpiringPlayers(exp);
    const decisions: Record<number, Decision> = {};
    exp.forEach((p: Contract) => { decisions[p.id] = 'pending'; });
    setPlayerDecisions(decisions);
  };

  const openExtend = (contract: Contract) => {
    setExtendingId(contract.id);
    setReleasingId(null);
    setExtendYears(Math.min(contract.years_remaining + 2, 5));
    setExtendSalary(contract.annual_salary.toFixed(1));
  };

  const openSign = (fa: FreeAgent) => {
    setSigningId(fa.id);
    const mv = fairMarketValue(fa.position, fa.overall_rating, fa.dev_trait);
    setSignYears(fa.age <= 26 ? 3 : fa.age <= 30 ? 2 : 1);
    setSignSalary(mv.toFixed(1));
  };

  const openResign = (player: Contract) => {
    setResigningId(player.id);
    const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
    setResignYears(player.age <= 26 ? 4 : player.age <= 30 ? 3 : player.age <= 33 ? 2 : 1);
    setResignSalary(ap.toFixed(1));
  };

  const handleExtend = async () => {
    if (!extendingId || working) return;
    const salary = parseFloat(extendSalary);
    if (isNaN(salary) || salary <= 0) return;
    const current = contracts.find(c => c.id === extendingId);
    const capImpact = salary - (current?.annual_salary ?? 0);
    if (cap && capImpact > cap.available_cap + 0.1) {
      showToast(`Not enough cap space. Need $${capImpact.toFixed(1)}M more.`, 'error');
      return;
    }
    setWorking(true);
    await window.api.extendPlayer({ playerId: extendingId, years: extendYears, salary });
    setExtendingId(null);
    showToast('Contract extended successfully.', 'success');
    await loadData();
    setWorking(false);
  };

  const handleRelease = async () => {
    if (!releasingId || working) return;
    const player = contracts.find(c => c.id === releasingId);
    setWorking(true);
    await window.api.releasePlayer(releasingId);
    setReleasingId(null);
    showToast(`${player?.first_name} ${player?.last_name} released.`, 'error');
    await loadData();
    if (activeTab === 'fa') loadFreeAgents();
    setWorking(false);
  };

  const handleSign = async () => {
    if (!signingId || working) return;
    const salary = parseFloat(signSalary);
    if (isNaN(salary) || salary <= 0) return;
    const signingPlayer = freeAgents.find(f => f.id === signingId);
    setWorking(true);
    const result = await window.api.signFreeAgent({ playerId: signingId, years: signYears, salary });
    if (!result.success) {
      showToast(result.reason ?? 'Could not sign player.', 'error');
      setWorking(false);
      return;
    }
    setSigningId(null);
    showToast(`${signingPlayer?.first_name} ${signingPlayer?.last_name} signed!`, 'success');
    await loadData();
    await loadFreeAgents();
    setWorking(false);
  };

  const handleResign = async () => {
    if (!resigningId || working) return;
    const salary = parseFloat(resignSalary);
    if (isNaN(salary) || salary <= 0) return;
    const player = expiringPlayers.find(p => p.id === resigningId);
    setWorking(true);
    const result = await window.api.resignPlayer({ playerId: resigningId, years: resignYears, salary });
    if (!result.success) {
      showToast(result.reason ?? 'Player declined the offer.', 'error');
      setWorking(false);
      return;
    }
    setPlayerDecisions(prev => ({ ...prev, [resigningId]: 'resigned' }));
    setResigningId(null);
    showToast(`${player?.first_name} ${player?.last_name} re-signed — ${resignYears}yr / ${fmtSalary(salary)}`, 'success');
    await loadData();
    setWorking(false);
  };

  const handleLetWalk = (playerId: number) => {
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'walking' }));
    setResigningId(null);
    const player = expiringPlayers.find(p => p.id === playerId);
    showToast(`${player?.first_name} ${player?.last_name} will hit free agency.`, 'error');
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

  const filteredFa    = freeAgents.filter(f => faPos === 'ALL' || f.position === faPos);
  const expiringCount = contracts.filter(c => c.years_remaining === 1).length;
  const capPct        = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor      = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);
  const currentExtend   = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const extendSalaryNum = parseFloat(extendSalary) || 0;
  const capDelta        = currentExtend ? extendSalaryNum - currentExtend.annual_salary : 0;
  const newAvailable    = cap ? cap.available_cap - capDelta : 0;
  const signingPlayer   = signingId ? freeAgents.find(f => f.id === signingId) : null;
  const signSalaryNum   = parseFloat(signSalary) || 0;
  const signCapLeft     = cap ? cap.available_cap - signSalaryNum : 0;
  const resignSalaryNum = parseFloat(resignSalary) || 0;
  const resignCapLeft   = cap ? cap.available_cap - resignSalaryNum : 0;
  const pendingCount    = Object.values(playerDecisions).filter(d => d === 'pending').length;

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          padding: '12px 20px', borderRadius: 8, maxWidth: 380,
          background: toast.type === 'error' ? '#1a0808' : '#081a08',
          border: `1px solid ${toast.type === 'error' ? '#e57373' : '#4caf50'}`,
          color: toast.type === 'error' ? '#e57373' : '#4caf50',
          fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>{toast.type === 'error' ? '✗' : '✓'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 1 }}>Franchise Management</div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{userTeam.city} {userTeam.name} · {currentSeason} Season</div>
      </div>

      {/* Cap Bar */}
      {cap && (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#444', letterSpacing: 2 }}>SALARY CAP</span>
            <span style={{ fontSize: 18, fontWeight: 'bold', color: capColor }}>{fmtSalary(cap.used_cap)} used</span>
            <span style={{ color: '#333' }}>/</span>
            <span style={{ fontSize: 14, color: '#666' }}>{fmtSalary(cap.total_cap)} cap</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 'bold', color: cap.available_cap < 0 ? '#e57373' : '#4caf50' }}>
              {cap.available_cap < 0 ? '⚠ OVER CAP ' : ''}{fmtSalary(cap.available_cap)}{cap.available_cap >= 0 ? ' available' : ''}
            </span>
          </div>
          <div style={{ background: '#0d0d0d', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(capPct, 100)}%`, height: '100%', background: capColor, borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#444' }}>
            <span>Guaranteed on books: <span style={{ color: '#666' }}>{fmtSalary(totalGuaranteed)}</span></span>
            {expiringCount > 0 && <span style={{ color: '#FF8740' }}>⚠ {expiringCount} expiring this offseason</span>}
            {rosterSpots && <span style={{ marginLeft: 'auto' }}>{rosterSpots.active}/53 active · {rosterSpots.ps}/16 PS</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { key: 'roster',    label: `ACTIVE ROSTER (${contracts.length})`,  warn: false },
          { key: 'ps',        label: `PRACTICE SQUAD (${practiceSquad.length})`, warn: false },
          { key: 'fa',        label: 'FREE AGENTS',                           warn: false },
          { key: 'offseason', label: expiringCount > 0 ? `OFFSEASON ⚠ ${expiringCount}` : 'OFFSEASON', warn: expiringCount > 0 },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '5px 16px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 4,
            background: activeTab === tab.key ? (tab.warn ? '#FF8740' : '#FF8740') : (tab.warn ? '#1a1000' : '#111'),
            border: `1px solid ${activeTab === tab.key ? '#FF8740' : tab.warn ? '#FF8740' : '#222'}`,
            color: activeTab === tab.key ? '#000' : tab.warn ? '#FF8740' : '#555',
            fontWeight: activeTab === tab.key || tab.warn ? 'bold' : 'normal',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── Active Roster ── */}
      {activeTab === 'roster' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)} style={{
                  padding: '3px 9px', background: posFilter === pos ? '#FF8740' : '#141414',
                  border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`, borderRadius: 3,
                  color: posFilter === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
                  fontWeight: posFilter === pos ? 'bold' : 'normal',
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 160px 100px 120px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>SALARY / GTD</span><span>YEARS</span><span />
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No contracts found</div>
          ) : filtered.map(contract => {
            const isExpiring  = contract.years_remaining === 1;
            const trait       = TRAIT_META[contract.dev_trait] ?? TRAIT_META['Normal'];
            const traj        = trajectory(contract.age);
            const isExtending = extendingId === contract.id;
            const isReleasing = releasingId === contract.id;
            const grade       = contractGrade(contract.annual_salary, contract.position, contract.overall_rating, contract.dev_trait);
            const gtdPct      = contract.guaranteed_pct ?? 0;

            return (
              <div key={contract.id} style={{ borderBottom: '1px solid #111', background: isExtending || isReleasing ? '#0f0f0f' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 160px 100px 120px', gap: 8, padding: '8px 12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: 13 }}>{contract.first_name} {contract.last_name}</span>
                      {trait.short && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>{trait.short}</span>}
                      {grade && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: grade.color + '22', color: grade.color, fontWeight: 'bold', letterSpacing: 1 }}>{grade.label}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{contract.position_label || contract.position}</div>
                  </div>
                  <div>
                    <span style={{ color: traj.color, fontSize: 12 }}>{contract.age} {traj.label}</span>
                    <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(contract.overall_rating) }}>{contract.overall_rating}</span>
                  </div>
                  <div style={{ fontSize: 11, color: TRAIT_META[contract.dev_trait]?.color ?? '#444' }}>
                    {contract.dev_trait === 'Normal' ? '—' : contract.dev_trait}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ccc' }}>{fmtSalary(contract.annual_salary)}</div>
                    {gtdPct > 0 && (
                      <div style={{ fontSize: 10, color: gtdPct >= 60 ? '#4caf50' : gtdPct >= 35 ? '#FF8740' : '#555', marginTop: 1 }}>
                        {fmtSalary(contract.guaranteed_amount ?? 0)} GTD · {gtdPct.toFixed(0)}%
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                      {Array.from({ length: contract.years_total }).map((_, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < contract.years_remaining ? (isExpiring ? '#e57373' : '#4caf50') : '#1a1a1a' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: isExpiring ? '#e57373' : '#555' }}>{contract.years_remaining}yr{isExpiring ? ' ⚠' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => isExtending ? setExtendingId(null) : openExtend(contract)} style={{ padding: '4px 10px', background: isExtending ? '#1a3a1a' : '#141414', border: `1px solid ${isExtending ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: isExtending ? '#4caf50' : '#555', fontSize: 11, cursor: 'pointer' }}>
                      {isExtending ? 'Cancel' : 'Extend'}
                    </button>
                    <button onClick={() => isReleasing ? setReleasingId(null) : (setReleasingId(contract.id), setExtendingId(null))} style={{ padding: '4px 10px', background: isReleasing ? '#3a0a0a' : '#141414', border: `1px solid ${isReleasing ? '#e57373' : '#2a2a2a'}`, borderRadius: 4, color: isReleasing ? '#e57373' : '#555', fontSize: 11, cursor: 'pointer' }}>
                      {isReleasing ? 'Cancel' : 'Cut'}
                    </button>
                  </div>
                </div>

                {isExtending && currentExtend && (
                  <div style={{ margin: '0 12px 12px', padding: '14px 18px', background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#4caf50', letterSpacing: 2, marginBottom: 12 }}>OFFER EXTENSION — {contract.first_name} {contract.last_name}</div>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setExtendYears(y)} style={{ width: 32, height: 32, background: extendYears === y ? '#4caf50' : '#141414', border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: extendYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555' }}>$</span>
                          <input type="number" value={extendSalary} onChange={e => setExtendSalary(e.target.value)} min="0.1" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555' }}>M</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>CAP IMPACT</div>
                        <div style={{ fontSize: 13, color: capDelta > 0 ? '#e57373' : '#4caf50' }}>{capDelta > 0 ? '+' : ''}{fmtSalary(capDelta)} vs current</div>
                        <div style={{ fontSize: 11, color: '#444', marginTop: 3 }}>{fmtSalary(Math.max(0, newAvailable))} remaining after</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button onClick={handleExtend} disabled={working} style={{ padding: '8px 20px', background: '#1a3a1a', border: '1px solid #4caf50', borderRadius: 4, color: '#4caf50', fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}>
                          {working ? '...' : 'Confirm Extension'}
                        </button>
                      </div>
                    </div>
                    {newAvailable < 0 && <div style={{ marginTop: 10, fontSize: 11, color: '#e57373' }}>Over cap by {fmtSalary(Math.abs(newAvailable))} — reduce salary or cut a player first.</div>}
                  </div>
                )}

                {isReleasing && (
                  <div style={{ margin: '0 12px 12px', padding: '12px 18px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: '#e57373', marginBottom: 10 }}>Release {contract.first_name} {contract.last_name}? Frees {fmtSalary(contract.annual_salary)} in cap space.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleRelease} disabled={working} style={{ padding: '6px 16px', background: '#3a0a0a', border: '1px solid #e57373', borderRadius: 4, color: '#e57373', fontSize: 12, cursor: 'pointer' }}>
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
            <div style={{ marginTop: 12, fontSize: 11, color: '#333', textAlign: 'right' }}>
              {filtered.length} player{filtered.length !== 1 ? 's' : ''} · {fmtSalary(filtered.reduce((s, c) => s + c.annual_salary, 0))} shown
            </div>
          )}
        </>
      )}

      {/* ── Practice Squad ── */}
      {activeTab === 'ps' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>SALARY</span>
          </div>
          {practiceSquad.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No practice squad players</div>
          ) : practiceSquad.map(p => {
            const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
            const traj  = trajectory(p.age);
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px', gap: 8, padding: '8px 12px', borderBottom: '1px solid #111', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#ddd', fontSize: 13 }}>{p.first_name} {p.last_name}</span>
                    {trait.short && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>{trait.short}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{p.position_label || p.position}</div>
                </div>
                <div>
                  <span style={{ color: traj.color, fontSize: 12 }}>{p.age} {traj.label}</span>
                  <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(p.overall_rating) }}>{p.overall_rating}</span>
                </div>
                <div style={{ fontSize: 11, color: trait.color }}>{p.dev_trait === 'Normal' ? '—' : p.dev_trait}</div>
                <div style={{ fontSize: 12, color: '#555' }}>{fmtSalary(p.annual_salary ?? 1.165)}</div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, fontSize: 11, color: '#333', textAlign: 'right' }}>{practiceSquad.length} / 16 practice squad slots used</div>
        </div>
      )}

      {/* ── Free Agents ── */}
      {activeTab === 'fa' && (
        <div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
            {POSITIONS.map(pos => (
              <button key={pos} onClick={() => { setFaPos(pos); setSigningId(null); }} style={{
                padding: '3px 9px', background: faPos === pos ? '#4FC3F7' : '#141414',
                border: `1px solid ${faPos === pos ? '#4FC3F7' : '#222'}`, borderRadius: 3,
                color: faPos === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
                fontWeight: faPos === pos ? 'bold' : 'normal',
              }}>{pos}</button>
            ))}
          </div>

          {rosterSpots && cap && (
            <div style={{ display: 'flex', gap: 20, padding: '8px 12px', background: '#111', borderRadius: 6, marginBottom: 14, fontSize: 11 }}>
              <span style={{ color: rosterSpots.activeFree > 0 ? '#4caf50' : '#e57373' }}>
                Active roster: {rosterSpots.active}/53 · {rosterSpots.activeFree > 0 ? `${rosterSpots.activeFree} open` : 'FULL'}
              </span>
              <span style={{ color: cap.available_cap > 0 ? '#4caf50' : '#e57373' }}>
                Cap space: {fmtSalary(cap.available_cap)} {cap.available_cap < 0 ? '(OVER)' : 'available'}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px 80px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>MARKET VALUE</span><span />
          </div>

          {filteredFa.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No free agents found</div>
          ) : filteredFa.map(fa => {
            const trait     = TRAIT_META[fa.dev_trait] ?? TRAIT_META['Normal'];
            const traj      = trajectory(fa.age);
            const mv        = fairMarketValue(fa.position, fa.overall_rating, fa.dev_trait);
            const isSigning = signingId === fa.id;

            return (
              <div key={fa.id} style={{ borderBottom: '1px solid #111', background: isSigning ? '#0a0f1a' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 120px 80px', gap: 8, padding: '8px 12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: 13 }}>{fa.first_name} {fa.last_name}</span>
                      {trait.short && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>{trait.short}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{fa.position_label || fa.position}</div>
                  </div>
                  <div>
                    <span style={{ color: traj.color, fontSize: 12 }}>{fa.age} {traj.label}</span>
                    <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(fa.overall_rating) }}>{fa.overall_rating}</span>
                  </div>
                  <div style={{ fontSize: 11, color: trait.color }}>{fa.dev_trait === 'Normal' ? '—' : fa.dev_trait}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{fmtSalary(mv)}/yr</div>
                  <div>
                    <button onClick={() => isSigning ? setSigningId(null) : openSign(fa)}
                      disabled={!!(rosterSpots && rosterSpots.activeFree <= 0)}
                      style={{
                        padding: '4px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                        background: isSigning ? '#0a1a3a' : '#141414',
                        border: `1px solid ${isSigning ? '#4FC3F7' : rosterSpots && rosterSpots.activeFree <= 0 ? '#1a1a1a' : '#2a2a2a'}`,
                        color: isSigning ? '#4FC3F7' : rosterSpots && rosterSpots.activeFree <= 0 ? '#2a2a2a' : '#555',
                      }}>
                      {isSigning ? 'Cancel' : 'Sign'}
                    </button>
                  </div>
                </div>

                {isSigning && signingPlayer && (
                  <div style={{ margin: '0 12px 12px', padding: '14px 18px', background: '#07101a', border: '1px solid #1a3a5a', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#4FC3F7', letterSpacing: 2, marginBottom: 12 }}>OFFER CONTRACT — {fa.first_name} {fa.last_name}</div>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setSignYears(y)} style={{ width: 32, height: 32, background: signYears === y ? '#4FC3F7' : '#141414', border: `1px solid ${signYears === y ? '#4FC3F7' : '#2a2a2a'}`, borderRadius: 4, color: signYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555' }}>$</span>
                          <input type="number" value={signSalary} onChange={e => setSignSalary(e.target.value)} min="0.9" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555' }}>M</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>Market: {fmtSalary(mv)}/yr</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>CAP AFTER SIGNING</div>
                        <div style={{ fontSize: 13, color: signCapLeft < 0 ? '#e57373' : '#4caf50' }}>{fmtSalary(signCapLeft)} remaining</div>
                        <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>
                          {rosterSpots && `${rosterSpots.activeFree - 1} roster spot${rosterSpots.activeFree - 1 !== 1 ? 's' : ''} left after`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button onClick={handleSign} disabled={working || signCapLeft < 0} style={{
                          padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 'bold',
                          cursor: signCapLeft < 0 ? 'not-allowed' : 'pointer',
                          background: signCapLeft < 0 ? '#1a1a1a' : '#071a2a',
                          border: `1px solid ${signCapLeft < 0 ? '#2a2a2a' : '#4FC3F7'}`,
                          color: signCapLeft < 0 ? '#333' : '#4FC3F7',
                        }}>
                          {working ? '...' : signCapLeft < 0 ? 'OVER CAP' : 'Confirm Signing'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 12, fontSize: 11, color: '#333', textAlign: 'right' }}>
            {filteredFa.length} free agent{filteredFa.length !== 1 ? 's' : ''} shown (top 200 by OVR)
          </div>
        </div>
      )}

      {/* ── Offseason / Re-signing ── */}
      {activeTab === 'offseason' && (
        <div>
          {/* Header */}
          <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#FF8740', fontWeight: 'bold', marginBottom: 4 }}>
              RE-SIGNING WINDOW
            </div>
            <div style={{ fontSize: 11, color: '#555' }}>
              {expiringPlayers.length === 0
                ? 'No players entering the final year of their contract.'
                : `${expiringPlayers.length} player${expiringPlayers.length !== 1 ? 's' : ''} in the final year of their contract. Make your decisions before advancing the season.`}
            </div>
            {expiringPlayers.length > 0 && (
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11 }}>
                <span style={{ color: '#4caf50' }}>✓ {Object.values(playerDecisions).filter(d => d === 'resigned').length} re-signed</span>
                <span style={{ color: '#e57373' }}>→ {Object.values(playerDecisions).filter(d => d === 'walking').length} letting walk</span>
                <span style={{ color: '#FF8740' }}>⏳ {pendingCount} pending decision</span>
              </div>
            )}
          </div>

          {expiringPlayers.length === 0 ? (
            <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>
              No expiring contracts — you're good to advance the season.
            </div>
          ) : expiringPlayers.map(player => {
            const decision    = playerDecisions[player.id] ?? 'pending';
            const trait       = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
            const traj        = trajectory(player.age);
            const ap          = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
            const isResigning = resigningId === player.id;

            const decisionColor =
              decision === 'resigned' ? '#4caf50' :
              decision === 'walking'  ? '#e57373' : '#FF8740';

            const decisionLabel =
              decision === 'resigned' ? 'RE-SIGNED' :
              decision === 'walking'  ? 'LETTING WALK' : 'PENDING';

            return (
              <div key={player.id} style={{
                borderBottom: '1px solid #111',
                background: isResigning ? '#0a0f0a' : 'transparent',
                opacity: decision === 'resigned' ? 0.6 : 1,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 130px 110px 160px', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
                  {/* Player */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: 13 }}>{player.first_name} {player.last_name}</span>
                      {trait.short && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold', letterSpacing: 1 }}>{trait.short}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{player.position_label || player.position}</div>
                  </div>

                  {/* Age / OVR */}
                  <div>
                    <span style={{ color: traj.color, fontSize: 12 }}>{player.age} {traj.label}</span>
                    <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 12, fontWeight: 'bold', color: ratingColor(player.overall_rating) }}>{player.overall_rating}</span>
                  </div>

                  {/* Dev */}
                  <div style={{ fontSize: 11, color: trait.color }}>{player.dev_trait === 'Normal' ? '—' : player.dev_trait}</div>

                  {/* Current salary */}
                  <div>
                    <div style={{ fontSize: 11, color: '#444' }}>Current</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{fmtSalary(player.annual_salary)}/yr</div>
                  </div>

                  {/* Asking price */}
                  <div>
                    <div style={{ fontSize: 11, color: '#444' }}>Asking ~</div>
                    <div style={{ fontSize: 13, color: '#FF8740', fontWeight: 'bold' }}>{fmtSalary(ap)}/yr</div>
                  </div>

                  {/* Decision status + actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: decisionColor + '22', color: decisionColor, fontWeight: 'bold', letterSpacing: 1 }}>
                      {decisionLabel}
                    </span>
                    {decision === 'pending' && (
                      <>
                        <button onClick={() => isResigning ? setResigningId(null) : openResign(player)} style={{
                          padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                          background: isResigning ? '#1a3a1a' : '#141414',
                          border: `1px solid ${isResigning ? '#4caf50' : '#2a2a2a'}`,
                          color: isResigning ? '#4caf50' : '#555',
                        }}>{isResigning ? 'Cancel' : 'Re-Sign'}</button>
                        <button onClick={() => handleLetWalk(player.id)} style={{
                          padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                          background: '#141414', border: '1px solid #2a2a2a', color: '#555',
                        }}>Let Walk</button>
                      </>
                    )}
                    {decision === 'walking' && (
                      <button onClick={() => setPlayerDecisions(prev => ({ ...prev, [player.id]: 'pending' }))} style={{
                        padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                        background: '#141414', border: '1px solid #2a2a2a', color: '#555',
                      }}>Undo</button>
                    )}
                  </div>
                </div>

                {/* Re-sign offer panel */}
                {isResigning && decision === 'pending' && (
                  <div style={{ margin: '0 12px 14px', padding: '14px 18px', background: '#081a08', border: '1px solid #1a4a1a', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#4caf50', letterSpacing: 2, marginBottom: 12 }}>
                      RE-SIGN OFFER — {player.first_name} {player.last_name}
                    </div>
                    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setResignYears(y)} style={{ width: 32, height: 32, background: resignYears === y ? '#4caf50' : '#141414', border: `1px solid ${resignYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: resignYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555' }}>$</span>
                          <input type="number" value={resignSalary} onChange={e => setResignSalary(e.target.value)} min="0.9" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555' }}>M</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>Asking: ~{fmtSalary(ap)}/yr</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#444', marginBottom: 6 }}>CAP AFTER SIGNING</div>
                        <div style={{ fontSize: 13, color: resignCapLeft < 0 ? '#e57373' : '#4caf50' }}>{fmtSalary(resignCapLeft)} remaining</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button onClick={handleResign} disabled={working || resignCapLeft < 0} style={{
                          padding: '8px 20px', borderRadius: 4, fontSize: 12, fontWeight: 'bold',
                          cursor: resignCapLeft < 0 ? 'not-allowed' : 'pointer',
                          background: resignCapLeft < 0 ? '#1a1a1a' : '#081a08',
                          border: `1px solid ${resignCapLeft < 0 ? '#2a2a2a' : '#4caf50'}`,
                          color: resignCapLeft < 0 ? '#333' : '#4caf50',
                        }}>
                          {working ? '...' : resignCapLeft < 0 ? 'OVER CAP' : 'Confirm Re-Sign'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {expiringPlayers.length > 0 && (
            <div style={{ marginTop: 20, padding: '12px 16px', background: '#111', borderRadius: 6, fontSize: 11, color: '#555' }}>
              Once you've made your decisions, advance the season from the main menu. Players marked "Letting Walk" will automatically become free agents when the season advances.
            </div>
          )}
        </div>
      )}

    </div>
  );
}