import React, { useEffect, useState } from 'react';

declare const window: any;

interface Team {
  id: number;
  city: string;
  name: string;
  conference: string;
}

interface Player {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
}

interface TeamStatus {
  status: string;
  description: string;
  acceptanceThreshold: number;
  wins: number;
  losses: number;
  avgOverall: number;
}

interface TradeResult {
  accepted: boolean;
  reason?: string;
}

interface TeamNeed {
  position: string;
  severity: 'critical' | 'depth';
}

interface Props {
  userTeam: { id: number; city: string; name: string };
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

const STATUS_META: Record<string, { color: string; bg: string }> = {
  Contender:  { color: '#FFD700', bg: '#1a1500' },
  Buyer:      { color: '#4caf50', bg: '#0a1a0a' },
  Seller:     { color: '#4FC3F7', bg: '#001a2a' },
  Rebuilding: { color: '#9E9E9E', bg: '#141414' },
  Neutral:    { color: '#FF8740', bg: '#1a0f00' },
};

const TRAIT_META: Record<string, { color: string }> = {
  'Normal':    { color: '#444' },
  'Star':      { color: '#4FC3F7' },
  'Superstar': { color: '#FF8740' },
  'X-Factor':  { color: '#FFD700' },
};

function ratingColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4caf50';
  if (r >= 70) return '#FF8740';
  return '#888';
}

function calcTradeValue(overall: number, age: number, position: string, devTrait: string = 'Normal'): number {
  const ageFactor =
    age <= 23 ? 1.4 :
    age <= 26 ? 1.25 :
    age <= 29 ? 1.0 :
    age <= 32 ? 0.75 :
    age <= 35 ? 0.5 : 0.3;

  const posFactor: Record<string, number> = {
    QB: 1.4, CB: 1.15, DL: 1.15, LB: 1.1,
    WR: 1.1, TE: 1.1, OL: 1.05, S: 1.0, RB: 0.85, K: 0.7,
  };

  const traitFactor: Record<string, number> = {
    'Normal': 1.0, 'Star': 1.15, 'Superstar': 1.3, 'X-Factor': 1.5,
  };

  return Math.round(overall * ageFactor * (posFactor[position] ?? 1.0) * (traitFactor[devTrait] ?? 1.0));
}

function trajectory(age: number): { label: string; color: string } {
  if (age <= 26) return { label: '↑ Rising', color: '#4caf50' };
  if (age <= 30) return { label: '→ Prime',  color: '#FF8740' };
  return { label: '↓ Declining', color: '#777' };
}

