import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Prospect, DraftTeam, PickSlot, MyPick, CpuPick } from './draft/types';
import { MAX_SCOUTS, draftGrade } from './draft/draftUtils';
import ProspectBoard from './draft/ProspectBoard';
import MyPicksSidebar from './draft/MyPicksSidebar';
import DraftSummary from './draft/DraftSummary';
import { useGameStore } from './store/gameStore';

declare const window: any;

interface Props {
  onDraftComplete: () => void;
}

export default function Draft({ onDraftComplete }: Props) {
  const { userTeam, currentSeason } = useGameStore();

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

  useEffect(() => { loadDraft(); }, [userTeam?.id]);

      const [cls, order, sc] = await Promise.all([
      window.api.getDraftClass(),
      window.api.getDraftOrder(),
      window.api.getScoutCount(),
    ]);
    setProspects(cls); setDraftOrder(order);
    setScoutsUsed(sc?.used ?? sc ?? 0);
    setScoutBudget(sc?.budget ?? 25);
    setDraftGenerated(cls.length > 0);

    const drafted = cls.filter((p: Prospect) => p.is_drafted);
    const roundsDone = Math.floor(drafted.length / 32);
    if (roundsDone >= 7) {
      setDraftFinished(true); setCurrentRound(7);
    } else {
      const round = roundsDone + 1;
      setCurrentRound(round);
      await loadRoundSlots(round);
    }
    const mine = cls.filter((p: Prospect) => p.is_drafted && p.drafted_by_team_id === userTeam.id);
    setMyPicks(mine.map((p: Prospect) => {
      const g = draftGrade(p.overall_rating);
      return { round: p.draft_round!, slot: (p.draft_pick! - 1) % 32 + 1, player: p, grade: g.grade, gradeColor: g.color };
    }));
  };

  const loadRoundSlots = async (round: number) => {
    if (!userTeam) return;
    const slots: PickSlot[] = await window.api.getRoundPickOrder({ round });
    setRoundPickSlots(slots);
    const uSlots = slots.filter(s => s.ownerTeamId === userTeam.id && !s.isUsed).map(s => s.slot);
    setUserPickSlots(uSlots);
    setCurrentPickIdx(0);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await window.api.generateDraftClass();
    await loadDraft();
    setGenerating(false);
  };

  const handleScout = async (prospectId: number) => {
    if (scoutsUsed >= MAX_SCOUTS || scouting !== null) return;
    setScouting(prospectId);
    const res = await window.api.scoutProspect(prospectId);
    if (res.success) {
      setScoutsUsed(s => s + 1);
      setProspects(await window.api.getDraftClass());
    }
    setScouting(null);
  };

  const handlePick = async (prospect: Prospect) => {
    if (running || !userTeam) return;
    setRunning(true);
    const slot = userPickSlots[currentPickIdx] ?? 1;
    const overallPick = (currentRound - 1) * 32 + slot;
    await window.api.makeDraftPick({ prospectId: prospect.id, teamId: userTeam.id, round: currentRound, pick: overallPick });

    const g = draftGrade(prospect.overall_rating);
    setMyPicks(prev => [...prev, { round: currentRound, slot, player: prospect, grade: g.grade, gradeColor: g.color }]);

    if (currentPickIdx < userPickSlots.length - 1) {
      setProspects(await window.api.getDraftClass());
      setCurrentPickIdx(prev => prev + 1);
      setRunning(false);
      return;
    }

    const cpuResults: CpuPick[] = await window.api.runCpuRound({ round: currentRound, userTeamId: userTeam.id });
    setLastCpuPicks(cpuResults);
    setProspects(await window.api.getDraftClass());
    setShowResults(true);
    setRunning(false);
  };

  const handleAutoPick = () => {
    const best = prospects.find(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
    if (best) handlePick(best);
  };

  const handleNextRound = async () => {
    if (currentRound >= 7) { setDraftFinished(true); return; }
    const next = currentRound + 1;
    setCurrentRound(next);
    setShowResults(false);
    setLastCpuPicks([]);
    await loadRoundSlots(next);
  };

  const handleCompleteDraft = async () => {
    setRunning(true);
    await window.api.completeDraft();
    setRunning(false);
    onDraftComplete();
  };

  if (!userTeam) return null;

    const scoutsLeft = scoutBudget - scoutsUsed;
  const available = prospects.filter(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
  const pickNum = userPickSlots[currentPickIdx];
  const totalPicksThisRound = userPickSlots.length;

    if (!draftGenerated) return (
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

  if (draftFinished) return (
    <DraftSummary
      myPicks={myPicks}
      userTeam={userTeam}
      currentSeason={currentSeason}
      onComplete={handleCompleteDraft}
      running={running}
    />
  );

  if (!playoffsComplete) {
    const scoutsLeft = scoutBudget - scoutsUsed;
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
            <div style={{ color: scoutsLeft >= 5 ? '#4caf50' : scoutsLeft > 0 ? '#FF8740' : '#e57373', fontWeight: 700, fontSize: 16 }}>
              {scoutsLeft} / {scoutBudget}
            </div>
            <div style={{ fontSize: 9, color: T.textDim }}>simulate games to earn more</div>
          </div>
        </div>

        <div style={{ background: '#0a1000', border: '1px solid #1a2a1a', borderRadius: 6, padding: '10px 16px', marginBottom: 14, fontSize: 11, color: '#4caf50', fontFamily: 'monospace' }}>
          📋 Scouting mode — reveal prospect ratings now to prepare for draft day.
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
              const isScouting = scouting === p.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', marginBottom: 3, borderRadius: 4,
                  background: '#0e0e0e', border: '1px solid #161616',
                }}>
                  <span style={{
                    width: 36, textAlign: 'center', fontWeight: 700, fontSize: 13,
                    color: p.scouted ? (p.overall_rating >= 80 ? '#FFD700' : p.overall_rating >= 70 ? '#4FC3F7' : '#888') : '#333',
                  }}>
                    {p.scouted ? p.overall_rating : '??'}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
                    {p.first_name} {p.last_name}
                    <span style={{ color: '#555', marginLeft: 8, fontSize: 10 }}>
                      {p.position} · Age {p.age}
                    </span>
                  </span>
                  {!p.scouted && (
                    <button
                      onClick={() => handleScout(p.id)}
                      disabled={scoutsLeft <= 0 || isScouting}
                      style={{
                        padding: '3px 10px', fontSize: 10, cursor: scoutsLeft > 0 ? 'pointer' : 'not-allowed',
                        borderRadius: 3, background: '#141414',
                        border: `1px solid ${scoutsLeft > 0 ? '#2a4a2a' : '#222'}`,
                        color: scoutsLeft > 0 ? '#4caf50' : '#333', fontFamily: 'monospace',
                      }}
                    >
                      {isScouting ? '...' : '🔍 Scout'}
                    </button>
                  )}
                  {p.scouted && (
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
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{currentSeason} NFL Draft</div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
            Round {currentRound} of 7 &nbsp;·&nbsp; {available.length} prospects available
            {totalPicksThisRound > 1 && !showResults && (
              <span style={{ color: '#FF8740', marginLeft: 8 }}>
                You have {totalPicksThisRound} picks this round (Pick {currentPickIdx + 1} of {totalPicksThisRound})
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>SCOUTS</div>
          <div style={{ color: scoutsLeft >= 5 ? '#4caf50' : scoutsLeft > 0 ? '#FF8740' : '#e57373', fontWeight: 700, fontSize: 16 }}>
            {scoutsLeft} / {MAX_SCOUTS}
          </div>
        </div>
      </div>

// After the "Round X of 7" header section, add this block:
{running && !showResults && (
  <div style={{
    margin: '12px 0', padding: '12px 18px', borderRadius: 6,
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
    </div>
  );
}
