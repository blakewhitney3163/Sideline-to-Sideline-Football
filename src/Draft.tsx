import React, { useEffect, useState } from 'react';

declare const window: any;

interface Prospect {
  id: number;
  season: number;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  dev_trait: string;
  age: number;
  is_drafted: number;
  draft_round: number | null;
  draft_pick: number | null;
  drafted_by_team_id: number | null;
}

interface DraftTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  wins: number;
}

interface MyPick {
  round: number;
  pickInRound: number;
  player: Prospect;
}

interface CpuPick {
  round: number;
  pickInRound: number;
  teamId: number;
  prospect: Prospect;
}

interface Props {
  userTeam: { id: number; city: string; name: string };
  currentSeason: number;
  onDraftComplete: () => void;
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

const TRAIT_META: Record<string, { color: string; short: string }> = {
  'Normal':    { color: '#444',    short: '' },
  'Star':      { color: '#4FC3F7', short: 'S' },
  'Superstar': { color: '#FF8740', short: 'SS' },
  'X-Factor':  { color: '#FFD700', short: 'XF' },
};

function ovrColor(r: number): string {
  if (r >= 78) return '#4caf50';
  if (r >= 74) return '#FF8740';
  if (r >= 70) return '#4FC3F7';
  return '#888';
}

export default function Draft({ userTeam, currentSeason, onDraftComplete }: Props) {
  const [prospects,         setProspects]         = useState<Prospect[]>([]);
  const [draftOrder,        setDraftOrder]        = useState<DraftTeam[]>([]);
  const [userPickSlot,      setUserPickSlot]      = useState(0);
  const [currentRound,      setCurrentRound]      = useState(1);
  const [myPicks,           setMyPicks]           = useState<MyPick[]>([]);
  const [lastCpuPicks,      setLastCpuPicks]      = useState<CpuPick[]>([]);
  const [posFilter,         setPosFilter]         = useState('ALL');
  const [draftGenerated,    setDraftGenerated]    = useState(false);
  const [draftFinished,     setDraftFinished]     = useState(false);
  const [showRoundResults,  setShowRoundResults]  = useState(false);
  const [generating,        setGenerating]        = useState(false);
  const [running,           setRunning]           = useState(false);

  useEffect(() => { loadDraft(); }, []);

  const loadDraft = async () => {
    const [cls, order] = await Promise.all([
      window.api.getDraftClass(),
      window.api.getDraftOrder(),
    ]);
    setProspects(cls);
    const idx = order.findIndex((t: DraftTeam) => t.id === userTeam.id);
    setUserPickSlot(idx >= 0 ? idx : 0);
    setDraftOrder(order);
    setDraftGenerated(cls.length > 0);

    const drafted = cls.filter((p: Prospect) => p.is_drafted);
    const roundsDone = Math.floor(drafted.length / 32);
    if (roundsDone >= 7) {
      setDraftFinished(true);
      setCurrentRound(7);
    } else {
      setCurrentRound(roundsDone + 1);
    }

    const mine = cls.filter((p: Prospect) => p.is_drafted && p.drafted_by_team_id === userTeam.id);
    setMyPicks(mine.map((p: Prospect) => ({
      round: p.draft_round!,
      pickInRound: (p.draft_pick! - 1) % 32 + 1,
      player: p,
    })));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await window.api.generateDraftClass();
    await loadDraft();
    setGenerating(false);
  };

  const handlePick = async (prospect: Prospect) => {
    if (running) return;
    setRunning(true);

    const overallPick = (currentRound - 1) * 32 + (userPickSlot + 1);
    await window.api.makeDraftPick({ prospectId: prospect.id, teamId: userTeam.id, round: currentRound, pick: overallPick });

    const newPick: MyPick = { round: currentRound, pickInRound: userPickSlot + 1, player: prospect };
    setMyPicks(prev => [...prev, newPick]);

    const cpuResults: CpuPick[] = await window.api.runCpuRound({ round: currentRound, userTeamId: userTeam.id });
    setLastCpuPicks(cpuResults);

    const cls = await window.api.getDraftClass();
    setProspects(cls);

    setShowRoundResults(true);
    setRunning(false);
  };

  const handleAutoPick = () => {
    const avail = prospects.filter(p => !p.is_drafted);
    const best = avail[0];
    if (best) handlePick(best);
  };

  const handleNextRound = () => {
    if (currentRound >= 7) {
      setDraftFinished(true);
    } else {
      setCurrentRound(prev => prev + 1);
      setShowRoundResults(false);
      setLastCpuPicks([]);
    }
  };

  const handleCompleteDraft = async () => {
    setRunning(true);
    await window.api.completeDraft();
    setRunning(false);
    onDraftComplete();
  };

  const available = prospects
    .filter(p => !p.is_drafted)
    .filter(p => posFilter === 'ALL' || p.position === posFilter);

  // ── Pre-draft: generate class ──────────────────────────────────────────────
  if (!draftGenerated) {
    return (
      <div style={{ padding: '40px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>
        <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>{currentSeason} NFL Draft</div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 32 }}>Generate the rookie class before the draft begins — 280 prospects across all positions.</div>
        <button onClick={handleGenerate} disabled={generating} style={{
          padding: '14px 32px', background: '#0a1a0a', border: '1px solid #4caf50',
          borderRadius: 6, color: '#4caf50', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        }}>
          {generating ? 'Generating...' : '▶ Generate Draft Class'}
        </button>
      </div>
    );
  }

  // ── Post-draft summary ─────────────────────────────────────────────────────
  if (draftFinished) {
    return (
      <div style={{ padding: '32px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>
        <div style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>Draft Complete</div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 28 }}>{currentSeason} NFL Draft — {userTeam.city} {userTeam.name}</div>

        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '20px', marginBottom: 28, maxWidth: 560 }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, marginBottom: 16 }}>YOUR DRAFT HAUL — 7 PICKS</div>
          {myPicks.sort((a, b) => a.round - b.round).map(pick => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={pick.round} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: 10, color: '#444', width: 52, flexShrink: 0 }}>Round {pick.round}</span>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#ddd' }}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{pick.player.position}</span>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: ovrColor(pick.player.overall_rating) }}>{pick.player.overall_rating}</span>
                {trait.short && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold' }}>{trait.short}</span>
                )}
                <span style={{ fontSize: 10, color: '#444' }}>Age {pick.player.age}</span>
              </div>
            );
          })}
        </div>

        <button onClick={handleCompleteDraft} disabled={running} style={{
          padding: '10px 28px', background: '#0a1a0a', border: '1px solid #4caf50',
          borderRadius: 6, color: '#4caf50', fontSize: 13, fontWeight: 'bold', cursor: 'pointer',
        }}>
          {running ? 'Processing...' : '✓ Complete Draft & Return to Offseason'}
        </button>
      </div>
    );
  }

  // ── Active draft ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 1 }}>{currentSeason} NFL Draft</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 4, fontSize: 11, color: '#555' }}>
          <span>Round {currentRound} of 7</span>
          <span>Your slot: Pick #{userPickSlot + 1}</span>
          <span>{prospects.filter(p => !p.is_drafted).length} prospects available</span>
        </div>
      </div>

      {/* On the clock */}
      {!showRoundResults && (
        <div style={{ background: '#0a1a0a', border: '1px solid #1a4a1a', borderRadius: 8, padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#4caf50', letterSpacing: 2, marginBottom: 4 }}>ON THE CLOCK — ROUND {currentRound}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>{userTeam.city} {userTeam.name}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={handleAutoPick} disabled={running} style={{
              padding: '6px 16px', background: '#141414', border: '1px solid #2a4a2a',
              borderRadius: 4, color: '#4caf50', fontSize: 11, cursor: 'pointer',
            }}>⚡ Auto-Pick Best Available</button>
          </div>
        </div>
      )}

      {/* Round results */}
      {showRoundResults && (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#FF8740', letterSpacing: 2, marginBottom: 12 }}>ROUND {currentRound} RESULTS</div>
          {myPicks.filter(p => p.round === currentRound).map(pick => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={pick.round} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 8 }}>
                <span style={{ fontSize: 10, background: '#FF8740', color: '#000', padding: '1px 6px', borderRadius: 3, fontWeight: 'bold' }}>YOUR PICK</span>
                <span style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{ fontSize: 11, color: '#555' }}>{pick.player.position}</span>
                <span style={{ fontWeight: 'bold', color: ovrColor(pick.player.overall_rating) }}>{pick.player.overall_rating}</span>
                {trait.short && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold' }}>{trait.short}</span>}
                <span style={{ fontSize: 10, color: '#444' }}>Age {pick.player.age}</span>
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: '#333', marginBottom: 8, marginTop: 4 }}>OTHER NOTABLE PICKS THIS ROUND</div>
          {lastCpuPicks.slice(0, 6).map((pick, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0', fontSize: 11, color: '#444' }}>
              <span style={{ width: 55, color: '#333' }}>Pick #{pick.pickInRound}</span>
              <span>{pick.prospect.first_name} {pick.prospect.last_name}</span>
              <span style={{ color: '#333' }}>{pick.prospect.position}</span>
              <span style={{ color: ovrColor(pick.prospect.overall_rating) }}>{pick.prospect.overall_rating}</span>
            </div>
          ))}
          <button onClick={handleNextRound} style={{
            marginTop: 16, padding: '8px 24px', background: '#1a1a1a', border: '1px solid #333',
            borderRadius: 4, color: '#ccc', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
          }}>
            {currentRound >= 7 ? 'View Draft Summary →' : `Continue to Round ${currentRound + 1} →`}
          </button>
        </div>
      )}

      {/* Main content: board + my picks */}
      {!showRoundResults && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24 }}>

          {/* Available Prospects */}
          <div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
              {POSITIONS.map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)} style={{
                  padding: '3px 9px', background: posFilter === pos ? '#4caf50' : '#141414',
                  border: `1px solid ${posFilter === pos ? '#4caf50' : '#222'}`, borderRadius: 3,
                  color: posFilter === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
                  fontWeight: posFilter === pos ? 'bold' : 'normal',
                }}>{pos}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 55px 55px 80px 55px 70px', gap: 8, padding: '6px 12px', fontSize: 10, color: '#333', letterSpacing: 1, borderBottom: '1px solid #1a1a1a', marginBottom: 4 }}>
              <span>PLAYER</span><span>POS</span><span>OVR</span><span>DEV</span><span>AGE</span><span />
            </div>

            {available.length === 0 ? (
              <div style={{ color: '#333', padding: 24, textAlign: 'center' }}>No prospects at this position</div>
            ) : available.slice(0, 60).map(p => {
              const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 55px 55px 80px 55px 70px', gap: 8, padding: '7px 12px', borderBottom: '1px solid #0f0f0f', alignItems: 'center' }}>
                  <span style={{ color: '#ddd', fontSize: 13 }}>{p.first_name} {p.last_name}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{p.position}</span>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: ovrColor(p.overall_rating) }}>{p.overall_rating}</span>
                  <span style={{ fontSize: 10, color: trait.color }}>{trait.short || '—'}</span>
                  <span style={{ fontSize: 11, color: '#444' }}>{p.age}</span>
                  <button onClick={() => handlePick(p)} disabled={running} style={{
                    padding: '3px 10px', background: '#0a1a0a', border: '1px solid #2a4a2a',
                    borderRadius: 3, color: '#4caf50', fontSize: 10, cursor: 'pointer', fontWeight: 'bold',
                  }}>Draft</button>
                </div>
              );
            })}
          </div>

          {/* My Picks */}
          <div>
            <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, marginBottom: 12 }}>YOUR PICKS</div>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(round => {
              const pick = myPicks.find(p => p.round === round);
              const isCurrent = round === currentRound;
              const trait = pick ? (TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal']) : null;
              return (
                <div key={round} style={{
                  padding: '10px 12px', marginBottom: 6, borderRadius: 4,
                  background: isCurrent ? '#0a1a0a' : '#111',
                  border: `1px solid ${isCurrent ? '#1a4a1a' : '#1a1a1a'}`,
                }}>
                  <div style={{ fontSize: 10, color: '#333' }}>Round {round}</div>
                  {pick ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#ddd', fontWeight: 'bold' }}>{pick.player.first_name} {pick.player.last_name}</span>
                        {trait?.short && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: trait.color + '22', color: trait.color, fontWeight: 'bold' }}>{trait.short}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                        {pick.player.position} · <span style={{ color: ovrColor(pick.player.overall_rating) }}>{pick.player.overall_rating}</span> · Age {pick.player.age}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: isCurrent ? '#4caf50' : '#2a2a2a', marginTop: 4 }}>
                      {isCurrent ? '⏳ On the clock...' : 'Pending'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}