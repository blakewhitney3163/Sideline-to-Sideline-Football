import React from 'react';
import { T } from '../theme';
import { Prospect, MyPick, CpuPick, PickSlot, DraftTeam } from './types';
import { POSITIONS, TRAIT_META, ovrColor, maskedOvr, preScoutTier, draftGrade, fortyColor, benchColor, vertColor, coneColor } from './draftUtils';

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
  const canPick = !showResults && userPickSlots.length > 0 && !running;
  const canScout = scoutsLeft > 0 && scouting === null;

  return (
    <div>

      {/* On the clock banner */}
      {!showResults && userPickSlots.length > 0 && (
        <div style={{
          background: '#1a1a00', border: '1px solid #FF8740', borderRadius: 6,
          padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#FF8740', marginBottom: 2 }}>
              ON THE CLOCK — ROUND {currentRound}
              {totalPicksThisRound > 1 ? ` · PICK ${currentPickIdx + 1}/${totalPicksThisRound}` : ''} · SLOT #{pickNum}
            </div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>
              {userTeam.city} {userTeam.name}
            </div>
          </div>
          <button onClick={onAutoPick} disabled={!canPick} style={{
            padding: '5px 14px', fontSize: 11, cursor: canPick ? 'pointer' : 'not-allowed',
            background: canPick ? '#FF8740' : T.bgCard,
            border: `1px solid ${canPick ? '#FF8740' : T.borderFaint}`,
            borderRadius: 4, color: canPick ? '#000' : T.textDim, fontWeight: 'bold',
          }}>
            ⚡ Auto-Pick BPA
          </button>
        </div>
      )}

      {/* Round results panel */}
      {showResults && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.borderFaint}`,
          borderRadius: 6, padding: '12px 16px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: T.textMuted, marginBottom: 10 }}>
            ROUND {currentRound} RESULTS
          </div>
          {myPicks.filter(p => p.round === currentRound).map((pick) => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={pick.player.id} style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '4px 0', fontSize: 11,
              }}>
                <span style={{ color: '#FF8740', fontWeight: 'bold', fontSize: 9 }}>YOUR PICK #{pick.slot}</span>
                <span style={{ color: '#fff' }}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{ color: T.textMuted, fontSize: 9 }}>{pick.player.position}</span>
                {trait.short && (
                  <span style={{ background: trait.bg, color: trait.color, fontSize: 8, padding: '1px 4px', borderRadius: 2 }}>
                    {trait.short}
                  </span>
                )}
                <span style={{ color: ovrColor(pick.player.overall_rating), fontWeight: 'bold' }}>{pick.player.overall_rating}</span>
                <span style={{ color: pick.gradeColor, fontWeight: 'bold' }}>{pick.grade}</span>
              </div>
            );
          })}
          {lastCpuPicks.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>
                CPU PICKS ({lastCpuPicks.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
                {lastCpuPicks.map((cp) => {
                  const trait = TRAIT_META[cp.prospect.dev_trait] ?? TRAIT_META['Normal'];
                  const teamName = draftOrder.find(t => t.id === cp.teamId);
                  return (
                    <div key={cp.prospect.id} style={{
                      display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: T.textMuted,
                    }}>
                      <span style={{ color: T.textDim, fontSize: 9, minWidth: 20 }}>{cp.pickInRound}</span>
                      <span style={{ minWidth: 120, fontSize: 9 }}>{teamName?.city} {teamName?.name}</span>
                      <span style={{ color: '#ccc' }}>{cp.prospect.first_name} {cp.prospect.last_name}</span>
                      <span style={{ fontSize: 9 }}>{cp.prospect.position}</span>
                      {trait.short && (
                        <span style={{ background: trait.bg, color: trait.color, fontSize: 8, padding: '1px 4px', borderRadius: 2 }}>
                          {trait.short}
                        </span>
                      )}
                      <span style={{ color: ovrColor(cp.prospect.overall_rating), fontWeight: 'bold' }}>{cp.prospect.overall_rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <button onClick={onNextRound} style={{
            marginTop: 12, padding: '6px 18px', fontSize: 11, fontWeight: 'bold',
            background: '#FF8740', border: 'none', borderRadius: 4,
            color: '#000', cursor: 'pointer',
          }}>
            {currentRound >= 7 ? 'View Draft Summary →' : `Start Round ${currentRound + 1} →`}
          </button>
        </div>
      )}

      {/* Position filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
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

      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '28px 1fr 42px 90px 50px 60px 70px',
        gap: 4, padding: '4px 8px', marginBottom: 4,
      }}>
        {['#', 'NAME', 'POS', 'SCOUTING', 'AGE', 'OVR', ''].map((h, i) => (
          <div key={i} style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>{h}</div>
        ))}
      </div>

      {/* Prospect list */}
      {available.length === 0 ? (
        <div style={{ color: T.textDim, fontSize: 11, padding: '16px 8px' }}>No prospects available.</div>
      ) : (
        <div>
          {available.map((p, index) => {
            const isScout = p.scouted === 1;
            const tier = preScoutTier(p.id, p.overall_rating);
            const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
            draftGrade(p.overall_rating);
            return (
              <div
                key={p.id}
                onClick={() => canPick && onPick(p)}
                onMouseEnter={e => { if (canPick) (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
                style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 42px 90px 50px 60px 70px',
                  gap: 4, alignItems: 'center', padding: '6px 8px',
                  background: T.bgCard, borderRadius: 4, marginBottom: 2,
                  cursor: canPick ? 'pointer' : 'default',
                  border: `1px solid ${canPick ? 'transparent' : T.borderFaint}`,
                  transition: 'background 0.1s',
                  boxSizing: 'border-box',
                }}
              >
                {/* # */}
                <div style={{ fontSize: 10, color: T.textDim }}>{index + 1}</div>

                {/* Name + combine stats */}
                <div>
                  <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500 }}>
                    {p.first_name} {p.last_name}
                  </div>
                  <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>Age {p.age}</div>
                  {(p.forty_time != null || p.bench_press != null) && (
                    <div style={{ fontSize: 9, marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.forty_time != null && (
                        <span style={{ color: fortyColor(p.forty_time) }}>40: {p.forty_time}s</span>
                      )}
                      {p.bench_press != null && (
                        <span style={{ color: benchColor(p.bench_press) }}>Bench: {p.bench_press}</span>
                      )}
                      {p.vertical_jump != null && (
                        <span style={{ color: vertColor(p.vertical_jump) }}>Vert: {p.vertical_jump}"</span>
                      )}
                      {p.broad_jump != null && (
                        <span style={{ color: '#555' }}>BJ: {p.broad_jump}"</span>
                      )}
                      {p.cone_time != null && (
                        <span style={{ color: coneColor(p.cone_time) }}>Cone: {p.cone_time}s</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Position */}
                <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600 }}>{p.position}</div>

                {/* Scouting tier */}
                <div style={{
                  fontSize: 9, fontWeight: 'bold', letterSpacing: 0.8,
                  color: isScout ? '#4caf50' : tier.color,
                }}>
                  {isScout ? 'SCOUTED' : tier.label}
                </div>

                {/* Age */}
                <div style={{ fontSize: 10, color: T.textMuted }}>{p.age}</div>

                {/* OVR */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isScout ? (
                    <>
                      <span style={{ color: ovrColor(p.overall_rating), fontWeight: 'bold', fontSize: 13 }}>
                        {p.overall_rating}
                      </span>
                      {trait.short && (
                        <span style={{
                          background: trait.bg, color: trait.color,
                          fontSize: 8, padding: '1px 4px', borderRadius: 2, fontWeight: 'bold',
                        }}>
                          {trait.short}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: T.textMuted, fontSize: 10 }}>{maskedOvr(p.id, p.overall_rating)}</span>
                  )}
                </div>

                {/* Scout button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
      )}
    </div>
  );
}
