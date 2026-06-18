import React from 'react';
import { T } from '../theme';
import { Prospect, MyPick, CpuPick, PickSlot, DraftTeam } from './types';
import { POSITIONS, ROUND_LABELS, TRAIT_META, ovrColor, maskedOvr, preScoutTier, draftGrade } from './draftUtils';

interface Props {
  available: Prospect[];
  posFilter: string;
  setPosFilter: (p: string) => void;
  showResults: boolean;
  userPickSlots: number[];
  currentPickIdx: number;
  currentRound: number;
  pickNum: number | undefined;
  totalPicksThisRound: number;
  myPicks: MyPick[];
  lastCpuPicks: CpuPick[];
  roundPickSlots: PickSlot[];
  draftOrder: DraftTeam[];
  scoutsLeft: number;
  scouting: number | null;
  running: boolean;
  userTeam: { id: number; city: string; name: string };
  onPick: (p: Prospect) => void;
  onAutoPick: () => void;
  onScout: (id: number) => void;
  onNextRound: () => void;
  currentSeason: number;
}

export default function ProspectBoard({
  available, posFilter, setPosFilter,
  showResults, userPickSlots, currentPickIdx, currentRound,
  pickNum, totalPicksThisRound,
  myPicks, lastCpuPicks, roundPickSlots, draftOrder,
  scoutsLeft, scouting, running, userTeam,
  onPick, onAutoPick, onScout, onNextRound,
}: Props) {
  const canPick  = !showResults && userPickSlots.length > 0 && !running;
  const canScout = scoutsLeft > 0 && scouting === null;

  return (
    <div>
      {/* On the clock banner */}
      {!showResults && userPickSlots.length > 0 && (
        <div style={{
          background: '#0a1a0a', border: '1px solid #2a4a2a', borderRadius: 8,
          padding: '12px 16px', marginBottom: 12,
        }}>
          <div style={{ color: '#4caf50', fontSize: 10, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
            ON THE CLOCK — ROUND {currentRound}
            {totalPicksThisRound > 1 ? ` · PICK ${currentPickIdx + 1}/${totalPicksThisRound}` : ''} · SLOT #{pickNum}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: T.textPrimary, fontWeight: 700 }}>{userTeam.city} {userTeam.name}</span>
            <button
              onClick={onAutoPick}
              disabled={running || available.length === 0}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 4,
                background: running ? T.bgPanel : T.bgGreen,
                border: `1px solid ${running ? T.borderFaint : '#2a4a2a'}`,
                color: running ? T.textDim : '#4caf50',
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              ⚡ Auto-Pick BPA
            </button>
          </div>
        </div>
      )}

      {/* Round results panel */}
      {showResults && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.borderFaint}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 12,
        }}>
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>
            ROUND {currentRound} RESULTS
          </div>

          {/* User's picks */}
          {myPicks.filter(p => p.round === currentRound).map((pick, i) => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{ color: '#4caf50', fontSize: 9, fontWeight: 700, width: 60 }}>YOUR PICK #{pick.slot}</span>
                <span style={{ color: T.textPrimary, fontWeight: 700, flex: 1 }}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{ color: T.textMuted, fontSize: 11 }}>{pick.player.position}</span>
                {trait.short && <span style={{ color: trait.color, fontSize: 9, fontWeight: 700 }}>{trait.short}</span>}
                <span style={{ color: ovrColor(pick.player.overall_rating), fontWeight: 700 }}>{pick.player.overall_rating}</span>
                <span style={{ color: pick.gradeColor, fontWeight: 700 }}>{pick.grade}</span>
              </div>
            );
          })}

          {/* CPU picks */}
          {lastCpuPicks.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1, margin: '8px 0 4px' }}>
                CPU PICKS ({lastCpuPicks.length})
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {lastCpuPicks.map((cp, i) => {
                  const trait = TRAIT_META[cp.prospect.dev_trait] ?? TRAIT_META['Normal'];
                  const teamName = draftOrder.find(t => t.id === cp.teamId);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 11 }}>
                      <span style={{ color: T.textDim, width: 20 }}>{cp.pickInRound}</span>
                      <span style={{ color: T.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {teamName?.city} {teamName?.name}
                      </span>
                      <span style={{ color: T.textPrimary, fontWeight: 600 }}>{cp.prospect.first_name} {cp.prospect.last_name}</span>
                      <span style={{ color: T.textMuted }}>{cp.prospect.position}</span>
                      {trait.short && <span style={{ color: trait.color, fontSize: 9, fontWeight: 700 }}>{trait.short}</span>}
                      <span style={{ color: ovrColor(cp.prospect.overall_rating), fontWeight: 700 }}>{cp.prospect.overall_rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={onNextRound}
            style={{
              marginTop: 12, padding: '7px 16px', fontWeight: 700, fontSize: 12, borderRadius: 4, cursor: 'pointer',
              background: T.bgGreen, border: '1px solid #2a4a2a', color: '#4caf50',
            }}
          >
            {currentRound >= 7 ? 'View Draft Summary →' : `Start Round ${currentRound + 1} →`}
          </button>
        </div>
      )}

      {/* Position filter */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {POSITIONS.map(pos => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            padding: '2px 7px',
            background: posFilter === pos ? '#FF8740' : T.bgCard,
            border: `1px solid ${posFilter === pos ? '#FF8740' : T.borderFaint}`,
            borderRadius: 3, color: posFilter === pos ? '#000' : T.textMuted,
            fontSize: 10, cursor: 'pointer', fontWeight: posFilter === pos ? 700 : 400,
          }}>{pos}</button>
        ))}
      </div>

      {/* Prospect list header */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 42px 90px 50px 60px 70px', gap: 4, padding: '4px 8px', fontSize: 9, color: T.textDim, letterSpacing: 1 }}>
        {['#','NAME','POS','SCOUTING','AGE','OVR',''].map((h, i) => <span key={i}>{h}</span>)}
      </div>

      {/* Prospect rows */}
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {available.length === 0 && (
          <div style={{ color: T.textDim, fontSize: 13, padding: '16px 8px' }}>No prospects available.</div>
        )}
        {available.map((p, idx) => {
          const isScout = p.scouted === 1;
          const tier = preScoutTier(p.id, p.overall_rating);
          const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
          const g = draftGrade(p.overall_rating);

          return (
            <div
              key={p.id}
              onClick={() => canPick && onPick(p)}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 42px 90px 50px 60px 70px',
                gap: 4, alignItems: 'center', padding: '6px 8px', marginBottom: 2,
                background: T.bgCard, borderRadius: 4,
                cursor: canPick ? 'pointer' : 'default',
                border: `1px solid ${canPick ? 'transparent' : T.borderFaint}`,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (canPick) (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
            >
              <span style={{ color: T.textDim, fontSize: 10 }}>{idx + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: T.textPrimary, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.first_name} {p.last_name}
                </div>
                <div style={{ color: T.textDim, fontSize: 9 }}>Age {p.age}</div>
              </div>
              <span style={{ color: T.textMuted, fontSize: 11 }}>{p.position}</span>
              <div>
                {isScout ? (
                  <span style={{ color: '#4caf50', fontSize: 9, fontWeight: 700, background: T.bgGreen, padding: '1px 5px', borderRadius: 3 }}>SCOUTED</span>
                ) : (
                  <span style={{ color: tier.color, fontSize: 10 }}>{tier.label}</span>
                )}
              </div>
              <span style={{ color: T.textDim, fontSize: 11 }}>{p.age}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {isScout ? (
                  <>
                    <span style={{ color: ovrColor(p.overall_rating), fontWeight: 700, fontSize: 13 }}>{p.overall_rating}</span>
                    {trait.short && <span style={{ color: trait.color, fontSize: 9, fontWeight: 700 }}>{trait.short}</span>}
                  </>
                ) : (
                  <span style={{ color: T.textDim, fontSize: 10 }}>{maskedOvr(p.id, p.overall_rating)}</span>
                )}
              </div>
              <div>
                {!isScout && (
                  <button
                    onClick={e => { e.stopPropagation(); if (canScout) onScout(p.id); }}
                    disabled={!canScout || scouting === p.id}
                    style={{
                      fontSize: 9, padding: '2px 6px',
                      background: canScout ? T.bgInput : 'transparent',
                      border: `1px solid ${canScout ? T.borderFaint : 'transparent'}`,
                      borderRadius: 3,
                      color: canScout ? T.textMuted : T.textDim,
                      cursor: canScout ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {scouting === p.id ? '...' : 'Scout'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
