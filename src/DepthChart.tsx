import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepthPlayer {
  player_id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  speed: number;
  strength: number;
  awareness: number;
  slot: number;
  position_group: string;
  injury_status: string;
  weeks_out: number;
  injury_type: string;
}

interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
}

interface Props {
  userTeam: UserTeam;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

const GROUP_LABELS: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End',
  OL: 'Offensive Line', DL: 'Defensive Line', LB: 'Linebacker',
  CB: 'Cornerback', S: 'Safety', K: 'Kicker',
};

const TRAIT_META: Record<string, { color: string; short: string }> = {
  Normal:     { color: T.textDim,    short: '' },
  Star:       { color: '#4FC3F7', short: 'S' },
  Superstar:  { color: '#FF8740', short: 'SS' },
  'X-Factor': { color: '#FFD700', short: 'XF' },
};

function ovrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return T.textSecondary;
}

function injuryMeta(status: string): { label: string; color: string; bg: string } | null {
  if (status === 'ir')           return { label: 'IR',  color: '#e57373', bg: T.bgRed };
  if (status === 'out')          return { label: 'OUT', color: '#FF8740', bg: T.bgOrange };
  if (status === 'questionable') return { label: 'Q',   color: '#FFD700', bg: T.bgGold };
  return null;
}

// ─── DepthChart ───────────────────────────────────────────────────────────────

