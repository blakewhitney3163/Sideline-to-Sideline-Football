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
  const [scouting, setScouting] = useState<number | null>(null);

  useEffect(() => { loadDraft(); }, [userTeam?.id]);

  const loadDraft = async () => {
    if (!userTeam) return;
    const [cls, order, sc] = await Promise.all([
      window.api.getDraftClass(),
      window.api.getDraftOrder(),
      window.api.getScoutCount(),
    ]);
    setProspects(cls); setDraftOrder(order); setScoutsUsed(sc);
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

  const scoutsLeft = MAX_SCOUTS - scoutsUsed;
  const available = prospects.filter(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
  const pickNum = userPickSlots[currentPickIdx];
  const totalPicksThisRound = userPickSlots.length;

  if (!draftGenerated) return (
    <div style={{ padding: '40px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>{currentSeason} NFL Draft</div>
      <div style={{ color: T.textDim, fontSize: 13, marginBottom: 24 }}>
        Generate the rookie class before the draft begins — 280 prospects across all positions.
      </div>
      <button onClick={handleGenerate} disabled={generating} style={{ padding: '10px 28px', background: T.bgGreen, border: '1px solid #2a4a2a', borderRadius: 6, color: '#4caf50', fontWeight: 700, fontSize: 14, cursor: generating ? 'not-allowed' : 'pointer' }}>
        {generating ? 'Generating...' : '▶ Generate Draft Class'}
      </button>
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
