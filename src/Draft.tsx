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

  const [prospects, setProspects]           = useState<Prospect[]>([]);
  const [draftOrder, setDraftOrder]         = useState<DraftTeam[]>([]);
  const [roundPickSlots, setRoundPickSlots] = useState<PickSlot[]>([]);
  const [userPickSlots, setUserPickSlots]   = useState<number[]>([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [currentRound, setCurrentRound]     = useState(1);
  const [myPicks, setMyPicks]               = useState<MyPick[]>([]);
  const [lastCpuPicks, setLastCpuPicks]     = useState<CpuPick[]>([]);
  const [posFilter, setPosFilter]           = useState('ALL');
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [draftFinished, setDraftFinished]   = useState(false);
  const [showResults, setShowResults]       = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [running, setRunning]               = useState(false);
  const [scoutsUsed, setScoutsUsed]         = useState(0);
  const [scouting, setScouting]             = useState<number | null>(null);

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

    const drafted     = cls.filter((p: Prospect) => p.is_drafted);
    const roundsDone  = Math.floor(drafted.length / 32);
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
    const slot        = userPickSlots[currentPickIdx] ?? 1;
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

  const scoutsLeft          = MAX_SCOUTS - scoutsUsed;
  const available           = prospects.filter(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
  const pickNum             = userPickSlots[currentPickIdx];
  const totalPicksThisRound = userPickSlots.length;

  if (!draftGenerated) return (
    <div style={{ padding: '40px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <h2 style={{ color: T.textPrimary, fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{currentSeason} NFL Draft</h2>
      <p style={{ color: T.textDim, fontSize: 13, marginBottom: 24 }}>
        Generate the rookie class before the draft begins — 280 prospects across all positions.
      </p>
      <button onClick={handleGenerate} disabled={generating} style={{
        padding: '12px 28px', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
        background: '#0a1a3a', border: '1px solid #4FC3F7', borderRadius: 4, color: '#4FC3F7',
      }}>
        {generating ? 'Generating...' : '▶ Generate Draft Class'}
      </button>
    </div>
  );

  if (draftFinished) return (
    <DraftSummary picks={myPicks} userTeam={userTeam} currentSeason={currentSeason} onComplete={handleCompleteDraft} running={running} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.borderFaint}`, background: T.bgPanel, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 700, margin: 0 }}>{currentSeason} NFL Draft</h2>
          <span style={{ color: T.textDim, fontSize: 12 }}>Round {currentRound} of 7</span>
          <span style={{ color: T.textDim, fontSize: 12 }}>{available.length} prospects available</span>
          {totalPicksThisRound > 1 && !showResults && (
            <span style={{ color: '#FF8740', fontSize: 12 }}>
              You have {totalPicksThisRound} picks this round (Pick {currentPickIdx + 1} of {totalPicksThisRound})
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.textDim, fontSize: 10, letterSpacing: 1 }}>SCOUTS</span>
            <span style={{ color: scoutsLeft > 5 ? '#4caf50' : scoutsLeft > 0 ? '#FF8740' : '#e57373', fontWeight: 700, fontSize: 16 }}>
              {scoutsLeft} / {MAX_SCOUTS}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', overflow: 'hidden' }}>
        <ProspectBoard
          prospects={available}
          posFilter={posFilter}
          onPosFilter={setPosFilter}
          onPick={handlePick}
          onAutoPick={handleAutoPick}
          onScout={handleScout}
          scouting={scouting}
          scoutsLeft={scoutsLeft}
          running={running}
          showResults={showResults}
          lastCpuPicks={lastCpuPicks}
          pickNum={pickNum}
          onNextRound={handleNextRound}
          currentRound={currentRound}
          userTeamId={userTeam.id}
        />
        <MyPicksSidebar picks={myPicks} />
      </div>
    </div>
  );
}
