import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

interface Team { id: number; city: string; name: string; conference: string; }
interface Player {
  id: number; first_name: string; last_name: string;
  position: string; position_label: string;
  overall_rating: number; age: number; dev_trait: string;
}
interface DraftPick {
  id: number; owner_team_id: number; original_team_id: number;
  season: number; round: number; original_team_city: string;
}
interface TeamStatus {
  status: string; description: string; acceptanceThreshold: number;
  wins: number; losses: number; avgOverall: number; isOverridden: boolean;
}
interface CpuOffer {
  fromTeamId: number; fromTeamName: string;
  requestedPlayer: Player; requestedValue: number;
  offeredPlayer: Player; offeredPick: DraftPick | null; offerValue: number;
}
interface TeamNeed { position: string; severity: 'critical' | 'depth'; }
interface Props { userTeam: { id: number; city: string; name: string }; }

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];
const ROUND_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th' };
const PICK_VALUES: Record<number, number> = { 1: 100, 2: 65, 3: 40, 4: 22, 5: 13, 6: 8, 7: 4 };

const STATUS_META: Record<string, { color: string; bg: string }> = {
  Contender:  { color: '#FFD700', bg: T.bgGold },
  Buyer:      { color: '#4caf50', bg: T.bgGreen },
  Seller:     { color: '#4FC3F7', bg: T.bgBlue },
  Rebuilding: { color: '#9E9E9E', bg: T.bgPanel },
  Neutral:    { color: '#FF8740', bg: T.bgOrange },
};
const TRAIT_META: Record<string, { color: string }> = {
  'Normal': { color: T.textDim }, 'Star': { color: '#4FC3F7' },
  'Superstar': { color: '#FF8740' }, 'X-Factor': { color: '#FFD700' },
};

function ratingColor(r: number) {
  return r >= 90 ? '#FFD700' : r >= 80 ? '#4caf50' : r >= 70 ? '#FF8740' : T.textMuted;
}
function trajectory(age: number) {
  if (age <= 26) return { label: '↑ Rising', color: '#4caf50' };
  if (age <= 30) return { label: '→ Prime', color: '#FF8740' };
  return { label: '↓ Declining', color: T.textMuted };
}
function calcTradeValue(overall: number, age: number, position: string, devTrait = 'Normal'): number {
  const ageFactor = age <= 23 ? 1.4 : age <= 26 ? 1.25 : age <= 29 ? 1.0 : age <= 32 ? 0.75 : age <= 35 ? 0.5 : 0.3;
  const posFactor: Record<string, number> = { QB: 1.4, CB: 1.15, DL: 1.15, LB: 1.1, WR: 1.1, TE: 1.1, OL: 1.05, S: 1.0, RB: 0.85, K: 0.7 };
  const traitFactor: Record<string, number> = { 'Normal': 1.0, 'Star': 1.15, 'Superstar': 1.3, 'X-Factor': 1.5 };
  return Math.round(overall * ageFactor * (posFactor[position] ?? 1.0) * (traitFactor[devTrait] ?? 1.0));
}
function calcPickValue(round: number, season: number, currentSeason: number): number {
  return Math.round((PICK_VALUES[round] ?? 4) * (season <= currentSeason ? 1.0 : 0.80));
}
function pickLabel(pick: DraftPick, currentSeason: number): string {
  const yr = String(pick.season).slice(2);
  const label = `'${yr} ${ROUND_LABELS[pick.round]} Rd`;
  return pick.original_team_id === pick.owner_team_id ? label : `${label} (${pick.original_team_city})`;
}

