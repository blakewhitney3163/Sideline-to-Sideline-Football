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
    const [lowOvr, lowSal] = rates[i + 1];
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
  if (ratio > 2.00) return { label: 'OVERPAID', color: '#e57373' };
  return null;
}

type Decision = 'pending' | 'resigned' | 'walking';

export default function Franchise({ userTeam, currentSeason }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [practiceSquad, setPracticeSquad] = useState<PracticePlayer[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Contract[]>([]);
  const [cap, setCap] = useState<CapSummary | null>(null);
  const [rosterSpots, setRosterSpots] = useState<RosterSpots | null>(null);
  const [posFilter, setPosFilter] = useState('ALL');
  const [faPos, setFaPos] = useState('ALL');
  const [faSortBy, setFaSortBy] = useState<'ovr' | 'age' | 'value'>('ovr');
  const [sortBy, setSortBy] = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [activeTab, setActiveTab] = useState<'roster' | 'ps' | 'fa' | 'offseason'>('roster');
  const [extendingId, setExtendingId] = useState<number | null>(null);
  const [extendYears, setExtendYears] = useState(3);
  const [extendSalary, setExtendSalary] = useState('');
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [signingId, setSigningId] = useState<number | null>(null);
  const [signYears, setSignYears] = useState(2);
  const [signSalary, setSignSalary] = useState('');
  const [resigningId, setResigningId] = useState<number | null>(null);
  const [resignYears, setResignYears] = useState(3);
  const [resignSalary, setResignSalary] = useState('');
  const [playerDecisions, setPlayerDecisions] = useState<Record<number, Decision>>({});
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [faSearch, setFaSearch] = useState('');
  const [cpuFaResult, setCpuFaResult] = useState<{ totalSigned: number; teamsActive: number } | null>(null);
  const [cpuFaDone, setCpuFaDone] = useState(false);

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

  const handleLetWalk = async (playerId: number) => {
    const player = expiringPlayers.find(p => p.id === playerId);
    setWorking(true);
    await window.api.releasePlayer(playerId);
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'walking' }));
    setResigningId(null);
    showToast(`${player?.first_name} ${player?.last_name} released to free agency.`, 'error');
    await loadData();
    await loadExpiringContracts();
    setWorking(false);
  };

  const handleCpuFa = async () => {
    if (working) return;
    setWorking(true);
    const result = await window.api.cpuFaSigning();
    setCpuFaResult(result);
    setCpuFaDone(true);
    showToast(`CPU free agency complete — ${result.totalSigned} players signed across ${result.teamsActive} teams.`, 'success');
    await loadFreeAgents();
    setWorking(false);
  };

  const filtered = contracts
    .filter(c => posFilter === 'ALL' || c.position === posFilter)
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

  const filteredFa = freeAgents
    .filter(f => faPos === 'ALL' || f.position === faPos)
    .filter(f => {
      if (!faSearch.trim()) return true;
      const q = faSearch.toLowerCase();
      return `${f.first_name} ${f.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (faSortBy === 'age') return a.age - b.age;
      if (faSortBy === 'value') return fairMarketValue(b.position, b.overall_rating, b.dev_trait) - fairMarketValue(a.position, a.overall_rating, a.dev_trait);
      return b.overall_rating - a.overall_rating;
    });

  const expiringCount = contracts.filter(c => c.years_remaining === 1).length;
  const capPct = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);
  const currentExtend = extendingId ? contracts.find(c => c.id === extendingId) : null;
  const extendSalaryNum = parseFloat(extendSalary) || 0;
  const capDelta = currentExtend ? extendSalaryNum - currentExtend.annual_salary : 0;
  const newAvailable = cap ? cap.available_cap - capDelta : 0;
  const signingPlayer = signingId ? freeAgents.find(f => f.id === signingId) : null;
  const signSalaryNum = parseFloat(signSalary) || 0;
  const signCapLeft = cap ? cap.available_cap - signSalaryNum : 0;
  const resignSalaryNum = parseFloat(resignSalary) || 0;
  const resignCapLeft = cap ? cap.available_cap - resignSalaryNum : 0;
  const pendingCount = Object.values(playerDecisions).filter(d => d === 'pending').length;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 1000,
          background: toast.type === 'error' ? '#2a0a0a' : '#0a2a0a',
          border: `1px solid ${toast.type === 'error' ? '#e57373' : '#4caf50'}`,
          borderRadius: 6, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          color: toast.type === 'error' ? '#e57373' : '#4caf50', fontSize: 13, maxWidth: 380,
        }}>
          <span style={{ fontWeight: 'bold' }}>{toast.type === 'error' ? '✗' : '✓'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Franchise Management</h1>
        <p style={{ color: '#444', fontSize: 12, margin: '2px 0 0' }}>{userTeam.city} {userTeam.name} · {currentSeason} Season</p>
      </div>

      {/* Cap Bar */}
      {cap && (
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ color: '#444', fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>SALARY CAP</span>
            <span style={{ color: capColor, fontSize: 14, fontWeight: 700 }}>{fmtSalary(cap.used_cap)} used</span>
            <span style={{ color: '#333', fontSize: 12 }}>/</span>
            <span style={{ color: '#555', fontSize: 12 }}>{fmtSalary(cap.total_cap)} cap</span>
            <span style={{ marginLeft: 'auto', color: cap.available_cap < 0 ? '#e57373' : '#4caf50', fontWeight: 700, fontSize: 13 }}>
              {cap.available_cap < 0 ? '⚠ OVER CAP ' : ''}{fmtSalary(cap.available_cap)}{cap.available_cap >= 0 ? ' available' : ''}
            </span>
          </div>
          <div style={{ background: '#1a1a1a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ background: capColor, height: '100%', width: `${Math.min(capPct, 100)}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#444' }}>
            <span>Guaranteed on books: {fmtSalary(totalGuaranteed)}</span>
            {expiringCount > 0 && <span style={{ color: '#FF8740' }}>⚠ {expiringCount} expiring this offseason</span>}
            {rosterSpots && <span>{rosterSpots.active}/53 active · {rosterSpots.ps}/16 PS</span>}
          </div>
        </div>
      )}

      {/* OTC Import */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={async () => {
            const result = await window.api.importOtcContracts();
            if (result.success) {
              showToast(`OTC: ${result.matched}/${result.total} contracts updated`, 'success');
              loadData();
            } else {
              showToast(result.reason ?? 'OTC import failed', 'error');
            }
          }}
          style={{
            padding: '5px 14px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 4,
            background: '#0a1a0a', border: '1px solid #4caf50', color: '#4caf50', fontWeight: 'bold',
          }}
        >IMPORT OTC CONTRACTS</button>
        <span style={{ color: '#333', fontSize: 10, marginLeft: 10 }}>otc-contracts.htm detected in repo root</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'roster',    label: `ACTIVE ROSTER (${contracts.length})`,                          warn: false },
          { key: 'ps',        label: `PRACTICE SQUAD (${practiceSquad.length})`,                     warn: false },
          { key: 'fa',        label: 'FREE AGENTS',                                                   warn: false },
          { key: 'offseason', label: expiringCount > 0 ? `OFFSEASON ⚠ ${expiringCount}` : 'OFFSEASON', warn: expiringCount > 0 },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '5px 16px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 4,
            background: activeTab === tab.key ? '#FF8740' : (tab.warn ? '#1a1000' : '#111'),
            border: `1px solid ${activeTab === tab.key ? '#FF8740' : tab.warn ? '#FF8740' : '#222'}`,
            color: activeTab === tab.key ? '#000' : tab.warn ? '#FF8740' : '#555',
            fontWeight: activeTab === tab.key || tab.warn ? 'bold' : 'normal',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── Active Roster ── */}
      {activeTab === 'roster' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
              placeholder="Search player..."
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              style={{
                background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
                color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px auto', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>SALARY / GTD</span><span style={{ gridColumn: '5' }}>YEARS</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: '#333', padding: '20px 12px', fontSize: 13 }}>No contracts found</div>
          ) : filtered.map(contract => {
            const isExpiring = contract.years_remaining === 1;
            const trait = TRAIT_META[contract.dev_trait] ?? TRAIT_META['Normal'];
            const traj = trajectory(contract.age);
            const isExtending = extendingId === contract.id;
            const isReleasing = releasingId === contract.id;
            const grade = contractGrade(contract.annual_salary, contract.position, contract.overall_rating, contract.dev_trait);
            const gtdPct = contract.guaranteed_pct ?? 0;

            return (
              <div key={contract.id} style={{ borderBottom: '1px solid #0d0d0d', background: isExpiring ? '#120900' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{contract.first_name} {contract.last_name}</span>
                      {trait.short && <span style={{ background: trait.color, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                      {grade && <span style={{ color: grade.color, fontSize: 9, fontWeight: 700 }}>{grade.label}</span>}
                    </div>
                    <span style={{ color: '#444', fontSize: 11 }}>{contract.position_label || contract.position}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
                    <span style={{ color: traj.color, fontSize: 12 }}>{contract.age} {traj.label}</span>
                    <span style={{ color: ratingColor(contract.overall_rating), fontWeight: 700, fontSize: 14 }}>{contract.overall_rating}</span>
                  </div>
                  <div style={{ width: 70, color: '#555', fontSize: 11, textAlign: 'center' }}>
                    {contract.dev_trait === 'Normal' ? '—' : contract.dev_trait}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 110 }}>
                    <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{fmtSalary(contract.annual_salary)}</span>
                    {gtdPct > 0 && (
                      <span style={{ color: gtdPct >= 60 ? '#4caf50' : gtdPct >= 35 ? '#FF8740' : '#555', fontSize: 10, marginTop: 1 }}>
                        {fmtSalary(contract.guaranteed_amount ?? 0)} GTD · {gtdPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 90 }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: contract.years_total }).map((_, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < contract.years_remaining ? '#FF8740' : '#1a1a1a' }} />
                      ))}
                    </div>
                    <span style={{ color: isExpiring ? '#FF8740' : '#555', fontSize: 11, marginTop: 2 }}>{contract.years_remaining}yr{isExpiring ? ' ⚠' : ''}</span>
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
                  <div style={{ background: '#0a180a', border: '1px solid #1a3a1a', borderRadius: 6, margin: '0 12px 10px', padding: '12px 16px' }}>
                    <div style={{ color: '#4caf50', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>OFFER EXTENSION — {contract.first_name} {contract.last_name}</div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setExtendYears(y)} style={{ width: 32, height: 32, background: extendYears === y ? '#4caf50' : '#141414', border: `1px solid ${extendYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: extendYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555', fontSize: 13 }}>$</span>
                          <input type="number" value={extendSalary} onChange={e => setExtendSalary(e.target.value)} min="0.1" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555', fontSize: 13 }}>M</span>
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>CAP IMPACT</div>
                        <div style={{ color: capDelta > 0 ? '#e57373' : '#4caf50', fontSize: 13 }}>{capDelta > 0 ? '+' : ''}{fmtSalary(capDelta)} vs current</div>
                        <div style={{ color: '#555', fontSize: 11 }}>{fmtSalary(Math.max(0, newAvailable))} remaining after</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={handleExtend} disabled={working || newAvailable < 0} style={{ padding: '6px 16px', background: newAvailable < 0 ? '#1a1a1a' : '#1a3a1a', border: `1px solid ${newAvailable < 0 ? '#2a2a2a' : '#4caf50'}`, borderRadius: 4, color: newAvailable < 0 ? '#333' : '#4caf50', fontSize: 12, cursor: newAvailable < 0 ? 'not-allowed' : 'pointer' }}>
                        {working ? '...' : 'Confirm Extension'}
                      </button>
                      {newAvailable < 0 && <span style={{ color: '#e57373', fontSize: 11 }}>Over cap by {fmtSalary(Math.abs(newAvailable))} — reduce salary or cut a player first.</span>}
                    </div>
                  </div>
                )}

                {isReleasing && (
                  <div style={{ background: '#180a0a', border: '1px solid #3a1a1a', borderRadius: 6, margin: '0 12px 10px', padding: '12px 16px' }}>
                    <div style={{ color: '#e57373', fontSize: 12, marginBottom: 10 }}>Release {contract.first_name} {contract.last_name}? Frees {fmtSalary(contract.annual_salary)} in cap space.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleRelease} style={{ padding: '6px 16px', background: '#2a0a0a', border: '1px solid #e57373', borderRadius: 4, color: '#e57373', fontSize: 12, cursor: 'pointer' }}>
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
            <div style={{ color: '#333', fontSize: 11, padding: '10px 12px' }}>
              {filtered.length} player{filtered.length !== 1 ? 's' : ''} · {fmtSalary(filtered.reduce((s, c) => s + c.annual_salary, 0))} shown
            </div>
          )}
        </>
      )}

      {/* ── Practice Squad ── */}
      {activeTab === 'ps' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px auto', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>SALARY</span>
          </div>
          {practiceSquad.length === 0 ? (
            <div style={{ color: '#333', padding: '20px 12px', fontSize: 13 }}>No practice squad players</div>
          ) : practiceSquad.map(p => {
            const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
            const traj = trajectory(p.age);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #0d0d0d' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{p.first_name} {p.last_name}</span>
                    {trait.short && <span style={{ background: trait.color, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                  </div>
                  <span style={{ color: '#444', fontSize: 11 }}>{p.position_label || p.position}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
                  <span style={{ color: traj.color, fontSize: 12 }}>{p.age} {traj.label}</span>
                  <span style={{ color: ratingColor(p.overall_rating), fontWeight: 700, fontSize: 14 }}>{p.overall_rating}</span>
                </div>
                <div style={{ width: 70, color: '#555', fontSize: 11, textAlign: 'center' }}>{p.dev_trait === 'Normal' ? '—' : p.dev_trait}</div>
                <div style={{ width: 80, color: '#888', fontSize: 12 }}>{fmtSalary(p.annual_salary ?? 1.165)}</div>
                <button
                  onClick={async () => {
                    const result = await window.api.promoteFromPs(p.id);
                    if (result.success) {
                      showToast(`${result.name} promoted to active roster.`, 'success');
                      loadData();
                    } else {
                      showToast(result.reason ?? 'Could not promote.', 'error');
                    }
                  }}
                  disabled={!!(rosterSpots && rosterSpots.activeFree <= 0)}
                  style={{
                    padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                    background: '#0a1a0a', border: '1px solid #1a4a1a', color: '#4caf50',
                    opacity: rosterSpots && rosterSpots.activeFree <= 0 ? 0.3 : 1,
                  }}>
                  Promote
                </button>
              </div>
            );
          })}
          <div style={{ color: '#333', fontSize: 11, padding: '10px 12px' }}>{practiceSquad.length} / 16 practice squad slots used</div>
        </div>
      )}

      {/* ── Free Agents ── */}
      {activeTab === 'fa' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => { setFaPos(pos); setSigningId(null); }} style={{
                  padding: '3px 9px', background: faPos === pos ? '#4FC3F7' : '#141414',
                  border: `1px solid ${faPos === pos ? '#4FC3F7' : '#222'}`, borderRadius: 3,
                  color: faPos === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
                  fontWeight: faPos === pos ? 'bold' : 'normal',
                }}>{pos}</button>
              ))}
            </div>
            <select onChange={e => setFaSortBy(e.target.value as any)} value={faSortBy} style={{
              marginLeft: 'auto', background: '#161616', border: '1px solid #2a2a2a',
              borderRadius: 5, color: '#ccc', padding: '4px 10px', fontSize: 12,
            }}>
              <option value="ovr">Sort: OVR</option>
              <option value="value">Sort: Market Value</option>
              <option value="age">Sort: Age</option>
            </select>
            <input
              placeholder="Search player..."
              value={faSearch}
              onChange={e => setFaSearch(e.target.value)}
              style={{
                background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
                color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160,
              }}
            />
          </div>

          {rosterSpots && cap && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: rosterSpots.activeFree > 0 ? '#4caf50' : '#e57373' }}>
                Active roster: {rosterSpots.active}/53 · {rosterSpots.activeFree > 0 ? `${rosterSpots.activeFree} open` : 'FULL'}
              </span>
              <span style={{ color: cap.available_cap > 0 ? '#4caf50' : '#e57373' }}>
                Cap space: {fmtSalary(cap.available_cap)} {cap.available_cap < 0 ? '(OVER)' : 'available'}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 100px auto', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
            <span>PLAYER</span><span>AGE / OVR</span><span>DEV</span><span>MARKET VALUE</span>
          </div>

          {filteredFa.length === 0 ? (
            <div style={{ color: '#333', padding: '20px 12px', fontSize: 13 }}>No free agents found</div>
          ) : filteredFa.map(fa => {
            const trait = TRAIT_META[fa.dev_trait] ?? TRAIT_META['Normal'];
            const traj = trajectory(fa.age);
            const mv = fairMarketValue(fa.position, fa.overall_rating, fa.dev_trait);
            const isSigning = signingId === fa.id;

            return (
              <div key={fa.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{fa.first_name} {fa.last_name}</span>
                      {trait.short && <span style={{ background: trait.color, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                    </div>
                    <span style={{ color: '#444', fontSize: 11 }}>{fa.position_label || fa.position}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
                    <span style={{ color: traj.color, fontSize: 12 }}>{fa.age} {traj.label}</span>
                    <span style={{ color: ratingColor(fa.overall_rating), fontWeight: 700, fontSize: 14 }}>{fa.overall_rating}</span>
                  </div>
                  <div style={{ width: 70, color: '#555', fontSize: 11, textAlign: 'center' }}>{fa.dev_trait === 'Normal' ? '—' : fa.dev_trait}</div>
                  <div style={{ width: 100, color: '#888', fontSize: 12 }}>{fmtSalary(mv)}/yr</div>
                  <button
                    onClick={() => isSigning ? setSigningId(null) : openSign(fa)}
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

                {isSigning && signingPlayer && (
                  <div style={{ background: '#080e18', border: '1px solid #1a2a3a', borderRadius: 6, margin: '0 12px 10px', padding: '12px 16px' }}>
                    <div style={{ color: '#4FC3F7', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>OFFER CONTRACT — {fa.first_name} {fa.last_name}</div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setSignYears(y)} style={{ width: 32, height: 32, background: signYears === y ? '#4FC3F7' : '#141414', border: `1px solid ${signYears === y ? '#4FC3F7' : '#2a2a2a'}`, borderRadius: 4, color: signYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555', fontSize: 13 }}>$</span>
                          <input type="number" value={signSalary} onChange={e => setSignSalary(e.target.value)} min="0.9" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555', fontSize: 13 }}>M</span>
                        </div>
                        <div style={{ color: '#333', fontSize: 10, marginTop: 4 }}>Market: {fmtSalary(mv)}/yr</div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>CAP AFTER SIGNING</div>
                        <div style={{ color: signCapLeft < 0 ? '#e57373' : '#4caf50', fontSize: 13 }}>{fmtSalary(signCapLeft)} remaining</div>
                        <div style={{ color: '#555', fontSize: 11 }}>{rosterSpots && `${rosterSpots.activeFree - 1} roster spot${rosterSpots.activeFree - 1 !== 1 ? 's' : ''} left after`}</div>
                      </div>
                    </div>
                    <button onClick={handleSign} disabled={working || signCapLeft < 0} style={{ marginTop: 10, padding: '6px 16px', background: signCapLeft < 0 ? '#1a1a1a' : '#0a1a3a', border: `1px solid ${signCapLeft < 0 ? '#2a2a2a' : '#4FC3F7'}`, borderRadius: 4, color: signCapLeft < 0 ? '#333' : '#4FC3F7', fontSize: 12, cursor: signCapLeft < 0 ? 'not-allowed' : 'pointer' }}>
                      {working ? '...' : signCapLeft < 0 ? 'OVER CAP' : 'Confirm Signing'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ color: '#333', fontSize: 11, padding: '10px 12px' }}>
            {filteredFa.length} free agent{filteredFa.length !== 1 ? 's' : ''} shown (top 200 by OVR)
          </div>
        </div>
      )}

      {/* ── Offseason / Re-signing ── */}
      {activeTab === 'offseason' && (
        <div>
          {/* Your Re-signing Window */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: '#FF8740', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>RE-SIGNING WINDOW</div>
            <div style={{ color: '#555', fontSize: 12, marginBottom: 10 }}>
              {expiringPlayers.length === 0
                ? 'No players entering the final year of their contract.'
                : `${expiringPlayers.length} player${expiringPlayers.length !== 1 ? 's' : ''} in the final year of their contract. Make your decisions before advancing the season.`}
            </div>
            {expiringPlayers.length > 0 && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11 }}>
                <span style={{ color: '#4caf50' }}>✓ {Object.values(playerDecisions).filter(d => d === 'resigned').length} re-signed</span>
                <span style={{ color: '#e57373' }}>→ {Object.values(playerDecisions).filter(d => d === 'walking').length} letting walk</span>
                <span style={{ color: '#FF8740' }}>⏳ {pendingCount} pending decision</span>
              </div>
            )}
          </div>

          {expiringPlayers.length === 0 ? (
            <div style={{ color: '#333', padding: '16px 0', fontSize: 13 }}>
              No expiring contracts — you're good to advance the season.
            </div>
          ) : expiringPlayers.map(player => {
            const decision = playerDecisions[player.id] ?? 'pending';
            const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
            const traj = trajectory(player.age);
            const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
            const isResigning = resigningId === player.id;

            const decisionColor =
              decision === 'resigned' ? '#4caf50' :
              decision === 'walking' ? '#e57373' : '#FF8740';

            const decisionLabel =
              decision === 'resigned' ? 'RE-SIGNED' :
              decision === 'walking' ? 'LETTING WALK' : 'PENDING';

            return (
              <div key={player.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{player.first_name} {player.last_name}</span>
                      {trait.short && <span style={{ background: trait.color, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                    </div>
                    <span style={{ color: '#444', fontSize: 11 }}>{player.position_label || player.position}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
                    <span style={{ color: traj.color, fontSize: 12 }}>{player.age} {traj.label}</span>
                    <span style={{ color: ratingColor(player.overall_rating), fontWeight: 700, fontSize: 14 }}>{player.overall_rating}</span>
                  </div>
                  <div style={{ width: 70, color: '#555', fontSize: 11, textAlign: 'center' }}>{player.dev_trait === 'Normal' ? '—' : player.dev_trait}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
                    <span style={{ color: '#444', fontSize: 10 }}>Current</span>
                    <span style={{ color: '#888', fontSize: 12 }}>{fmtSalary(player.annual_salary)}/yr</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
                    <span style={{ color: '#444', fontSize: 10 }}>Asking ~</span>
                    <span style={{ color: '#FF8740', fontSize: 12 }}>{fmtSalary(ap)}/yr</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: decisionColor, fontSize: 10, fontWeight: 700 }}>{decisionLabel}</span>
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

                {isResigning && decision === 'pending' && (
                  <div style={{ background: '#0a180a', border: '1px solid #1a3a1a', borderRadius: 6, margin: '0 12px 10px', padding: '12px 16px' }}>
                    <div style={{ color: '#4caf50', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
                      RE-SIGN OFFER — {player.first_name} {player.last_name}
                    </div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>YEARS</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[1,2,3,4,5].map(y => (
                            <button key={y} onClick={() => setResignYears(y)} style={{ width: 32, height: 32, background: resignYears === y ? '#4caf50' : '#141414', border: `1px solid ${resignYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: resignYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#555', fontSize: 13 }}>$</span>
                          <input type="number" value={resignSalary} onChange={e => setResignSalary(e.target.value)} min="0.9" step="0.5"
                            style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                          <span style={{ color: '#555', fontSize: 13 }}>M</span>
                        </div>
                        <div style={{ color: '#333', fontSize: 10, marginTop: 4 }}>Asking: ~{fmtSalary(ap)}/yr</div>
                      </div>
                      <div>
                        <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>CAP AFTER SIGNING</div>
                        <div style={{ color: resignCapLeft < 0 ? '#e57373' : '#4caf50', fontSize: 13 }}>{fmtSalary(resignCapLeft)} remaining</div>
                      </div>
                    </div>
                    <button onClick={handleResign} disabled={working || resignCapLeft < 0} style={{ marginTop: 10, padding: '6px 16px', background: resignCapLeft < 0 ? '#1a1a1a' : '#0a1a0a', border: `1px solid ${resignCapLeft < 0 ? '#2a2a2a' : '#4caf50'}`, borderRadius: 4, color: resignCapLeft < 0 ? '#333' : '#4caf50', fontSize: 12, cursor: resignCapLeft < 0 ? 'not-allowed' : 'pointer' }}>
                      {working ? '...' : resignCapLeft < 0 ? 'OVER CAP' : 'Confirm Re-Sign'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {expiringPlayers.length > 0 && (
            <div style={{ color: '#333', fontSize: 11, padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 24 }}>
              Once you've made your decisions, advance the season from the main menu. Players marked "Letting Walk" will automatically become free agents when the season advances.
            </div>
          )}

          {/* CPU Free Agency Section */}
          <div style={{ background: '#0d0d14', border: '1px solid #1a1a2a', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ color: '#4FC3F7', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
              CPU FREE AGENCY
            </div>
            <div style={{ color: '#444', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              Run CPU free agency to let the other 31 teams fill their roster gaps.
              CPU teams also automatically re-sign their own key players when you advance the season.
              <br />
              <span style={{ color: '#333' }}>Best done after you've finished your own FA signings.</span>
            </div>

            {cpuFaDone && cpuFaResult ? (
              <div style={{ background: '#080e18', border: '1px solid #1a3a5a', borderRadius: 6, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ color: '#4FC3F7', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  ✓ CPU Free Agency Complete
                </div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{cpuFaResult.totalSigned}</span> players signed across{' '}
                  <span style={{ color: '#fff', fontWeight: 600 }}>{cpuFaResult.teamsActive}</span> teams.
                </div>
                <button
                  onClick={() => { setCpuFaDone(false); setCpuFaResult(null); }}
                  style={{ marginTop: 10, padding: '4px 12px', background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 4, color: '#444', fontSize: 11, cursor: 'pointer' }}>
                  Run Again
                </button>
              </div>
            ) : (
              <button
                onClick={handleCpuFa}
                disabled={working}
                style={{
                  padding: '8px 20px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                  cursor: working ? 'not-allowed' : 'pointer', borderRadius: 5,
                  background: working ? '#141420' : '#0a1020',
                  border: `1px solid ${working ? '#2a2a3a' : '#4FC3F7'}`,
                  color: working ? '#333' : '#4FC3F7',
                }}>
                {working ? 'Running...' : 'RUN CPU FREE AGENCY'}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}