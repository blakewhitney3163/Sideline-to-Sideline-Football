import React from 'react';
import { T } from '../theme';
import { DepthPlayer } from './types';
import { TRAIT_META, ovrColor, injuryMeta } from './depthUtils';

interface Props {
  players: DepthPlayer[];
  activeGroup: string;
  saving: string | null;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
}

export default function DepthChartList({ players, activeGroup, saving, onMoveUp, onMoveDown }: Props) {
  if (players.length === 0) {
    return <div style={{ color: T.textDim, padding: '24px 0', fontSize: 13 }}>No players at this position.</div>;
  }

  const starterOvr = players[0]?.overall_rating ?? 0;
  const starterHealthy = players[0]?.injury_status === 'healthy' || players[0]?.injury_status === 'questionable';

  return (
    <div>
      {players.map((player, idx) => {
        const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
        const injury = injuryMeta(player.injury_status);
        const isOut = player.injury_status === 'out' || player.injury_status === 'ir';
        const isStarter = idx === 0;
        const isHealthy = player.injury_status === 'healthy' || player.injury_status === 'questionable';

        const ovrDelta = idx > 0 ? player.overall_rating - starterOvr : null;
        const isMismatch = idx > 0 && starterHealthy && isHealthy && (ovrDelta ?? 0) > 0;

        return (
          <div
            key={player.player_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 52px 1fr auto',
              gap: 10,
              padding: '8px 12px',
              marginBottom: 3,
              borderRadius: 5,
              alignItems: 'center',
              background: isStarter
                ? 'rgba(42, 100, 42, 0.18)'
                : isMismatch
                ? 'rgba(90, 50, 0, 0.15)'
                : 'transparent',
              border: isStarter
                ? '1px solid rgba(42, 100, 42, 0.35)'
                : isMismatch
                ? '1px solid rgba(90, 50, 0, 0.35)'
                : '1px solid transparent',
            }}
          >
            {/* Slot label */}
            <div style={{ textAlign: 'center' }}>
              {isStarter ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#4caf50', letterSpacing: 1,
                  background: 'rgba(42,100,42,0.3)', padding: '2px 4px', borderRadius: 3,
                }}>STR</span>
              ) : idx === 1 ? (
                <span style={{ fontSize: 10, color: '#4FC3F7' }}>BU1</span>
              ) : (
                <span style={{ fontSize: 10, color: T.textDim }}>{idx + 1}</span>
              )}
            </div>

            {/* OVR + delta */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: ovrColor(player.overall_rating) }}>
                {player.overall_rating}
              </div>
              {ovrDelta !== null && (
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                  color: ovrDelta > 0 ? '#FF8740' : ovrDelta < 0 ? '#555' : '#444',
                }}>
                  {ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta < 0 ? `${ovrDelta}` : '—'}
                  {isMismatch && <span style={{ marginLeft: 2 }}>⚠</span>}
                </div>
              )}
            </div>

            {/* Name + details */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  color: isOut ? T.textDim : T.textPrimary,
                  fontWeight: isStarter ? 700 : 500,
                  fontSize: 13,
                  textDecoration: isOut ? 'line-through' : 'none',
                }}>
                  {player.first_name} {player.last_name}
                </span>
                {trait.short && (
                  <span style={{
                    fontSize: 9, padding: '1px 4px', borderRadius: 3,
                    background: 'rgba(255,255,255,0.05)', color: trait.color, fontWeight: 700,
                  }}>{trait.short}</span>
                )}
                {injury && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: injury.bg, color: injury.color, fontWeight: 700,
                  }}>{injury.label}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: T.textDim }}>
                {player.position_label || player.position} · Age {player.age} · SPD {player.speed} · STR {player.strength} · AWR {player.awareness}
                {player.injury_type && player.weeks_out > 0 && (
                  <span style={{ color: '#FF8740', marginLeft: 6 }}>{player.injury_type} · {player.weeks_out}wk</span>
                )}
                {player.injury_type && player.weeks_out === 0 && (
                  <span style={{ color: '#FFD700', marginLeft: 6 }}>{player.injury_type} · Game-time</span>
                )}
              </div>
            </div>

            {/* Move buttons */}
            <div style={{ display: 'flex', gap: 3 }}>
              {[
                { arrow: '▲', disabled: idx === 0, onClick: () => onMoveUp(idx) },
                { arrow: '▼', disabled: idx === players.length - 1, onClick: () => onMoveDown(idx) },
              ].map(({ arrow, disabled, onClick }) => (
                <button
                  key={arrow}
                  onClick={onClick}
                  disabled={disabled || saving !== null}
                  style={{
                    width: 26, height: 26, fontSize: 10,
                    background: disabled ? 'transparent' : T.bgCard,
                    border: `1px solid ${disabled ? 'transparent' : T.bgCardBorder}`,
                    color: disabled ? T.textDim : T.textMuted,
                    borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
                  }}
                >{arrow}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