export default function Trades({ userTeam }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [myRoster, setMyRoster] = useState<Player[]>([]);
  const [theirRoster, setTheirRoster] = useState<Player[]>([]);
  const [myPicks, setMyPicks] = useState<DraftPick[]>([]);
  const [theirPicks, setTheirPicks] = useState<DraftPick[]>([]);
  const [mySelected, setMySelected] = useState<number[]>([]);
  const [theirSelected, setTheirSelected] = useState<number[]>([]);
  const [myPicksSelected, setMyPicksSelected] = useState<number[]>([]);
  const [theirPicksSelected, setTheirPicksSelected] = useState<number[]>([]);
  const [myPos, setMyPos] = useState('ALL');
  const [theirPos, setTheirPos] = useState('ALL');
  const [result, setResult] = useState<{ accepted: boolean; reason?: string } | null>(null);
  const [proposing, setProposing] = useState(false);
  const [needs, setNeeds] = useState<TeamNeed[]>([]);
  const [weekInfo, setWeekInfo] = useState<{ hasSchedule: boolean; currentWeek: number | null } | null>(null);
  const [currentSeason, setCurrentSeason] = useState(2025);
  const [cpuOffer, setCpuOffer] = useState<CpuOffer | null>(null);
  const [offerHandled, setOfferHandled] = useState(false);
  const [offerWorking, setOfferWorking] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.getTeams(),
      window.api.getRoster(userTeam.id),
      window.api.getTeamNeeds(userTeam.id),
      window.api.getCurrentWeek(),
      window.api.getCurrentSeason(),
      window.api.getTradeablePicks(userTeam.id),
      window.api.getCpuTradeOffer(),
    ]).then(([allTeams, roster, n, wi, season, picks, offer]: any[]) => {
      setTeams(allTeams.filter((t: Team) => t.id !== userTeam.id));
      setMyRoster(roster);
      setNeeds(n);
      setWeekInfo(wi);
      setCurrentSeason(season);
      setMyPicks(picks);
      setCpuOffer(offer);
    });
  }, [userTeam.id]);

  const handleSelectTeam = async (teamId: number) => {
    setSelectedTeamId(teamId);
    setMySelected([]); setTheirSelected([]);
    setMyPicksSelected([]); setTheirPicksSelected([]);
    setResult(null); setTeamStatus(null);
    const [roster, status, picks] = await Promise.all([
      window.api.getRoster(teamId),
      window.api.getTeamStatus(teamId),
      window.api.getTradeablePicks(teamId),
    ]);
    setTheirRoster(roster);
    setTeamStatus(status);
    setTheirPicks(picks);
  };

  const handleSetOverride = async (value: string) => {
    if (!selectedTeamId) return;
    setSavingOverride(true);
    await window.api.setTeamTradeStatus({ teamId: selectedTeamId, status: value === 'auto' ? null : value });
    const updated = await window.api.getTeamStatus(selectedTeamId);
    setTeamStatus(updated);
    setSavingOverride(false);
  };

  const toggleMine    = (id: number) => { setResult(null); setMySelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleTheirs  = (id: number) => { setResult(null); setTheirSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleMyPick  = (id: number) => { setResult(null); setMyPicksSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleTheirPick = (id: number) => { setResult(null); setTheirPicksSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };

  const handlePropose = async () => {
    if (!canPropose) return;
    setProposing(true);
    const res = await window.api.proposeTrade({
      myPlayerIds: mySelected, theirPlayerIds: theirSelected,
      theirTeamId: selectedTeamId!,
      myPickIds: myPicksSelected, theirPickIds: theirPicksSelected,
    });
    setResult(res);
    if (res.accepted) {
      const [myNew, theirNew, myNewPicks, theirNewPicks] = await Promise.all([
        window.api.getRoster(userTeam.id), window.api.getRoster(selectedTeamId!),
        window.api.getTradeablePicks(userTeam.id), window.api.getTradeablePicks(selectedTeamId!),
      ]);
      setMyRoster(myNew); setTheirRoster(theirNew);
      setMyPicks(myNewPicks); setTheirPicks(theirNewPicks);
      setMySelected([]); setTheirSelected([]);
      setMyPicksSelected([]); setTheirPicksSelected([]);
    }
    setProposing(false);
  };

  const handleAcceptOffer = async () => {
    if (!cpuOffer || offerWorking) return;
    setOfferWorking(true);
    const res = await window.api.acceptCpuTradeOffer({
      myPlayerId: cpuOffer.requestedPlayer.id,
      theirPlayerId: cpuOffer.offeredPlayer.id,
      theirTeamId: cpuOffer.fromTeamId,
      theirPickId: cpuOffer.offeredPick?.id ?? null,
    });
    if (res.success) {
      const [newRoster, newPicks] = await Promise.all([
        window.api.getRoster(userTeam.id),
        window.api.getTradeablePicks(userTeam.id),
      ]);
      setMyRoster(newRoster); setMyPicks(newPicks);
      setCpuOffer(null); setOfferHandled(true);
    }
    setOfferWorking(false);
  };

  const myFiltered    = myRoster.filter(p => myPos === 'ALL' || p.position === myPos);
  const theirFiltered = theirRoster.filter(p => theirPos === 'ALL' || p.position === theirPos);

  const myPlayerValue = mySelected.reduce((s, id) => {
    const p = myRoster.find(x => x.id === id);
    return s + (p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0);
  }, 0);
  const theirPlayerValue = theirSelected.reduce((s, id) => {
    const p = theirRoster.find(x => x.id === id);
    return s + (p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0);
  }, 0);
  const myPickValueTotal = myPicksSelected.reduce((s, id) => {
    const pk = myPicks.find(x => x.id === id);
    return s + (pk ? calcPickValue(pk.round, pk.season, currentSeason) : 0);
  }, 0);
  const theirPickValueTotal = theirPicksSelected.reduce((s, id) => {
    const pk = theirPicks.find(x => x.id === id);
    return s + (pk ? calcPickValue(pk.round, pk.season, currentSeason) : 0);
  }, 0);
  const myValue    = myPlayerValue + myPickValueTotal;
  const theirValue = theirPlayerValue + theirPickValueTotal;

  const canPropose = (mySelected.length > 0 || myPicksSelected.length > 0) &&
                     (theirSelected.length > 0 || theirPicksSelected.length > 0) &&
                     selectedTeamId !== null;
  const selectedTeam  = teams.find(t => t.id === selectedTeamId);
  const statusMeta    = STATUS_META[teamStatus?.status ?? ''] ?? STATUS_META['Neutral'];
  const DEADLINE      = 8;
  const isPastDeadline = !!(weekInfo?.hasSchedule && (!weekInfo.currentWeek || weekInfo.currentWeek > DEADLINE));
  const weeksToDeadline = weekInfo?.currentWeek ? Math.max(0, DEADLINE - weekInfo.currentWeek + 1) : null;
  const threshold     = teamStatus?.acceptanceThreshold ?? -8;
  const margin        = (myValue - theirValue) - threshold;
  const likelihood    = !canPropose ? 'idle' : margin >= 5 ? 'yes' : margin >= -5 ? 'maybe' : 'no';
  const likelihoodText: Record<string, string> = {
    idle:  'Select players or picks from both sides to propose',
    yes:   `✓ ${teamStatus?.status ?? 'CPU'} will likely accept`,
    maybe: `~ Borderline — ${teamStatus?.status ?? 'CPU'} might accept`,
    no:    `✗ ${teamStatus?.status ?? 'CPU'} will likely reject — add more value`,
  };
  const likelihoodColor: Record<string, string> = {
    idle: T.textDim, yes: '#4caf50', maybe: '#FF8740', no: '#e57373',
  };

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>Trade Center</div>
        {weekInfo?.hasSchedule && (
          <div style={{ fontSize: 12, color: isPastDeadline ? '#e57373' : T.textMuted }}>
            {isPastDeadline
              ? 'Trade deadline has passed.'
              : `Trade deadline: Week ${DEADLINE}${weeksToDeadline !== null ? ` · ${weeksToDeadline} week${weeksToDeadline !== 1 ? 's' : ''} remaining` : ''}`}
          </div>
        )}
      </div>

      {/* Incoming CPU Offer */}
      {cpuOffer && !offerHandled && (
        <div style={{ background: '#1a2a1a', border: '1px solid #4caf5055', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#4caf50', fontWeight: 700, marginBottom: 8 }}>
            📨 INCOMING TRADE OFFER — {cpuOffer.fromTeamName}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 12, marginBottom: 10 }}>
            <div>
              <div style={{ color: T.textDim, fontSize: 10, marginBottom: 4 }}>THEY WANT</div>
              <div style={{ color: T.textPrimary }}>{cpuOffer.requestedPlayer.first_name} {cpuOffer.requestedPlayer.last_name}</div>
              <div style={{ color: T.textDim, fontSize: 11 }}>{cpuOffer.requestedPlayer.position} · {cpuOffer.requestedPlayer.overall_rating} OVR · Value: {cpuOffer.requestedValue}</div>
            </div>
            <div style={{ color: T.textDim, fontSize: 18, alignSelf: 'center' }}>⇄</div>
            <div>
              <div style={{ color: T.textDim, fontSize: 10, marginBottom: 4 }}>YOU RECEIVE</div>
              <div style={{ color: T.textPrimary }}>{cpuOffer.offeredPlayer.first_name} {cpuOffer.offeredPlayer.last_name}</div>
              <div style={{ color: T.textDim, fontSize: 11 }}>{cpuOffer.offeredPlayer.position} · {cpuOffer.offeredPlayer.overall_rating} OVR</div>
              {cpuOffer.offeredPick && (
                <div style={{ color: '#4FC3F7', fontSize: 11 }}>+ 📋 {pickLabel(cpuOffer.offeredPick, currentSeason)}</div>
              )}
              <div style={{ color: '#4caf50', fontSize: 11, fontWeight: 700 }}>Total Value: {cpuOffer.offerValue}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAcceptOffer} disabled={offerWorking}
              style={{ padding: '6px 16px', background: '#4caf50', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              {offerWorking ? 'Processing...' : 'Accept'}
            </button>
            <button onClick={() => setOfferHandled(true)}
              style={{ padding: '6px 16px', background: T.bgCard, color: T.textMuted, border: `1px solid ${T.borderFaint}`, borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Team Selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 8, letterSpacing: 1 }}>SELECT TEAM TO TRADE WITH</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => handleSelectTeam(t.id)}
              style={{ padding: '5px 12px', background: selectedTeamId === t.id ? '#FF8740' : T.bgCard, color: selectedTeamId === t.id ? '#000' : T.textMuted, border: `1px solid ${selectedTeamId === t.id ? '#FF8740' : T.borderFaint}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: selectedTeamId === t.id ? 700 : 400 }}>
              {t.city} {t.name}
            </button>
          ))}
        </div>
      </div>

      {!selectedTeamId ? (
        <div style={{ color: T.textDim, fontSize: 13, padding: 20, textAlign: 'center' }}>Select a team above to build a trade.</div>
      ) : (
        <>
          {/* Team Status Banner */}
          {teamStatus && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: statusMeta.bg, border: `1px solid ${statusMeta.color}22`, borderRadius: 6, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>{selectedTeam?.city} {selectedTeam?.name}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', background: statusMeta.color + '33', color: statusMeta.color, borderRadius: 3, fontWeight: 800, letterSpacing: 1 }}>
                    {teamStatus.status.toUpperCase()}
                  </span>
                  {teamStatus.isOverridden && (
                    <span style={{ fontSize: 9, color: T.textDim, background: T.bgInput, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5 }}>MANUAL</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{teamStatus.description}</div>
              </div>

              <div style={{ display: 'flex', gap: 16, fontSize: 12, alignItems: 'center' }}>
                <span style={{ color: T.textMuted }}>{teamStatus.wins}–{teamStatus.losses}</span>
                <span style={{ color: T.textMuted }}>Avg OVR: {teamStatus.avgOverall}</span>
              </div>

              {/* Status Override */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5 }}>OVERRIDE</span>
                <select
                  disabled={savingOverride}
                  value={teamStatus.isOverridden ? teamStatus.status : 'auto'}
                  onChange={e => handleSetOverride(e.target.value)}
                  style={{
                    fontSize: 11, background: T.bgInput, color: T.textPrimary,
                    border: `1px solid ${T.borderFaint}`, borderRadius: 4,
                    padding: '3px 6px', cursor: savingOverride ? 'wait' : 'pointer',
                    opacity: savingOverride ? 0.5 : 1,
                  }}
                >
                  <option value="auto">⚙ Auto-detect</option>
                  <option value="Contender">🏆 Contender</option>
                  <option value="Buyer">📈 Buyer</option>
                  <option value="Neutral">➖ Neutral</option>
                  <option value="Seller">📉 Seller</option>
                  <option value="Rebuilding">🔄 Rebuilding</option>
                </select>
              </div>
            </div>
          )}

          {/* Trade Builder */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 1fr', gap: 12 }}>

            {/* My Roster Panel */}
            <RosterPanel
              title="YOUR ROSTER" subtitle={userTeam.city + ' ' + userTeam.name}
              players={myFiltered} picks={myPicks}
              selectedPlayers={mySelected} selectedPicks={myPicksSelected}
              posFilter={myPos} onPosFilter={setMyPos}
              onTogglePlayer={toggleMine} onTogglePick={toggleMyPick}
              accent="#FF8740" needs={needs} currentSeason={currentSeason}
            />

            {/* Trade Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: T.bgPanel, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: '12px 14px', flex: 1 }}>
                <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 1, marginBottom: 8 }}>YOU OFFER</div>
                {mySelected.length === 0 && myPicksSelected.length === 0
                  ? <div style={{ color: T.textDim, fontSize: 11 }}>No assets selected</div>
                  : <>
                    {mySelected.map(id => {
                      const p = myRoster.find(x => x.id === id);
                      return p ? (
                        <div key={id} style={{ fontSize: 11, color: T.textMuted, marginBottom: 3 }}>
                          <span style={{ color: T.textPrimary }}>{p.first_name} {p.last_name}</span>
                          <span style={{ color: T.textDim }}> · {p.position} · {p.overall_rating} OVR</span>
                        </div>
                      ) : null;
                    })}
                    {myPicksSelected.map(id => {
                      const pk = myPicks.find(x => x.id === id);
                      return pk ? (
                        <div key={id} style={{ fontSize: 11, color: '#4FC3F7', marginBottom: 3 }}>
                          📋 {pickLabel(pk, currentSeason)} · {calcPickValue(pk.round, pk.season, currentSeason)} val
                        </div>
                      ) : null;
                    })}
                    <div style={{ fontSize: 12, color: '#FF8740', fontWeight: 700, marginTop: 6 }}>Value: {myValue}</div>
                  </>
                }
              </div>

              <div style={{ background: T.bgPanel, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: '12px 14px', flex: 1 }}>
                <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 1, marginBottom: 8 }}>YOU RECEIVE</div>
                {theirSelected.length === 0 && theirPicksSelected.length === 0
                  ? <div style={{ color: T.textDim, fontSize: 11 }}>No assets selected</div>
                  : <>
                    {theirSelected.map(id => {
                      const p = theirRoster.find(x => x.id === id);
                      return p ? (
                        <div key={id} style={{ fontSize: 11, color: T.textMuted, marginBottom: 3 }}>
                          <span style={{ color: T.textPrimary }}>{p.first_name} {p.last_name}</span>
                          <span style={{ color: T.textDim }}> · {p.position} · {p.overall_rating} OVR</span>
                        </div>
                      ) : null;
                    })}
                    {theirPicksSelected.map(id => {
                      const pk = theirPicks.find(x => x.id === id);
                      return pk ? (
                        <div key={id} style={{ fontSize: 11, color: '#4FC3F7', marginBottom: 3 }}>
                          📋 {pickLabel(pk, currentSeason)} · {calcPickValue(pk.round, pk.season, currentSeason)} val
                        </div>
                      ) : null;
                    })}
                    <div style={{ fontSize: 12, color: '#4FC3F7', fontWeight: 700, marginTop: 6 }}>Value: {theirValue}</div>
                  </>
                }
              </div>

              {/* Value Bar */}
              {canPropose && myValue > 0 && theirValue > 0 && (
                <div>
                  <div style={{ height: 6, background: T.bgCard, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (myValue / (myValue + theirValue)) * 100)}%`, background: '#FF8740', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textDim }}>
                    <span>Give: {myValue}</span>
                    <span>Get: {theirValue}</span>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: likelihoodColor[likelihood], textAlign: 'center', padding: '4px 0' }}>
                {likelihoodText[likelihood]}
              </div>

              <button onClick={handlePropose} disabled={!canPropose || proposing || isPastDeadline}
                style={{ padding: '8px', background: canPropose && !isPastDeadline ? '#FF8740' : T.bgCard, color: canPropose && !isPastDeadline ? '#000' : T.textDim, border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 12, cursor: canPropose && !isPastDeadline ? 'pointer' : 'not-allowed' }}>
                {proposing ? 'Proposing...' : isPastDeadline ? 'DEADLINE PASSED' : 'Propose Trade'}
              </button>

              {result && (
                <div style={{ padding: '8px 12px', borderRadius: 4, background: result.accepted ? '#1a3a1a' : '#1a0d0d', border: `1px solid ${result.accepted ? '#4caf50' : '#e57373'}`, fontSize: 12, color: result.accepted ? '#4caf50' : '#e57373', textAlign: 'center' }}>
                  {result.accepted ? '✓ Trade accepted! Rosters updated.' : `✗ ${result.reason}`}
                </div>
              )}
            </div>

            {/* Their Roster Panel */}
            <RosterPanel
              title={`${selectedTeam?.city?.toUpperCase() ?? ''} ${selectedTeam?.name?.toUpperCase() ?? ''}`}
              subtitle={teamStatus ? `${teamStatus.wins}–${teamStatus.losses} · ${teamStatus.status}` : ''}
              players={theirFiltered} picks={theirPicks}
              selectedPlayers={theirSelected} selectedPicks={theirPicksSelected}
              posFilter={theirPos} onPosFilter={setTheirPos}
              onTogglePlayer={toggleTheirs} onTogglePick={toggleTheirPick}
              accent="#4FC3F7" currentSeason={currentSeason}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface RosterPanelProps {
  title: string; subtitle: string;
  players: Player[]; picks: DraftPick[];
  selectedPlayers: number[]; selectedPicks: number[];
  posFilter: string; onPosFilter: (p: string) => void;
  onTogglePlayer: (id: number) => void; onTogglePick: (id: number) => void;
  accent: string; needs?: TeamNeed[]; currentSeason: number;
}

function RosterPanel({ title, subtitle, players, picks, selectedPlayers, selectedPicks, posFilter, onPosFilter, onTogglePlayer, onTogglePick, accent, needs, currentSeason }: RosterPanelProps) {
  const [showPicks, setShowPicks] = useState(false);

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', maxHeight: 700 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: T.textMuted }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {POSITIONS.map(pos => (
          <button key={pos} onClick={() => onPosFilter(pos)}
            style={{ padding: '2px 6px', background: posFilter === pos ? accent : T.bgCard, border: `1px solid ${posFilter === pos ? accent : T.borderFaint}`, borderRadius: 3, color: posFilter === pos ? '#000' : T.textMuted, fontSize: 10, cursor: 'pointer', fontWeight: posFilter === pos ? 'bold' : 'normal' }}>
            {pos}
          </button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {players.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12, padding: 8 }}>No players</div>
        ) : players.map(player => {
          const isSelected = selectedPlayers.includes(player.id);
          const traj = trajectory(player.age);
          const val = calcTradeValue(player.overall_rating, player.age, player.position, player.dev_trait);
          const traitColor = TRAIT_META[player.dev_trait]?.color ?? T.textDim;
          const showTrait = player.dev_trait && player.dev_trait !== 'Normal';
          const need = needs?.find(n => n.position === player.position);
          return (
            <div key={player.id} onClick={() => onTogglePlayer(player.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', marginBottom: 3, background: isSelected ? T.bgSelected : T.bgCard, border: `1px solid ${isSelected ? accent : 'transparent'}`, borderRadius: 4, cursor: 'pointer' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: T.textPrimary }}>{player.first_name} {player.last_name}</span>
                  {showTrait && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: traitColor + '22', color: traitColor, fontWeight: 700 }}>{player.dev_trait === 'X-Factor' ? 'XF' : player.dev_trait === 'Superstar' ? 'SS' : 'S'}</span>}
                  {need && <span style={{ fontSize: 8, padding: '1px 4px', background: need.severity === 'critical' ? '#3a1a1a' : '#2a2a1a', color: need.severity === 'critical' ? '#e57373' : '#e8b800', borderRadius: 2, fontWeight: 800 }}>NEED</span>}
                </div>
                <div style={{ fontSize: 10, color: T.textDim }}>{player.position_label || player.position} · {player.age} · <span style={{ color: traj.color }}>{traj.label}</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: ratingColor(player.overall_rating), fontWeight: 700 }}>{player.overall_rating}</div>
                <div style={{ fontSize: 10, color: T.textDim }}>{val} val</div>
              </div>
            </div>
          );
        })}

        {/* Draft Picks Section */}
        {picks.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setShowPicks(!showPicks)}
              style={{ width: '100%', padding: '5px 8px', background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted, fontSize: 10, cursor: 'pointer', textAlign: 'left', letterSpacing: 1 }}>
              {showPicks ? '▾' : '▸'} DRAFT PICKS ({picks.length})
            </button>
            {showPicks && picks.map(pk => {
              const isSelected = selectedPicks.includes(pk.id);
              const val = calcPickValue(pk.round, pk.season, currentSeason);
              return (
                <div key={pk.id} onClick={() => onTogglePick(pk.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', marginTop: 3, background: isSelected ? T.bgSelected : T.bgCard, border: `1px solid ${isSelected ? accent : 'transparent'}`, borderRadius: 4, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#4FC3F7' }}>📋 {pickLabel(pk, currentSeason)}</div>
                    <div style={{ fontSize: 10, color: T.textDim }}>{pk.season <= currentSeason ? 'Current year' : 'Next year'}</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{val} val</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(selectedPlayers.length > 0 || selectedPicks.length > 0) && (
        <div style={{ fontSize: 10, color: accent, marginTop: 8, paddingTop: 6, borderTop: `1px solid ${T.borderFaint}` }}>
          {selectedPlayers.length} player{selectedPlayers.length !== 1 ? 's' : ''}{selectedPicks.length > 0 ? ` + ${selectedPicks.length} pick${selectedPicks.length !== 1 ? 's' : ''}` : ''} selected
        </div>
      )}
    </div>
  );
}