export default function DepthChart({ userTeam }: Props) {
  const [chart,       setChart]       = useState<Record<string, DepthPlayer[]>>({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [resetting,   setResetting]   = useState(false);
  const [activeGroup, setActiveGroup] = useState('QB');
  const [toast,       setToast]       = useState<string | null>(null);

  useEffect(() => { load(); }, [userTeam.id]);

  const load = async () => {
    setLoading(true);
    const data = await window.api.getDepthChart(userTeam.id);
    setChart(data);
    setLoading(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleMoveUp = async (group: string, idx: number) => {
    if (idx === 0) return;
    const players = [...(chart[group] ?? [])];
    [players[idx - 1], players[idx]] = [players[idx], players[idx - 1]];
    setChart({ ...chart, [group]: players });
    setSaving(group);
    await window.api.setDepthChartOrder({
      teamId: userTeam.id,
      positionGroup: group,
      playerIds: players.map(p => p.player_id),
    });
    setSaving(null);
    showToast(`${players[idx - 1].first_name} ${players[idx - 1].last_name} moved to #${idx}`);
  };

  const handleMoveDown = async (group: string, idx: number) => {
    const players = [...(chart[group] ?? [])];
    if (idx >= players.length - 1) return;
    [players[idx], players[idx + 1]] = [players[idx + 1], players[idx]];
    setChart({ ...chart, [group]: players });
    setSaving(group);
    await window.api.setDepthChartOrder({
      teamId: userTeam.id,
      positionGroup: group,
      playerIds: players.map(p => p.player_id),
    });
    setSaving(null);
    showToast(`${players[idx].first_name} ${players[idx].last_name} moved to #${idx + 1}`);
  };

  const handleReset = async () => {
    setResetting(true);
    await window.api.resetDepthChart(userTeam.id);
    await load();
    setResetting(false);
    showToast('Depth chart reset to OVR order');
  };

  const players = chart[activeGroup] ?? [];
  const injuredCount = Object.values(chart).flat().filter(p => p.injury_status !== 'healthy').length;

  if (loading) {
    return <div style={{ color: T.textMuted, padding: 40, fontFamily: 'monospace' }}>Loading depth chart...</div>;
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: T.textPrimary, background: T.bgPage, minHeight: '100vh' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, background: T.bgGreen,
          border: '1px solid #2a4a2a', borderRadius: 6, padding: '10px 16px',
          color: '#4caf50', fontSize: 12, zIndex: 999,
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Depth Chart</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
            {userTeam.city} {userTeam.name}
            {injuredCount > 0 && (
              <span style={{ marginLeft: 12, color: '#FF8740' }}>⚠ {injuredCount} injured</span>
            )}
          </div>
        </div>
        <button onClick={handleReset} disabled={resetting} style={{
          padding: '7px 14px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
          borderRadius: 4, color: resetting ? T.borderStrong : T.textMuted, fontSize: 11,
          cursor: resetting ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {resetting ? 'Resetting...' : '↺ Reset to OVR Order'}
        </button>
      </div>

      {/* Position Group Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {POSITION_GROUPS.map(group => {
          const groupPlayers = chart[group] ?? [];
          if (groupPlayers.length === 0) return null;
          const hasInjury = groupPlayers.some(p => p.injury_status !== 'healthy');
          return (
            <button key={group} onClick={() => setActiveGroup(group)} style={{
              padding: '6px 14px',
              background: activeGroup === group ? T.bgGreen : T.bgPage,
              border: `1px solid ${activeGroup === group ? '#2a4a2a' : hasInjury ? '#2a1a00' : T.bgCard}`,
              borderRadius: 4,
              color: activeGroup === group ? '#4caf50' : hasInjury ? '#FF8740' : T.textMuted,
              fontWeight: activeGroup === group ? 'bold' : 'normal',
              fontSize: 12, cursor: 'pointer', fontFamily: 'monospace',
            }}>
              {group}
              {hasInjury && <span style={{ marginLeft: 4, fontSize: 9 }}>⚠</span>}
            </button>
          );
        })}
      </div>

      {/* Group Label */}
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 16 }}>
        {GROUP_LABELS[activeGroup]?.toUpperCase()} — {players.length} PLAYERS
        {saving === activeGroup && <span style={{ color: T.borderStrong, marginLeft: 12 }}>saving...</span>}
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div>
          {players.length === 0 ? (
            <div style={{ color: T.borderStrong, fontSize: 12 }}>No players at this position.</div>
          ) : (
            players.map((player, idx) => {
              const trait   = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
              const injury  = injuryMeta(player.injury_status);
              const isOut   = player.injury_status === 'out' || player.injury_status === 'ir';
              const isStarter = idx === 0;
              const isBackup  = idx === 1;

              return (
                <div key={player.player_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', marginBottom: 4,
                  background: isOut ? '#120a0a' : isStarter ? T.bgGreen : T.bgPage,
                  border: `1px solid ${isOut ? '#2a1010' : isStarter ? '#1a3a1a' : T.bgCard}`,
                  borderRadius: 6, opacity: isOut ? 0.75 : 1,
                }}>

                  {/* Slot */}
                  <div style={{ width: 28, textAlign: 'right', flexShrink: 0 }}>
                    {isStarter ? (
                      <span style={{ fontSize: 9, color: isOut ? T.textMuted : '#4caf50', letterSpacing: 1 }}>STR</span>
                    ) : isBackup ? (
                      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1 }}>BU1</span>
                    ) : (
                      <span style={{ fontSize: 11, color: T.borderStrong }}>{idx + 1}</span>
                    )}
                  </div>

                  {/* OVR */}
                  <div style={{
                    width: 36, textAlign: 'center', fontSize: 14, fontWeight: 'bold',
                    color: isOut ? T.textDim : ovrColor(player.overall_rating), flexShrink: 0,
                  }}>
                    {player.overall_rating}
                  </div>

                  {/* Name + info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: isOut ? T.textMuted : isStarter ? '#fff' : T.textPrimary }}>
                        {player.first_name} {player.last_name}
                      </span>
                      {trait.short && (
                        <span style={{
                          fontSize: 9, color: isOut ? T.textDim : trait.color,
                          border: `1px solid ${isOut ? T.borderStrong : trait.color}`,
                          borderRadius: 2, padding: '1px 4px', letterSpacing: 0.5,
                        }}>{trait.short}</span>
                      )}
                      {injury && (
                        <span style={{
                          fontSize: 9, fontWeight: 'bold', color: injury.color,
                          background: injury.bg, border: `1px solid ${injury.color}`,
                          borderRadius: 2, padding: '1px 5px', letterSpacing: 0.5,
                        }}>{injury.label}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                      {player.position_label || player.position} · Age {player.age} · SPD {player.speed} · STR {player.strength} · AWR {player.awareness}
                      {player.injury_type && player.weeks_out > 0 && (
                        <span style={{ color: '#3a2010', marginLeft: 8 }}>{player.injury_type} · {player.weeks_out}wk</span>
                      )}
                      {player.injury_type && player.weeks_out === 0 && (
                        <span style={{ color: '#FFD700', marginLeft: 8 }}>{player.injury_type} · Game-time</span>
                      )}
                    </div>
                  </div>

                  {/* Move buttons */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => handleMoveUp(activeGroup, idx)} disabled={idx === 0} style={{
                      width: 28, height: 28, background: T.bgPanel, border: `1px solid ${T.borderFaint}`,
                      borderRadius: 3, color: idx === 0 ? '#252525' : T.textMuted,
                      cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>▲</button>
                    <button onClick={() => handleMoveDown(activeGroup, idx)} disabled={idx === players.length - 1} style={{
                      width: 28, height: 28, background: T.bgPanel, border: `1px solid ${T.borderFaint}`,
                      borderRadius: 3, color: idx === players.length - 1 ? '#252525' : T.textMuted,
                      cursor: idx === players.length - 1 ? 'not-allowed' : 'pointer', fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>▼</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Starter Card */}
        {players.length > 0 && (() => {
          const starter = players[0];
          const trait   = TRAIT_META[starter.dev_trait] ?? TRAIT_META['Normal'];
          const injury  = injuryMeta(starter.injury_status);
          const isOut   = starter.injury_status === 'out' || starter.injury_status === 'ir';
          // If starter is out, find next healthy player
          const effective = isOut ? players.find(p => p.injury_status === 'healthy' || p.injury_status === 'questionable') : starter;

          return (
            <div>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 12 }}>
                {isOut ? 'EXPECTED STARTER' : 'STARTER'}
              </div>
              {isOut && effective && (
                <div style={{ background: '#1a0a00', border: '1px solid #3a1a00', borderRadius: 4, padding: '6px 10px', marginBottom: 8, fontSize: 10, color: '#FF8740' }}>
                  ⚠ {starter.first_name} {starter.last_name} is {starter.injury_status.toUpperCase()} — {effective.first_name} {effective.last_name} starts
                </div>
              )}
              <div style={{
                background: T.bgPage,
                border: `1px solid ${isOut ? '#2a1010' : '#1a3a1a'}`,
                borderRadius: 8, padding: '16px 18px',
              }}>
                <div style={{ fontSize: 9, color: isOut ? '#e57373' : '#4caf50', letterSpacing: 2, marginBottom: 8 }}>
                  {GROUP_LABELS[activeGroup]?.toUpperCase()}
                </div>

                {/* Show effective starter if original is out */}
                {(() => {
                  const display = (isOut && effective) ? effective : starter;
                  const displayTrait = TRAIT_META[display.dev_trait] ?? TRAIT_META['Normal'];
                  const displayInjury = injuryMeta(display.injury_status);
                  return (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>
                        {display.first_name} {display.last_name}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>
                        {display.position_label || display.position} · Age {display.age}
                        {displayInjury && (
                          <span style={{ marginLeft: 8, color: displayInjury.color }}>
                            {displayInjury.label}{display.weeks_out > 0 ? ` · ${display.weeks_out}wk` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                        {[
                          { label: 'OVR', val: display.overall_rating, color: ovrColor(display.overall_rating) },
                          { label: 'SPD', val: display.speed,           color: T.textPrimary },
                          { label: 'STR', val: display.strength,        color: T.textPrimary },
                          { label: 'AWR', val: display.awareness,       color: T.textPrimary },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ textAlign: 'center', flex: 1, background: '#0a0a0a', borderRadius: 4, padding: '8px 0' }}>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color }}>{val}</div>
                            <div style={{ fontSize: 9, color: T.borderStrong, marginTop: 2 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      {displayTrait.short && (
                        <div style={{
                          display: 'inline-block', fontSize: 10, color: displayTrait.color,
                          border: `1px solid ${displayTrait.color}`, borderRadius: 3,
                          padding: '2px 8px', letterSpacing: 1, marginBottom: 12,
                        }}>
                          {display.dev_trait}
                        </div>
                      )}
                    </>
                  );
                })()}

                {players.length > 1 && (
                  <div style={{ paddingTop: 12, borderTop: `1px solid ${T.borderFaint}` }}>
                    <div style={{ fontSize: 9, color: T.borderStrong, letterSpacing: 1, marginBottom: 8 }}>DEPTH</div>
                    {players.slice(1, 5).map((p, i) => {
                      const pInjury = injuryMeta(p.injury_status);
                      return (
                        <div key={p.player_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 11, borderBottom: '1px solid #111' }}>
                          <span style={{ color: p.injury_status !== 'healthy' ? T.textDim : T.textMuted }}>
                            {i + 2}. {p.first_name[0]}. {p.last_name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {pInjury && (
                              <span style={{ fontSize: 9, color: pInjury.color }}>{pInjury.label}</span>
                            )}
                            <span style={{ color: ovrColor(p.overall_rating) }}>{p.overall_rating}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}