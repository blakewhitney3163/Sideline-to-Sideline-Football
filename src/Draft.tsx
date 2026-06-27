import React, { useEffect, useState, useRef } from 'react';
import { T } from './theme';
import { Prospect, DraftTeam, PickSlot, MyPick, CpuPick } from './draft/types';
import { MAX_SCOUTS, draftGrade, partialOvrRange } from './draft/draftUtils';
import ProspectBoard from './draft/ProspectBoard';
import MyPicksSidebar from './draft/MyPicksSidebar';
import DraftSummary from './draft/DraftSummary';
import { useGameStore } from './store/gameStore';

declare const window: any;

interface Props {
  onDraftComplete: () => void;
}

const POSITION_LABELS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL',
  DL: 'DL', LB: 'LB', CB: 'CB', S: 'S', K: 'K',
};

function classGradeLabel(rating: number): string {
  if (rating >= 85) return 'Elite';
  if (rating >= 75) return 'Strong';
  if (rating >= 65) return 'Average';
  if (rating >= 55) return 'Weak';
  return 'Poor';
}

function classGradeColor(rating: number): string {
  if (rating >= 85) return '#FFD700';
  if (rating >= 75) return '#4caf50';
  if (rating >= 65) return '#FF8740';
  if (rating >= 55) return '#ef5350';
  return '#666';
}