export default function Trades({ userTeam }: Props) {
  const [teams, setTeams]               = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamStatus, setTeamStatus]     = useState<TeamStatus | null>(null);
  const [myRoster, setMyRoster]         = useState<Player[]>([]);
  const [theirRoster, setTheirRoster]   = useState<Player[]>([]);
  const [mySelected, setMySelected]     = useState<number[]>([]);
  const [theirSelected, setTheirSelected] = useState<number[]>([]);
  const [myPos, setMyPos]               = useState('ALL');
  const [theirPos, setTheirPos]         = useState('ALL');
  const [result, setResult]             = useState<TradeResult | null>(null);
  const [proposing, setProposing]       = useState(false);
  const [needs, setNeeds]               = useState<TeamNeed[]>([]);
  const [weekInfo, setWeekInfo] = useState<{ hasSchedule: boolean; currentWeek: number | null } | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getTeams(),
      window.api.getRoster(userTeam.id),
      window.api.getTeamNeeds(userTeam.id),
      window.api.getCurrentWeek(),
    ]).then(([allTeams, roster, n, wi]: [Team[], Player[], TeamNeed[], any]) => {
      setTeams(allTeams.filter(t => t.id !== userTeam.id));
      setMyRoster(roster);
      setNeeds(n);
      setWeekInfo(wi);
    });
  }, [userTeam.id]);

  const handleSelectTeam = async (teamId: number) => {
    setSelectedTeamId(teamId);
    setMySelected([]);
    setTheirSelected([]);
    setResult(null);
    setTeamStatus(null);
    const [roster, status] = await Promise.all([
      window.api.getRoster(teamId),
      window.api.getTeamStatus(teamId),
    ]);
    setTheirRoster(roster);
    setTeamStatus(status);
  };

  const toggleMine = (id: number) => {
    setResult(null);
    setMySelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleTheirs = (id: number) => {
    setResult(null);
    setTheirSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePropose = async () => {
    if (!canPropose) return;
    setProposing(true);
    const res = await window.api.proposeTrade({
      myPlayerIds: mySelected,
      theirPlayerIds: theirSelected,
      theirTeamId: selectedTeamId!,
    });
    setResult(res);
    if (res.accepted) {
      const [myNew, theirNew] = await Promise.all([
        window.api.getRoster(userTeam.id),
        window.api.getRoster(selectedTeamId!),
      ]);
      setMyRoster(myNew);
      setTheirRoster(theirNew);
      setMySelected([]);
      setTheirSelected([]);
    }
    setProposing(false);
  };

  const myFiltered    = myRoster.filter(p => myPos === 'ALL' || p.position === myPos);
  const theirFiltered = theirRoster.filter(p => theirPos === 'ALL' || p.position === theirPos);

  const myValue = mySelected.reduce((s, id) => {
    const p = myRoster.find(x => x.id === id);
    return s + (p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0);
  }, 0);

  const theirValue = theirSelected.reduce((s, id) => {
    const p = theirRoster.find(x => x.id === id);
    return s + (p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0);
  }, 0);

  const canPropose    = mySelected.length > 0 && theirSelected.length > 0 && selectedTeamId !== null;
  const selectedTeam  = teams.find(t => t.id === selectedTeamId);
  const statusMeta    = STATUS_META[teamStatus?.status ?? ''] ?? STATUS_META['Neutral'];
  const DEADLINE = 8;
  const isPastDeadline = !!(weekInfo?.hasSchedule && (!weekInfo.currentWeek || weekInfo.currentWeek > DEADLINE));
  const weeksToDeadline = weekInfo?.currentWeek ? Math.max(0, DEADLINE - weekInfo.currentWeek + 1) : null;

  const threshold = teamStatus?.acceptanceThreshold ?? -8;
  const margin    = (myValue - theirValue) - threshold;
  const likelihood =
    !canPropose ? 'idle' :
    margin >= 5  ? 'yes'  :
    margin >= -5 ? 'maybe' : 'no';

  const likelihoodText: Record<string, string> = {
    idle:  'Select players from both sides to propose',
    yes:   `✓ ${teamStatus?.status ?? 'CPU'} will likely accept`,
    maybe: '~ Borderline — may accept or decline',
    no:    `✗ ${teamStatus?.status ?? 'CPU'} will likely decline — offer more value`,
  };
  const likelihoodColor: Record<string, string> = {
    idle: '#333', yes: '#4caf50', maybe: '#FF8740', no: '#e57373',
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>Trade Center</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#444', fontSize: 12 }}>Trade with:</span>
          <select
            onChange={e => e.target.value && handleSelectTeam(Number(e.target.value))}
            style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5, color: '#ccc', padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
          >
            <option value="">— Select a team —</option>
            {(['AFC', 'NFC'] as const).map(conf => (
              <optgroup key={conf} label={conf}>
                {teams.filter(t => t.conference === conf).map(t => (
                  <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

       {/* Deadline Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
        background: isPastDeadline ? '#1a0505' : '#0a1a0a',
        border: `1px solid ${isPastDeadline ? '#e5737333' : '#4caf5033'}`,
        borderRadius: 6, marginBottom: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isPastDeadline ? '#e57373' : '#4caf50' }}>
          {isPastDeadline ? '🔒 TRADE DEADLINE PASSED' : '🟢 TRADES OPEN'}
        </span>
        <span style={{ color: '#444', fontSize: 11 }}>
          {isPastDeadline
            ? 'Trades are locked after Week 8 · Reopen in the offseason'
            : weeksToDeadline !== null
              ? `Deadline is Week 8 · ${weeksToDeadline} week${weeksToDeadline !== 1 ? 's' : ''} remaining`
              : 'Deadline is Week 8 of the regular season'}
        </span>
      </div>
      {/* Team Needs Strip */}
      {needs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ color: '#555', fontSize: 10, letterSpacing: 1, marginRight: 4 }}>YOUR NEEDS</span>
          {needs.map(n => (
            <span key={n.position} style={{
              background: n.severity === 'critical' ? '#3a0a0a' : '#1a1500',
              border: `1px solid ${n.severity === 'critical' ? '#e57373' : '#e8b800'}`,
              color: n.severity === 'critical' ? '#e57373' : '#e8b800',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            }}>{n.position}</span>
          ))}
        </div>
      )}

      {!selectedTeamId ? (
        <div style={{ color: '#444', padding: '40px 0', fontSize: 13 }}>Select a team above to build a trade.</div>
      ) : (
        <>
          {/* Team Status Banner */}
          {teamStatus && (
            <div style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.color}33`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
                    {selectedTeam?.city} {selectedTeam?.name}
                  </span>
                  <span style={{ background: statusMeta.color, color: '#000', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 3, letterSpacing: 1 }}>
                    {teamStatus.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ color: '#666', fontSize: 11, marginTop: 3 }}>{teamStatus.description}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: statusMeta.color, fontWeight: 700, fontSize: 16 }}>{teamStatus.wins}–{teamStatus.losses}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#888', fontSize: 11 }}>Avg OVR: {teamStatus.avgOverall}</div>
                </div>
              </div>
            </div>
          )}

          {/* Two-panel roster builder */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <RosterPanel
              title={`${userTeam.city} ${userTeam.name}`}
              subtitle="Your roster — select players to offer"
              players={myFiltered}
              selected={mySelected}
              posFilter={myPos}
              onPosFilter={setMyPos}
              onToggle={toggleMine}
              accent="#e57373"
            />
            <RosterPanel
              title={`${selectedTeam?.city} ${selectedTeam?.name}`}
              subtitle="Their roster — select players to request"
              players={theirFiltered}
              selected={theirSelected}
              posFilter={theirPos}
              onPosFilter={setTheirPos}
              onToggle={toggleTheirs}
              accent="#4FC3F7"
              needs={needs}
            />
          </div>

          {/* Trade summary bar */}
          <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

              {/* You offer */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>YOU OFFER</div>
                {mySelected.length === 0
                  ? <div style={{ color: '#333', fontSize: 12 }}>No players selected</div>
                  : mySelected.map(id => {
                      const p = myRoster.find(x => x.id === id);
                      return p ? (
                        <div key={id} style={{ color: '#ccc', fontSize: 12, marginBottom: 3 }}>
                          {p.first_name} {p.last_name}
                          {p.dev_trait && p.dev_trait !== 'Normal' && (
                            <span style={{ color: TRAIT_META[p.dev_trait]?.color, fontSize: 10 }}> · {p.dev_trait}</span>
                          )}
                          <span style={{ color: '#555' }}> · {p.position_label || p.position} · </span>
                          <span style={{ color: ratingColor(p.overall_rating) }}>{p.overall_rating} OVR</span>
                          <span style={{ color: '#444' }}> · {calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait)} val</span>
                        </div>
                      ) : null;
                    })}
                {mySelected.length > 0 && (
                  <div style={{ color: '#e57373', fontWeight: 700, fontSize: 12, marginTop: 6 }}>
                    Total Value: {myValue}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', color: '#444', fontSize: 20, padding: '0 8px' }}>⇄</div>

              {/* You receive */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>YOU RECEIVE</div>
                {theirSelected.length === 0
                  ? <div style={{ color: '#333', fontSize: 12 }}>No players selected</div>
                  : theirSelected.map(id => {
                      const p = theirRoster.find(x => x.id === id);
                      return p ? (
                        <div key={id} style={{ color: '#ccc', fontSize: 12, marginBottom: 3 }}>
                          {p.first_name} {p.last_name}
                          {p.dev_trait && p.dev_trait !== 'Normal' && (
                            <span style={{ color: TRAIT_META[p.dev_trait]?.color, fontSize: 10 }}> · {p.dev_trait}</span>
                          )}
                          <span style={{ color: '#555' }}> · {p.position_label || p.position} · </span>
                          <span style={{ color: ratingColor(p.overall_rating) }}>{p.overall_rating} OVR</span>
                          <span style={{ color: '#444' }}> · {calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait)} val</span>
                        </div>
                      ) : null;
                    })}
                {theirSelected.length > 0 && (
                  <div style={{ color: '#4FC3F7', fontWeight: 700, fontSize: 12, marginTop: 6 }}>
                    Total Value: {theirValue}
                  </div>
                )}
              </div>
            </div>

            {/* Value bar */}
            {canPropose && myValue > 0 && theirValue > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#0a0a0a' }}>
                  <div style={{ width: `${(myValue / (myValue + theirValue)) * 100}%`, background: '#e57373' }} />
                  <div style={{ flex: 1, background: '#4FC3F7' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#e57373', fontSize: 10 }}>You give: {myValue}</span>
                  <span style={{ color: '#4FC3F7', fontSize: 10 }}>You get: {theirValue}</span>
                </div>
              </div>
            )}

            {/* Likelihood + propose */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <div style={{ color: likelihoodColor[likelihood], fontSize: 12, flex: 1 }}>
                {likelihoodText[likelihood]}
              </div>
              <button
                onClick={handlePropose}
                disabled={!canPropose || proposing || isPastDeadline}
                style={{
                  padding: '8px 20px', background: canPropose ? '#1a3a1a' : '#111',
                  border: `1px solid ${canPropose ? '#4caf50' : '#2a2a2a'}`,
                  borderRadius: 5, color: canPropose ? '#4caf50' : '#333',
                  fontSize: 12, fontWeight: 700, cursor: canPropose ? 'pointer' : 'default',
                  letterSpacing: 0.5,
                }}
              >
                {proposing ? 'Proposing...' : 'Propose Trade'}
              </button>
            </div>

            {result && (
              <div style={{ marginTop: 10, color: result.accepted ? '#4caf50' : '#e57373', fontSize: 13, fontWeight: 600 }}>
                {result.accepted ? '✓ Trade accepted! Rosters updated.' : `✗ ${result.reason}`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Roster Panel ─────────────────────────────────────────────────────────────

interface RosterPanelProps {
  title: string;
  subtitle: string;
  players: Player[];
  selected: number[];
  posFilter: string;
  onPosFilter: (p: string) => void;
  onToggle: (id: number) => void;
  accent: string;
  needs?: TeamNeed[];
}

function RosterPanel({ title, subtitle, players, selected, posFilter, onPosFilter, onToggle, accent, needs }: RosterPanelProps) {
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{title}</div>
        <div style={{ color: '#444', fontSize: 11 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {POSITIONS.map(pos => (
          <button key={pos} onClick={() => onPosFilter(pos)}
            style={{
              padding: '2px 7px',
              background: posFilter === pos ? accent : '#141414',
              border: `1px solid ${posFilter === pos ? accent : '#222'}`,
              borderRadius: 3,
              color: posFilter === pos ? '#000' : '#555',
              fontSize: 10, cursor: 'pointer',
              fontWeight: posFilter === pos ? 'bold' : 'normal',
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 420, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {players.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12, padding: 8 }}>No players</div>
        ) : (
          players.map(player => {
            const isSelected  = selected.includes(player.id);
            const traj        = trajectory(player.age);
            const val         = calcTradeValue(player.overall_rating, player.age, player.position, player.dev_trait);
            const traitColor  = TRAIT_META[player.dev_trait]?.color ?? '#444';
            const showTrait   = player.dev_trait && player.dev_trait !== 'Normal';
            const need        = needs?.find(n => n.position === player.position);
            return (
              <div key={player.id} onClick={() => onToggle(player.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', marginBottom: 3,
                  background: isSelected ? '#0a0e18' : '#141414',
                  border: `1px solid ${isSelected ? accent : '#1e1e1e'}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#ddd', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {player.first_name} {player.last_name}
                    </span>
                    {showTrait && (
                      <span style={{ background: traitColor, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>
                        {player.dev_trait === 'X-Factor' ? 'XF' : player.dev_trait === 'Superstar' ? 'SS' : 'S'}
                      </span>
                    )}
                    {need && (
                      <span style={{
                        background: need.severity === 'critical' ? '#e57373' : '#e8b800',
                        color: '#000', fontSize: 8, fontWeight: 800,
                        padding: '1px 4px', borderRadius: 3, letterSpacing: 0.5,
                      }}>NEED</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#555', fontSize: 10 }}>{player.position_label || player.position} · Age {player.age}</span>
                    <span style={{ color: traj.color, fontSize: 10 }}>{traj.label}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <span style={{ color: ratingColor(player.overall_rating), fontWeight: 700, fontSize: 13 }}>
                    {player.overall_rating}
                  </span>
                  <span style={{ color: '#444', fontSize: 10 }}>{val} val</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selected.length > 0 && (
        <div style={{ color: accent, fontSize: 11, fontWeight: 600, paddingTop: 4 }}>
          {selected.length} player{selected.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}