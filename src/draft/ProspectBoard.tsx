import React from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { T } from '../theme';
import { Prospect, MyPick, CpuPick, PickSlot, DraftTeam } from './types';
import { POSITIONS, TRAIT_META, ovrColor, maskedOvr, preScoutTier, draftGrade } from './draftUtils';

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

// ─── Virtualized Row ──────────────────────────────────────────────────────────

const ITEM_HEIGHT = 46;

interface RowData {
  items: Prospect[];
  canPick: boolean;
  canScout: boolean;
  scouting: number | null;
  onPick: (p: Prospect) => void;
  onScout: (id: number) => void;
}

const ProspectRow = React.memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { items, canPick, canScout, scouting, onPick, onScout } = data;
  const p = items[index];
  if (!p) return null;

  const isScout = p.scouted === 1;
  const tier = preScoutTier(p.id, p.overall_rating);
  const trait = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
  draftGrade(p.overall_rating); // kept for side-effects / future use

  return (
    <div style={style}>
      <div
        onClick={() => canPick && onPick(p)}
        style={{
          display: 'grid', gridTemplateColumns: '28px 1fr 42px 90px 50px 60px 70px',
          gap: 4, alignItems: 'center', padding: '6px 8px',
          background: T.bgCard, borderRadius: 4,
          cursor: canPick ? 'pointer' : 'default',
          border: `1px solid ${canPick ? 'transparent' : T.borderFaint}`,
          transition: 'background 0.1s',
          height: ITEM_HEIGHT - 4,
          boxSizing: 'border-box',
        }}
        onMouseEnter={e => { if (canPick) (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
      >
        <span style={{ color: T.textDim, fontSize: 10 }}>{index + 1}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, color: T.textPrimary }}>
            {p.first_name} {p.last_name}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Age {p.age}</div>
        </div>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{p.position}</span>
        <div>
          {isScout ? (
            <span style={{ fontSize: 9, color: '#4FC3F7', fontWeight: 700, letterSpacing: 0.5 }}>SCOUTED</span>
          ) : (
            <span style={{ fontSize: 10, color: tier.color, fontWeight: 600 }}>{tier.label}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: T.textMuted }}>{p.age}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {isScout ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: ovrColor(p.overall_rating) }}>
                {p.overall_rating}
              </span>
              {trait.short && (
                <span style={{
                  fontSize: 8, fontWeight: 700, color: trait.color,
                  background: trait.bg, borderRadius: 2, padding: '1px 3px',
                }}>
                  {trait.short}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>
              {maskedOvr(p.id, p.overall_rating)}
            </span>
          )}
        </div>
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
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

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

  const rowData: RowData = { items: available, canPick, canScout, scouting, onPick, onScout };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* On the clock banner */}
      {!showResults && userPickSlots.length > 0 && (
        <div style={{ background: '#1a1200', border: '1px solid #FF8740', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#FF8740', fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>
                ON THE CLOCK — ROUND {currentRound}
                {totalPicksThisRound > 1 ? ` · PICK ${currentPickIdx + 1}/${totalPicksThisRound}` : ''} · SLOT #{pickNum}
              </div>
              <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 13 }}>
                {userTeam.city} {userTeam.name}
              </div>
            </div>
            <button onClick={onAutoPick} style={{
              background: '#2a1a00', border: '1px solid #FF8740', borderRadius: 4,
              color: '#FF8740', fontSize: 11, fontWeight: 700, padding: '6px 14px', cursor: 'pointer',
            }}>
              ⚡ Auto-Pick BPA
            </button>
          </div>
        </div>
      )}

      {/* Round results panel */}
      {showResults && (
        <div style={{ marginBottom: 8, background: T.bgCard, borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
            ROUND {currentRound} RESULTS
          </div>
          {myPicks.filter(p => p.round === currentRound).map((pick) => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={pick.slot} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: '#FF8740', fontWeight: 700 }}>YOUR PICK #{pick.slot}</span>
                <span style={{ color: T.text, fontWeight: 600 }}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{ color: T.textMuted }}>{pick.player.position}</span>
                {trait.short && <span style={{ fontSize: 8, color: trait.color, background: trait.bg, borderRadius: 2, padding: '1px 3px', fontWeight: 700 }}>{trait.short}</span>}
                <span style={{ color: ovrColor(pick.player.overall_rating), fontWeight: 700 }}>{pick.player.overall_rating}</span>
                <span style={{ color: T.textMuted }}>{pick.grade}</span>
              </div>
            );
          })}
          {lastCpuPicks.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                CPU PICKS ({lastCpuPicks.length})
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {lastCpuPicks.map((cp) => {
                  const trait = TRAIT_META[cp.prospect.dev_trait] ?? TRAIT_META['Normal'];
                  const teamName = draftOrder.find(t => t.id === cp.teamId);
                  return (
                    <div key={cp.pickInRound} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, marginBottom: 3 }}>
                      <span style={{ color: T.textDim, width: 20 }}>{cp.pickInRound}</span>
                      <span style={{ color: T.textMuted, flex: 1 }}>{teamName?.city} {teamName?.name}</span>
                      <span style={{ color: T.text }}>{cp.prospect.first_name} {cp.prospect.last_name}</span>
                      <span style={{ color: T.textMuted }}>{cp.prospect.position}</span>
                      {trait.short && <span style={{ fontSize: 8, color: trait.color, background: trait.bg, borderRadius: 2, padding: '1px 3px', fontWeight: 700 }}>{trait.short}</span>}
                      <span style={{ color: ovrColor(cp.prospect.overall_rating), fontWeight: 700 }}>{cp.prospect.overall_rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <button onClick={onNextRound} style={{
            marginTop: 8, background: '#4FC3F7', border: 'none', borderRadius: 4,
            color: '#000', fontSize: 11, fontWeight: 700, padding: '6px 16px', cursor: 'pointer',
          }}>
            {currentRound >= 7 ? 'View Draft Summary →' : `Start Round ${currentRound + 1} →`}
          </button>
        </div>
      )}

      {/* Position filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
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
          <span key={i} style={{ fontSize: 9, color: T.textDim, fontWeight: 700, letterSpacing: 0.5 }}>{h}</span>
        ))}
      </div>

      {/* Virtualized prospect list */}
      {available.length === 0 ? (
        <div style={{ textAlign: 'center', color: T.textMuted, padding: 20, fontSize: 12 }}>
          No prospects available.
        </div>
      ) : (
        <FixedSizeList
          height={520}
          itemCount={available.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
          itemData={rowData}
        >
          {ProspectRow}
        </FixedSizeList>
      )}
    </div>
  );
}