export default function Draft({ onDraftComplete }: Props) {
  const { userTeam, currentSeason, playoffsComplete, simCount } = useGameStore();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftTeam[]>([]);
  const [roundPickSlots, setRoundPickSlots] = useState<PickSlot[]>([]);
  const [userPickSlots, setUserPickSlots] = useState<number[]>([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [myPicks, setMyPicks] = useState<MyPick[]>([]);
  const [lastCpuPicks, setLastCpuPicks] = useState<CpuPick[]>([]);
  const [posFilter, setPosFilter] = useState('ALL');
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [draftFinished, setDraftFinished] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [scoutsUsed, setScoutsUsed] = useState(0);
  const [scoutBudget, setScoutBudget] = useState(25);
  const [scouting, setScouting] = useState<number | null>(null);
  const [classStrength, setClassStrength] = useState<Record<string, number> | null>(null);
  const [reminderVisible, setReminderVisible] = useState(false);

  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMyPickAssetId, setTradeMyPickAssetId] = useState<number | null>(null);
  const [tradeTheirTeamId, setTradeTheirTeamId] = useState<number | null>(null);
  const [tradeTheirPickAssetId, setTradeTheirPickAssetId] = useState<number | null>(null);
  const [tradeResult, setTradeResult] = useState<{ accepted: boolean; reason?: string } | null>(null);
  const [tradingPick, setTradingPick] = useState(false);

  const prevSimCount = useRef(simCount);

  useEffect(() => { loadDraft(); }, [userTeam?.id]);

  // Show weekly reminder whenever a new simulation happens and scouts are still available
  useEffect(() => {
    if (simCount !== prevSimCount.current) {
      prevSimCount.current = simCount;
      const available = scoutBudget - scoutsUsed;
      if (available > 0 && !playoffsComplete) {
        setReminderVisible(true);
      }
    }
  }, [simCount, scoutBudget, scoutsUsed, playoffsComplete]);

  const loadDraft = async () => {
    const [cls, order, sc, cs] = await Promise.all([
      window.api.getDraftClass(),
      window.api.getDraftOrder(),
      window.api.getScoutCount(),
      window.api.getDraftClassStrength(),
    ]);
    setProspects(cls);
    setDraftOrder(order);
    setScoutsUsed(sc?.used ?? sc ?? 0);
    setScoutBudget(sc?.budget ?? 25);
    setDraftGenerated(cls.length > 0);
    if (cs && typeof cs === 'object' && !cs.error) {
      setClassStrength(cs);
    }

    const drafted = cls.filter((p: Prospect) => p.is_drafted);
    const roundsDone = Math.floor(drafted.length / 32);
    if (roundsDone >= 7) {
      setDraftFinished(true);
      setCurrentRound(7);
    } else {
      const round = roundsDone + 1;
      setCurrentRound(round);
      await loadRoundSlots(round);
    }
    const mine = cls.filter((p: Prospect) => p.is_drafted && p.drafted_by_team_id === userTeam.id);
    setMyPicks(mine.map((p: Prospect) => {
      const gradeInfo = draftGrade(p.overall_rating);
      return {
        round: p.draft_round!,
        slot: (p.draft_pick! - 1) % 32 + 1,
        player: p,
        grade: gradeInfo.grade,
        gradeColor: gradeInfo.color,
      };
    }));
  };

  const loadRoundSlots = async (round: number) => {
    if (!userTeam) return;
    const slots: PickSlot[] = await window.api.getRoundPickOrder({ round });
    setRoundPickSlots(slots);
    const userSlots = slots
      .filter(slot => slot.ownerTeamId === userTeam.id && !slot.isUsed)
      .map(slot => slot.slot);
    setUserPickSlots(userSlots);
    setCurrentPickIdx(0);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await window.api.generateDraftClass();
    await loadDraft();
    setGenerating(false);
  };

  const handleScout = async (prospectId: number) => {
    if (scoutsUsed >= scoutBudget || scouting !== null) return;
    setScouting(prospectId);
    const result = await window.api.scoutProspect(prospectId);
    if (result.success) {
      setScoutsUsed(prev => prev + 1);
      setProspects(await window.api.getDraftClass());
      // Dismiss reminder once user acts on it
      setReminderVisible(false);
    }
    setScouting(null);
  };

  const handlePick = async (prospect: Prospect) => {
    if (running || !userTeam) return;
    setRunning(true);
    const slot = userPickSlots[currentPickIdx] ?? 1;
    const overallPick = (currentRound - 1) * 32 + slot;
    await window.api.makeDraftPick({
      prospectId: prospect.id,
      teamId: userTeam.id,
      round: currentRound,
      pick: overallPick,
    });

    const gradeInfo = draftGrade(prospect.overall_rating);
    setMyPicks(prev => [...prev, {
      round: currentRound,
      slot,
      player: prospect,
      grade: gradeInfo.grade,
      gradeColor: gradeInfo.color,
    }]);

    if (currentPickIdx < userPickSlots.length - 1) {
      setProspects(await window.api.getDraftClass());
      setCurrentPickIdx(prev => prev + 1);
      setRunning(false);
      return;
    }

    const cpuResults: CpuPick[] = await window.api.runCpuRound({
      round: currentRound,
      userTeamId: userTeam.id,
    });
    setLastCpuPicks(cpuResults);
    setProspects(await window.api.getDraftClass());
    setShowResults(true);
    setRunning(false);
  };

  const handleAutoPick = () => {
    const bestProspect = prospects.find(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
    if (bestProspect) {
      handlePick(bestProspect);
    }
  };

  const handleNextRound = async () => {
    if (currentRound >= 7) {
      setDraftFinished(true);
      return;
    }
    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    setShowResults(false);
    setLastCpuPicks([]);
    await loadRoundSlots(nextRound);
  };

  const handleCompleteDraft = async () => {
    setRunning(true);
    await window.api.completeDraft();
    setRunning(false);
    onDraftComplete();
  };

  const openTradeModal = () => {
    setTradeMyPickAssetId(null);
    setTradeTheirTeamId(null);
    setTradeTheirPickAssetId(null);
    setTradeResult(null);
    setShowTradeModal(true);
  };

  const handleProposeTrade = async () => {
    if (!userTeam || !tradeMyPickAssetId || !tradeTheirPickAssetId || !tradeTheirTeamId) return;
    setTradingPick(true);
    setTradeResult(null);
    const result = await window.api.proposeDraftTrade({
      userTeamId: userTeam.id,
      myPickId: tradeMyPickAssetId,
      theirTeamId: tradeTheirTeamId,
      theirPickId: tradeTheirPickAssetId,
    });
    setTradeResult(result);
    setTradingPick(false);
    if (result.accepted) {
      await loadRoundSlots(currentRound);
    }
  };

  if (!userTeam) return null;

  const scoutsLeft = scoutBudget - scoutsUsed;
  const available = prospects.filter(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
  const pickNum = userPickSlots[currentPickIdx];
  const totalPicksThisRound = userPickSlots.length;

  const myTradableSlots = roundPickSlots.filter(
    slot => slot.ownerTeamId === userTeam.id && !slot.isUsed && slot.pickAssetId !== null,
  );
  const cpuTeamIds = [...new Set(
    roundPickSlots
      .filter(slot => slot.ownerTeamId !== userTeam.id && !slot.isUsed)
      .map(slot => slot.ownerTeamId),
  )];
  const theirSlots = tradeTheirTeamId !== null
    ? roundPickSlots.filter(slot => slot.ownerTeamId === tradeTheirTeamId && !slot.isUsed && slot.pickAssetId !== null)
    : [];

  if (!draftGenerated) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>
          {currentSeason} Draft Scouting
        </div>
        <div style={{ color: T.textDim, fontSize: 13, marginBottom: 24 }}>
          The draft class will be auto-generated when you generate your season schedule.
          Come back once the season is underway to start scouting prospects.
        </div>
      </div>
    );
  }

  if (draftFinished) {
    return (
      <DraftSummary
        myPicks={myPicks}
        userTeam={userTeam}
        currentSeason={currentSeason}
        onComplete={handleCompleteDraft}
        running={running}
      />
    );
  }

  if (!playoffsComplete) {
    const scoutsAvailable = scoutBudget - scoutsUsed;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>
              {currentSeason} Draft — Scouting Season
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              Draft opens after playoffs · {prospects.filter(p => !p.is_drafted).length} prospects available
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>SCOUTS AVAILABLE</div>
            <div style={{
              color: scoutsAvailable >= 5 ? '#4caf50' : scoutsAvailable > 0 ? '#FF8740' : '#e57373',
              fontWeight: 700,
              fontSize: 16,
            }}>
              {scoutsAvailable} / {scoutBudget}
            </div>
            <div style={{ fontSize: 9, color: T.textDim }}>1st scout reveals range · 2nd reveals exact OVR</div>
          </div>
        </div>

        {/* Weekly reminder banner */}
        {reminderVisible && scoutsAvailable > 0 && (
          <div style={{
            background: '#1a1000', border: '1px solid #FF8740', borderRadius: 6,
            padding: '10px 16px', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 12, color: '#FF8740', fontWeight: 700, marginBottom: 2 }}>
                📬 Games simulated — deploy your scouts!
              </div>
              <div style={{ fontSize: 10, color: '#888' }}>
                You have <strong style={{ color: '#FF8740' }}>{scoutsAvailable}</strong> scout{scoutsAvailable !== 1 ? 's' : ''} available.
                First scout reveals an OVR range; a second scout unlocks the exact rating and dev trait.
              </div>
            </div>
            <button
              onClick={() => setReminderVisible(false)}
              style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
        )}

        {classStrength && (
          <div style={{
            background: '#07100f', border: '1px solid #1a2e1a', borderRadius: 6,
            padding: '10px 16px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 8 }}>
              {currentSeason} DRAFT CLASS STRENGTH
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(POSITION_LABELS).map(([pos, label]) => {
                const rating = classStrength[pos] ?? 0;
                return (
                  <div key={pos} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: '#0e1a0e', border: '1px solid #1e2e1e', borderRadius: 4,
                    padding: '4px 10px', minWidth: 48,
                  }}>
                    <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5 }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: classGradeColor(rating) }}>
                      {rating > 0 ? rating : '—'}
                    </span>
                    <span style={{ fontSize: 8, color: classGradeColor(rating) }}>
                      {rating > 0 ? classGradeLabel(rating) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{
          background: '#0a1000', border: '1px solid #1a2a1a', borderRadius: 6,
          padding: '10px 16px', marginBottom: 14, fontSize: 11, color: '#4caf50',
          fontFamily: 'monospace',
        }}>
          📋 Scouting mode — 1st scout reveals OVR range &amp; position tier · 2nd scout reveals exact OVR &amp; dev trait.
          Pick buttons unlock after playoffs complete.
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'].map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  padding: '3px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: posFilter === pos ? '#FF8740' : '#141414',
                  border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`,
                  color: posFilter === pos ? '#000' : '#555', fontFamily: 'monospace',
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {prospects
            .filter(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter))
            .slice(0, 60)
            .map(p => {
              const scoutLevel = p.scouted ?? 0;
              const isScouting = scouting === p.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', marginBottom: 3, borderRadius: 4,
                  background: '#0e0e0e', border: '1px solid #161616',
                }}>
                  {/* OVR / range display */}
                  <span style={{
                    width: 52, textAlign: 'center', fontWeight: 700, fontSize: 13,
                    color: scoutLevel >= 2
                      ? (p.overall_rating >= 80 ? '#FFD700' : p.overall_rating >= 70 ? '#4FC3F7' : '#888')
                      : scoutLevel === 1 ? '#FF8740' : '#333',
                  }}>
                    {scoutLevel >= 2
                      ? p.overall_rating
                      : scoutLevel === 1
                      ? partialOvrRange(p.id, p.overall_rating)
                      : '??'
                    }
                  </span>

                  <span style={{ flex: 1, fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
                    {p.first_name} {p.last_name}
                    <span style={{ color: '#555', marginLeft: 8, fontSize: 10 }}>
                      {p.position} · Age {p.age}
                    </span>
                    {scoutLevel === 1 && (
                      <span style={{ color: '#555', marginLeft: 8, fontSize: 10 }}>· Dev: ?</span>
                    )}
                    {scoutLevel >= 2 && p.dev_trait && p.dev_trait !== 'Normal' && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                        background: p.dev_trait === 'X-Factor' ? '#4a4020' : p.dev_trait === 'Superstar' ? '#4a3020' : '#2d3f5a',
                        color: p.dev_trait === 'X-Factor' ? '#FFD700' : p.dev_trait === 'Superstar' ? '#FF8740' : '#4FC3F7',
                      }}>
                        {p.dev_trait === 'X-Factor' ? 'XF' : p.dev_trait === 'Superstar' ? 'SS' : 'S'}
                      </span>
                    )}
                  </span>

                  {/* Scout / Deep Scout / Scouted indicator */}
                  {scoutLevel === 0 && (
                    <button
                      onClick={() => handleScout(p.id)}
                      disabled={scoutsAvailable <= 0 || isScouting}
                      style={{
                        padding: '3px 10px', fontSize: 10,
                        cursor: scoutsAvailable > 0 ? 'pointer' : 'not-allowed',
                        borderRadius: 3, background: '#141414',
                        border: `1px solid ${scoutsAvailable > 0 ? '#2a4a2a' : '#222'}`,
                        color: scoutsAvailable > 0 ? '#4caf50' : '#333', fontFamily: 'monospace',
                      }}
                    >
                      {isScouting ? '...' : '🔍 Scout'}
                    </button>
                  )}
                  {scoutLevel === 1 && (
                    <button
                      onClick={() => handleScout(p.id)}
                      disabled={scoutsAvailable <= 0 || isScouting}
                      title="Spend 1 more scout to unlock exact OVR and dev trait"
                      style={{
                        padding: '3px 10px', fontSize: 10,
                        cursor: scoutsAvailable > 0 ? 'pointer' : 'not-allowed',
                        borderRadius: 3, background: '#1a0d00',
                        border: `1px solid ${scoutsAvailable > 0 ? '#FF8740' : '#333'}`,
                        color: scoutsAvailable > 0 ? '#FF8740' : '#333', fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isScouting ? '...' : '🔍 Deep Scout'}
                    </button>
                  )}
                  {scoutLevel >= 2 && (
                    <span style={{ fontSize: 10, color: '#2a5a2a', fontFamily: 'monospace' }}>✓ Scouted</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>
            {currentSeason} NFL Draft
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
            Round {currentRound} of 7 &nbsp;·&nbsp; {available.length} prospects available
            {totalPicksThisRound > 1 && !showResults && (
              <span style={{ color: '#FF8740', marginLeft: 8 }}>
                You have {totalPicksThisRound} picks this round (Pick {currentPickIdx + 1} of {totalPicksThisRound})
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {myTradableSlots.length > 0 && !showResults && !running && (
            <button
              onClick={openTradeModal}
              style={{
                padding: '5px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                background: '#0d1a2a', border: '1px solid #1a4060',
                color: '#4FC3F7', fontFamily: 'monospace',
              }}
            >
              🔄 Trade Pick
            </button>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>SCOUTS</div>
            <div style={{
              color: scoutsLeft >= 5 ? '#4caf50' : scoutsLeft > 0 ? '#FF8740' : '#e57373',
              fontWeight: 700,
              fontSize: 16,
            }}>
              {scoutsLeft} / {scoutBudget}
            </div>
          </div>
        </div>
      </div>

      {running && !showResults && (
        <div style={{
          margin: '0 0 12px', padding: '12px 18px', borderRadius: 6,
          background: '#0d1a10', border: '1px solid #2a4a2a',
          color: '#4caf50', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span>CPU teams are drafting… please wait.</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', overflow: 'hidden' }}>
        <ProspectBoard
          available={available}
          posFilter={posFilter}
          setPosFilter={setPosFilter}
          showResults={showResults}
          userPickSlots={userPickSlots}
          currentPickIdx={currentPickIdx}
          currentRound={currentRound}
          pickNum={pickNum}
          totalPicksThisRound={totalPicksThisRound}
          myPicks={myPicks}
          lastCpuPicks={lastCpuPicks}
          roundPickSlots={roundPickSlots}
          draftOrder={draftOrder}
          scoutsLeft={scoutsLeft}
          scouting={scouting}
          running={running}
          userTeam={userTeam}
          onPick={handlePick}
          onAutoPick={handleAutoPick}
          onScout={handleScout}
          onNextRound={handleNextRound}
          currentSeason={currentSeason}
        />
        <MyPicksSidebar
          myPicks={myPicks}
          currentRound={currentRound}
          roundPickSlots={roundPickSlots}
          draftOrder={draftOrder}
          userTeam={userTeam}
        />
      </div>

      {showTradeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#111', border: '1px solid #2a2a2a', borderRadius: 8,
            padding: 28, width: 480, maxWidth: '90vw',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>
              Propose Pick Trade — Round {currentRound}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginBottom: 20 }}>
              Offer one of your picks in exchange for a CPU team's pick this round.
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>YOUR PICK TO OFFER</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {myTradableSlots.map(slot => (
                  <button
                    key={slot.pickAssetId}
                    onClick={() => setTradeMyPickAssetId(slot.pickAssetId)}
                    style={{
                      padding: '5px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                      background: tradeMyPickAssetId === slot.pickAssetId ? '#FF8740' : '#1a1a1a',
                      border: `1px solid ${tradeMyPickAssetId === slot.pickAssetId ? '#FF8740' : '#333'}`,
                      color: tradeMyPickAssetId === slot.pickAssetId ? '#000' : '#aaa',
                    }}
                  >
                    Round {currentRound}, Pick {slot.slot}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>SELECT CPU TEAM</div>
              <select
                value={tradeTheirTeamId ?? ''}
                onChange={e => {
                  setTradeTheirTeamId(e.target.value ? Number(e.target.value) : null);
                  setTradeTheirPickAssetId(null);
                }}
                style={{
                  background: '#1a1a1a', border: '1px solid #333', color: '#ccc',
                  padding: '6px 10px', borderRadius: 4, fontSize: 12, width: '100%',
                }}
              >
                <option value="">— Choose a team —</option>
                {cpuTeamIds.map(teamId => {
                  const slot = roundPickSlots.find(s => s.ownerTeamId === teamId);
                  return (
                    <option key={teamId} value={teamId}>
                      {slot ? `${slot.ownerCity} ${slot.ownerName}` : `Team ${teamId}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {tradeTheirTeamId !== null && theirSlots.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>
                  THEIR PICK YOU WANT
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {theirSlots.map(slot => (
                    <button
                      key={slot.pickAssetId}
                      onClick={() => setTradeTheirPickAssetId(slot.pickAssetId)}
                      style={{
                        padding: '5px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                        background: tradeTheirPickAssetId === slot.pickAssetId ? '#4FC3F7' : '#1a1a1a',
                        border: `1px solid ${tradeTheirPickAssetId === slot.pickAssetId ? '#4FC3F7' : '#333'}`,
                        color: tradeTheirPickAssetId === slot.pickAssetId ? '#000' : '#aaa',
                      }}
                    >
                      Round {currentRound}, Pick {slot.slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tradeResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 5, marginBottom: 16,
                background: tradeResult.accepted ? '#0d1a10' : '#1a0d0d',
                border: `1px solid ${tradeResult.accepted ? '#2a4a2a' : '#4a2a2a'}`,
                color: tradeResult.accepted ? '#4caf50' : '#ef5350',
                fontSize: 12,
              }}>
                {tradeResult.accepted
                  ? '✓ Trade accepted! The pick has been swapped.'
                  : `✗ Trade declined: ${tradeResult.reason}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowTradeModal(false)}
                style={{
                  padding: '7px 18px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                  background: 'transparent', border: '1px solid #333', color: '#888',
                }}
              >
                {tradeResult?.accepted ? 'Close' : 'Cancel'}
              </button>
              {!tradeResult?.accepted && (
                <button
                  onClick={handleProposeTrade}
                  disabled={!tradeMyPickAssetId || !tradeTheirPickAssetId || !tradeTheirTeamId || tradingPick}
                  style={{
                    padding: '7px 18px', fontSize: 12, borderRadius: 4,
                    cursor: tradeMyPickAssetId && tradeTheirPickAssetId && tradeTheirTeamId ? 'pointer' : 'not-allowed',
                    background: tradeMyPickAssetId && tradeTheirPickAssetId ? '#FF8740' : '#222',
                    border: 'none',
                    color: tradeMyPickAssetId && tradeTheirPickAssetId ? '#000' : '#444',
                    fontWeight: 600,
                  }}
                >
                  {tradingPick ? 'Proposing…' : 'Propose Trade'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
