import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { Contract, PracticePlayer, FreeAgent, CapSummary, RosterSpots, Decision, Coach } from './franchise/types';
import { fmtSalary, fairMarketValue, askingPrice } from './franchise/utils';
import ActiveRosterTab from './franchise/ActiveRosterTab';
import PracticeSquadTab from './franchise/PracticeSquadTab';
import FreeAgentsTab from './franchise/FreeAgentsTab';
import OffseasonTab from './franchise/OffseasonTab';
import CoachingTab from './franchise/CoachingTab';

declare const window: any;
interface CpuFaResult { totalSigned: number; teamsActive: number; }

export default function Franchise() {
  const { userTeam, currentSeason, playoffsComplete } = useGameStore();
  if (!userTeam) return null;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [practiceSquad, setPracticeSquad] = useState<PracticePlayer[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Contract[]>([]);
  const [cap, setCap] = useState<CapSummary | null>(null);
  const [rosterSpots, setRosterSpots] = useState<RosterSpots | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'ps' | 'fa' | 'offseason' | 'coaching'>('roster');
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [teamNeeds, setTeamNeeds] = useState<string[]>([]);

  // Roster tab state
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [rosterSearch, setRosterSearch] = useState('');
  const [extendingId, setExtendingId] = useState<number | null>(null);
  const [extendYears, setExtendYears] = useState(3);
  const [extendSalary, setExtendSalary] = useState('');
  const [releasingId, setReleasingId] = useState<number | null>(null);

  // FA tab state
  const [faPos, setFaPos] = useState('ALL');
  const [faSortBy, setFaSortBy] = useState<'ovr' | 'age' | 'value'>('ovr');
  const [faSearch, setFaSearch] = useState('');
  const [signingId, setSigningId] = useState<number | null>(null);
  const [signYears, setSignYears] = useState(2);
  const [signSalary, setSignSalary] = useState('');
  const [psSigningId, setPsSigningId] = useState<number | null>(null);

  // Offseason tab state
  const [resigningId, setResigningId] = useState<number | null>(null);
  const [resignYears, setResignYears] = useState(3);
  const [resignSalary, setResignSalary] = useState('');
  const [playerDecisions, setPlayerDecisions] = useState<Record<number, Decision>>({});
  const [cpuFaResult, setCpuFaResult] = useState<CpuFaResult | null>(null);
  const [cpuFaDone, setCpuFaDone] = useState(false);
    const [pendingCounters, setPendingCounters] = useState<Record<number, { salary: number; years: number }>>({});
  const [deadCap, setDeadCap] = useState<{ amount: number; entries: any[] } | null>(null);
  const [staff, setStaff] = useState<Coach[]>([]);

    // Tag decisions
  const [tagWorking, setTagWorking] = useState(false);

  useEffect(() => { loadData(); loadTeamNeeds(); }, [userTeam.id]);
  useEffect(() => {
    if (activeTab === 'fa') loadFreeAgents();
    if (activeTab === 'offseason') loadExpiringContracts();
  }, [activeTab, faPos]);
  useEffect(() => {
    if (!playoffsComplete && activeTab === 'offseason') setActiveTab('roster');
  }, [playoffsComplete]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

    const loadData = async () => {
  const [c, s, ps, spots, dc, staffData] = await Promise.all([
    window.api.getTeamContracts(userTeam.id),
    window.api.getCapSummary(userTeam.id),
    window.api.getPracticeSquad(userTeam.id),
    window.api.getRosterSpots(userTeam.id),
    window.api.getDeadCap(userTeam.id),
    window.api.getCoachingStaff(userTeam.id),
  ]);
  setContracts(c); setCap(s); setPracticeSquad(ps); setRosterSpots(spots);
  setDeadCap(dc ?? null);
  setStaff(staffData ?? []);
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

  const loadTeamNeeds = async () => {
    const needs = await window.api.getTeamNeeds(userTeam.id);
    setTeamNeeds(Array.isArray(needs) ? needs : []);
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
    const player = freeAgents.find(f => f.id === signingId);
    setWorking(true);
    const result = await window.api.signFreeAgent({ playerId: signingId, years: signYears, salary });
    if (!result.success) {
      showToast(result.reason ?? 'Could not sign player.', 'error');
      setWorking(false);
      return;
    }
    setSigningId(null);
    showToast(`${player?.first_name} ${player?.last_name} signed!`, 'success');
    await loadData();
    await loadFreeAgents();
    setWorking(false);
  };

  const handleSignToPs = async (fa: FreeAgent) => {
    setPsSigningId(fa.id);
    const result = await window.api.signFreeAgentToPs(fa.id);
    if (result.success) {
      showToast(`${fa.first_name} ${fa.last_name} signed to practice squad.`, 'success');
      await loadData();
      await loadFreeAgents();
      await loadTeamNeeds();
    } else {
      showToast(result.reason ?? 'Could not sign to PS.', 'error');
    }
    setPsSigningId(null);
  };

    const handleResign = async () => {
    if (!resigningId || working) return;
    const salary = parseFloat(resignSalary);
    if (isNaN(salary) || salary <= 0) return;
    const player = expiringPlayers.find(p => p.id === resigningId);
    setWorking(true);
    const result = await window.api.resignPlayer({ playerId: resigningId, years: resignYears, salary });
    if (!result.success) {
      if (result.counterOffer) {
        // Player countered — store and show the counter panel
        setPendingCounters(prev => ({ ...prev, [resigningId]: result.counterOffer! }));
        setResigningId(null);
        showToast(`${player?.first_name} ${player?.last_name} counters at $${result.counterOffer.salary.toFixed(1)}M/yr`, 'error');
      } else {
        showToast(result.reason ?? 'Player declined the offer.', 'error');
      }
      setWorking(false);
      return;
    }
    setPlayerDecisions(prev => ({ ...prev, [resigningId]: 'resigned' }));
    setResigningId(null);
    showToast(`${player?.first_name} ${player?.last_name} re-signed — ${resignYears}yr / ${fmtSalary(salary)}`, 'success');
    await loadData();
    setWorking(false);
  };

    const handleAcceptCounter = async (playerId: number, salary: number, years: number) => {
    if (working) return;
    const player = expiringPlayers.find(p => p.id === playerId);
    setWorking(true);
    const result = await window.api.acceptCounterOffer({ playerId, years, salary });
    if (!result.success) {
      showToast(result.reason ?? 'Could not accept counter.', 'error');
      setWorking(false);
      return;
    }
    setPendingCounters(prev => { const n = { ...prev }; delete n[playerId]; return n; });
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'resigned' }));
    showToast(`${player?.first_name} ${player?.last_name} counter accepted — ${years}yr / ${fmtSalary(salary)}`, 'success');
    await loadData();
    setWorking(false);
  };

  const handleDeclineCounter = async (playerId: number) => {
    const player = expiringPlayers.find(p => p.id === playerId);
    setWorking(true);
    await window.api.releasePlayer(playerId);
    setPendingCounters(prev => { const n = { ...prev }; delete n[playerId]; return n; });
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'walking' }));
    setResigningId(null);
    showToast(`${player?.first_name} ${player?.last_name} walks to free agency.`, 'error');
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

    const handleApplyTag = async (playerId: number, tagType: 'franchise' | 'transition') => {
    if (tagWorking) return;
    setTagWorking(true);
    const result = await window.api.applyFranchiseTag({ playerId, tagType });
    if (!result.success) {
      showToast(result.reason ?? 'Could not apply tag.', 'error');
      setTagWorking(false);
      return;
    }
    const player = expiringPlayers.find(p => p.id === playerId);
    const label = tagType === 'franchise' ? 'Franchise Tag' : 'Transition Tag';
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'resigned' }));
    showToast(`${player?.first_name} ${player?.last_name} received the ${label}!`, 'success');
    await loadExpiringContracts();
    await loadData();
    setTagWorking(false);
  };

  const handleRemoveTag = async (playerId: number) => {
    if (tagWorking) return;
    setTagWorking(true);
    const result = await window.api.removeFranchiseTag(playerId);
    if (!result.success) {
      showToast(result.reason ?? 'Could not remove tag.', 'error');
      setTagWorking(false);
      return;
    }
    const player = expiringPlayers.find(p => p.id === playerId);
    showToast(`${player?.first_name} ${player?.last_name} tag removed — player released to FA.`, 'error');
    await loadExpiringContracts();
    await loadData();
    setTagWorking(false);
  };

  const expiringCount = contracts.filter(c => c.years_remaining === 1).length;
  const capPct = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

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

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Franchise Management</h1>
        <p style={{ color: '#444', fontSize: 12, margin: '2px 0 0' }}>{userTeam.city} {userTeam.name} · {currentSeason} Season</p>
      </div>

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
            {deadCap && deadCap.amount > 0 && (
    <span style={{ color: '#e57373' }}>
      💀 Dead cap: {fmtSalary(deadCap.amount)}
      {deadCap.entries.length > 0 && (
        <span style={{ fontSize: 9, color: '#555', marginLeft: 4 }}>
          ({deadCap.entries.map((e: any) => `${e.player_name} ${fmtSalary(e.amount)}`).join(', ')})
        </span>
      )}
    </span>
  )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'roster',   label: `ACTIVE ROSTER (${contracts.length})`,                        warn: false },
          { key: 'ps',       label: `PRACTICE SQUAD (${practiceSquad.length})`,                   warn: false },
          { key: 'fa',       label: 'FREE AGENTS',                                                 warn: false },
          ...(playoffsComplete ? [{ key: 'offseason' as const, label: expiringCount > 0 ? `OFFSEASON ⚠ ${expiringCount}` : 'OFFSEASON', warn: expiringCount > 0 }] : []),
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

      {activeTab === 'roster' && (
        <ActiveRosterTab
          contracts={contracts} cap={cap} rosterSpots={rosterSpots}
          posFilter={posFilter} setPosFilter={setPosFilter}
          sortBy={sortBy} setSortBy={setSortBy}
          rosterSearch={rosterSearch} setRosterSearch={setRosterSearch}
          extendingId={extendingId} setExtendingId={setExtendingId}
          extendYears={extendYears} setExtendYears={setExtendYears}
          extendSalary={extendSalary} setExtendSalary={setExtendSalary}
          releasingId={releasingId} setReleasingId={setReleasingId}
          handleExtend={handleExtend} handleRelease={handleRelease}
          working={working}
        />
      )}

      {activeTab === 'ps' && (
        <PracticeSquadTab
          practiceSquad={practiceSquad} rosterSpots={rosterSpots}
          showToast={showToast} loadData={loadData}
        />
      )}

      {activeTab === 'fa' && (
        <FreeAgentsTab
          freeAgents={freeAgents} cap={cap} rosterSpots={rosterSpots} teamNeeds={teamNeeds}
          faPos={faPos} setFaPos={setFaPos}
          faSortBy={faSortBy} setFaSortBy={setFaSortBy}
          faSearch={faSearch} setFaSearch={setFaSearch}
          signingId={signingId} setSigningId={setSigningId}
          signYears={signYears} setSignYears={setSignYears}
          signSalary={signSalary} setSignSalary={setSignSalary}
          psSigningId={psSigningId}
          handleSign={handleSign} handleSignToPs={handleSignToPs}
          working={working}
        />
      )}

        {activeTab === 'offseason' && (
    <OffseasonTab
      expiringPlayers={expiringPlayers}
      cap={cap}
      playerDecisions={playerDecisions}
      setPlayerDecisions={setPlayerDecisions}
      resigningId={resigningId}
      setResigningId={setResigningId}
      resignYears={resignYears}
      setResignYears={setResignYears}
      resignSalary={resignSalary}
      setResignSalary={setResignSalary}
      cpuFaResult={cpuFaResult}
      cpuFaDone={cpuFaDone}
      setCpuFaDone={setCpuFaDone}
      setCpuFaResult={setCpuFaResult}
      handleResign={handleResign}
      handleLetWalk={handleLetWalk}
      handleCpuFa={handleCpuFa}
      handleApplyTag={handleApplyTag}
      handleRemoveTag={handleRemoveTag}
      pendingCounters={pendingCounters}
      handleAcceptCounter={handleAcceptCounter}
      handleDeclineCounter={handleDeclineCounter}
      working={working || tagWorking}
    />
  )}

    </div>
  );
}
