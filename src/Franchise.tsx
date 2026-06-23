import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { Contract, PracticePlayer, FreeAgent, CapSummary, RosterSpots, Decision, Coach, WaiverPlayer } from './franchise/types';
import { fmtSalary, fairMarketValue, askingPrice } from './franchise/utils';
import ActiveRosterTab from './franchise/ActiveRosterTab';
import PracticeSquadTab from './franchise/PracticeSquadTab';
import FreeAgentsTab from './franchise/FreeAgentsTab';
import WaiverWireTab from './franchise/WaiverWireTab';
import OffseasonTab from './franchise/OffseasonTab';
import CoachingTab from './franchise/CoachingTab';
import SchemesTab from './franchise/SchemesTab';
import SalariesTab from './franchise/SalariesTab';
import PlayerProfile from './teams/PlayerProfile';
import { Player, PlayerStats, CareerSeasonStats } from './teams/types';

declare const window: any;
interface CpuFaResult { totalSigned: number; teamsActive: number; }

export default function Franchise() {
  const { userTeam, currentSeason, playoffsComplete } = useGameStore();
  if (!userTeam) return null;

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [practiceSquad, setPracticeSquad] = useState<PracticePlayer[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [waiverWire, setWaiverWire] = useState<WaiverPlayer[]>([]);
  const [expiringPlayers, setExpiringPlayers] = useState<Contract[]>([]);
  const [cap, setCap] = useState<CapSummary | null>(null);
  const [rosterSpots, setRosterSpots] = useState<RosterSpots | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'ps' | 'fa' | 'waivers' | 'offseason' | 'coaching' | 'schemes' | 'salaries'>('roster');
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [teamNeeds, setTeamNeeds] = useState<string[]>([]);

  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'salary' | 'years' | 'ovr' | 'age'>('salary');
  const [rosterSearch, setRosterSearch] = useState('');
  const [extendingId, setExtendingId] = useState<number | null>(null);
  const [extendYears, setExtendYears] = useState(3);
  const [releasingId, setReleasingId] = useState<number | null>(null);

  const [faPos, setFaPos] = useState('ALL');
  const [faSortBy, setFaSortBy] = useState<'ovr' | 'age' | 'value'>('ovr');
  const [faSearch, setFaSearch] = useState('');
  const [signingId, setSigningId] = useState<number | null>(null);
  const [signYears, setSignYears] = useState(2);
  const [signSalary, setSignSalary] = useState('');
  const [psSigningId, setPsSigningId] = useState<number | null>(null);

  const [resigningId, setResigningId] = useState<number | null>(null);
  const [resignYears, setResignYears] = useState(3);
  const [resignSalary, setResignSalary] = useState('');
  const [playerDecisions, setPlayerDecisions] = useState<Record<number, Decision>>({});
  const [cpuFaResult, setCpuFaResult] = useState<CpuFaResult | null>(null);
  const [cpuFaDone, setCpuFaDone] = useState(false);
  const [pendingCounters, setPendingCounters] = useState<Record<number, { salary: number; years: number }>>({});
  const [deadCap, setDeadCap] = useState<{ amount: number; entries: any[] } | null>(null);
  const [staff, setStaff] = useState<Coach[]>([]);
  const [tagWorking, setTagWorking] = useState(false);

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [careerStats, setCareerStats] = useState<CareerSeasonStats[]>([]);
  const [statsView, setStatsView] = useState<'season' | 'career'>('season');

  useEffect(() => { loadData(); loadTeamNeeds(); }, [userTeam.id]);
  useEffect(() => {
    if (activeTab === 'fa') loadFreeAgents();
    if (activeTab === 'offseason') loadExpiringContracts();
    if (activeTab === 'waivers') loadWaiverWire();
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

  const loadWaiverWire = async () => {
    const data = await window.api.getWaiverWire();
    setWaiverWire(Array.isArray(data) ? data : []);
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

  const handleExtend = async (salary: string) => {
    if (!extendingId || working) return;
    const salaryNum = parseFloat(salary);
    if (isNaN(salaryNum) || salaryNum <= 0) return;
    const current = contracts.find(c => c.id === extendingId);
    const capImpact = salaryNum - (current?.annual_salary ?? 0);
    if (cap && capImpact > cap.available_cap + 0.1) {
      showToast(`Not enough cap space. Need $${capImpact.toFixed(1)}M more.`, 'error');
      return;
    }
    setWorking(true);
    const result = await window.api.extendPlayer({ playerId: extendingId, years: extendYears, salary: salaryNum });
    if (!result?.success) {
      showToast(result?.reason ?? 'Player declined the extension.', 'error');
      setWorking(false);
      return;
    }
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
    if (activeTab === 'waivers') loadWaiverWire();
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

  const handleLetWalk = (playerId: number) => {
    setPlayerDecisions(prev => ({ ...prev, [playerId]: 'walking' }));
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

  const handlePlayerClick = async (playerId: number) => {
    const roster: Player[] = await window.api.getRoster(userTeam.id);
    const player = roster.find((p: Player) => p.id === playerId) ?? null;
    if (!player) return;
    setSelectedPlayer(player);
    setPlayerStats(null);
    setCareerStats([]);
    setStatsView('season');
    window.api.getPlayerStats(playerId).then((s: PlayerStats) => setPlayerStats(s));
    window.api.getPlayerCareerStats(playerId).then((s: CareerSeasonStats[]) => setCareerStats(s));
  };

  const expiringCount = contracts.filter(c => c.years_remaining === 1).length;
  const capPct = cap ? (cap.used_cap / cap.total_cap) * 100 : 0;
  const capColor = capPct > 100 ? '#e57373' : capPct > 90 ? '#FF8740' : '#4caf50';
  const totalGuaranteed = contracts.reduce((s, c) => s + (c.guaranteed_amount ?? 0), 0);

  const tabs = [
    { key: 'roster' as const, label: `ACTIVE ROSTER (${contracts.length})`, warn: false },
    { key: 'salaries' as const, label: 'SALARIES', warn: false },
    { key: 'ps' as const, label: `PRACTICE SQUAD (${practiceSquad.length})`, warn: false },
    { key: 'fa' as const, label: 'FREE AGENTS', warn: false },
    ...(!playoffsComplete ? [{ key: 'waivers' as const, label: `WAIVER WIRE${waiverWire.length > 0 ? ` (${waiverWire.length})` : ''}`, warn: false }] : []),
    { key: 'coaching' as const, label: 'COACHING STAFF', warn: false },
    { key: 'schemes' as const, label: 'SCHEMES', warn: false },
    ...(playoffsComplete ? [{ key: 'offseason' as const, label: expiringCount > 0 ? `OFFSEASON ⚠ ${expiringCount}` : 'OFFSEASON', warn: expiringCount > 0 }] : []),
  ];

  return (
    <div style={{ color: '#ccc', fontFamily: 'monospace', padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.type === 'error' ? '#1a0000' : '#001a00',
          border: `1px solid ${toast.type === 'error' ? '#e57373' : '#4caf50'}`,
          color: toast.type === 'error' ? '#e57373' : '#4caf50',
          padding: '10px 16px', borderRadius: 6, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
        }}>
          <span>{toast.type === 'error' ? '✗' : '✓'}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#FF8740', textTransform: 'uppercase' }}>Franchise Management</div>
        <div style={{ fontSize: 13, color: '#555' }}>{userTeam.city} {userTeam.name} · {currentSeason} Season</div>
      </div>

      {cap && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 16px', minWidth: 200 }}>
            <div style={{ fontSize: 10, color: '#333', letterSpacing: 1, marginBottom: 4 }}>SALARY CAP</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: capColor }}>{fmtSalary(cap.used_cap)}</span>
              <span style={{ color: '#333', fontSize: 11 }}>used /</span>
              <span style={{ color: '#444', fontSize: 12 }}>{fmtSalary(cap.total_cap)} cap</span>
            </div>
            <div style={{ marginTop: 6, height: 3, background: '#1a1a1a', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${Math.min(capPct, 100)}%`, background: capColor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: cap.available_cap < 0 ? '#e57373' : '#4caf50' }}>
              {cap.available_cap < 0 ? '⚠ OVER CAP ' : ''}{fmtSalary(cap.available_cap)}{cap.available_cap >= 0 ? ' available' : ''}
            </div>
          </div>

          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 16px', flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: '#444' }}>Guaranteed on books: {fmtSalary(totalGuaranteed)}</div>
            {expiringCount > 0 && <div style={{ fontSize: 11, color: '#FF8740', marginTop: 3 }}>⚠ {expiringCount} expiring this offseason</div>}
            {rosterSpots && <div style={{ fontSize: 11, color: '#444', marginTop: 3 }}>{rosterSpots.active}/53 active · {rosterSpots.ps}/16 PS</div>}
          </div>

          {deadCap && deadCap.amount > 0 && (
            <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 16px' }}>
              <div style={{ fontSize: 11, color: '#e57373' }}>💀 Dead cap: {fmtSalary(deadCap.amount)}</div>
              {deadCap.entries.length > 0 && (
                <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>
                  ({deadCap.entries.map((e: any) => `${e.player_name} ${fmtSalary(e.amount)}`).join(', ')})
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
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
          contracts={contracts}
          cap={cap}
          rosterSpots={rosterSpots}
          posFilter={posFilter}
          setPosFilter={setPosFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          rosterSearch={rosterSearch}
          setRosterSearch={setRosterSearch}
          extendingId={extendingId}
          setExtendingId={setExtendingId}
          extendYears={extendYears}
          setExtendYears={setExtendYears}
          releasingId={releasingId}
          setReleasingId={setReleasingId}
          handleExtend={handleExtend}
          handleRelease={handleRelease}
          working={working}
          onPlayerClick={handlePlayerClick}
        />
      )}

      {activeTab === 'ps' && (
        <PracticeSquadTab
          practiceSquad={practiceSquad}
          rosterSpots={rosterSpots}
          showToast={showToast}
          loadData={loadData}
        />
      )}

      {activeTab === 'fa' && (
        <FreeAgentsTab
          freeAgents={freeAgents}
          cap={cap}
          rosterSpots={rosterSpots}
          teamNeeds={teamNeeds}
          faPos={faPos}
          setFaPos={setFaPos}
          faSortBy={faSortBy}
          setFaSortBy={setFaSortBy}
          faSearch={faSearch}
          setFaSearch={setFaSearch}
          signingId={signingId}
          setSigningId={setSigningId}
          signYears={signYears}
          setSignYears={setSignYears}
          signSalary={signSalary}
          setSignSalary={setSignSalary}
          psSigningId={psSigningId}
          handleSign={handleSign}
          handleSignToPs={handleSignToPs}
          working={working}
        />
      )}

      {activeTab === 'waivers' && (
        <WaiverWireTab
          waiverWire={waiverWire}
          rosterSpots={rosterSpots}
          showToast={showToast}
          loadData={loadData}
          reloadWaivers={loadWaiverWire}
        />
      )}

      {activeTab === 'offseason' && (
        <OffseasonTab
          expiringPlayers={expiringPlayers}
          playerDecisions={playerDecisions}
          pendingCounters={pendingCounters}
          cap={cap}
          resigningId={resigningId}
          setResigningId={setResigningId}
          resignYears={resignYears}
          setResignYears={setResignYears}
          resignSalary={resignSalary}
          setResignSalary={setResignSalary}
          handleResign={handleResign}
          handleLetWalk={handleLetWalk}
          handleAcceptCounter={handleAcceptCounter}
          handleDeclineCounter={handleDeclineCounter}
          handleApplyTag={handleApplyTag}
          handleRemoveTag={handleRemoveTag}
          handleCpuFa={handleCpuFa}
                    cpuFaResult={cpuFaResult}
          cpuFaDone={cpuFaDone}
          setCpuFaDone={setCpuFaDone}
          setCpuFaResult={setCpuFaResult}
          setPlayerDecisions={setPlayerDecisions}
          working={working || tagWorking}
        />
      )}

      {activeTab === 'coaching' && (
                <CoachingTab
          staff={staff}
          teamId={userTeam.id}
          showToast={showToast}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'schemes' && (
        <SchemesTab
          teamId={userTeam.id}
          teamName={`${userTeam.city} ${userTeam.name}`}
          onToast={showToast}
        />
    )}

      {activeTab === 'salaries' && (
        <SalariesTab
                    contracts={contracts}
          cap={cap}
        />
      )}

      {selectedPlayer && (
        <div onClick={() => setSelectedPlayer(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{ height: '100%', overflowY: 'auto' }}>
                        <PlayerProfile
              player={selectedPlayer}
              playerStats={playerStats}
              careerStats={careerStats}
              statsView={statsView}
              setStatsView={setStatsView}
              onClose={() => setSelectedPlayer(null)}
              onSave={(updated: Player) => setSelectedPlayer(updated)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
