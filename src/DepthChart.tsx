import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { DepthPlayer } from './depthChart/types';
import { POSITION_GROUPS, GROUP_LABELS, TRAIT_META } from './depthChart/depthUtils';
import DepthChartList from './depthChart/DepthChartList';
import StarterCard from './depthChart/StarterCard';
import { useGameStore } from './store/gameStore';

declare const window: any;

const PHASE_GROUPS: { label: string; groups: string[] }[] = [
  { label: 'OFFENSE', groups: ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] },
  { label: 'DEFENSE', groups: ['DE', 'DT', 'MLB', 'OLB', 'CB', 'FS', 'SS'] },
  { label: 'SPECIAL TEAMS', groups: ['K'] },
];

export default function DepthChart() {
  const { userTeam } = useGameStore();
  const [chart, setChart] = useState<Record<string, DepthPlayer[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [activeGroup, setActiveGroup] = useState('QB');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (userTeam) load(); }, [userTeam?.id]);

  const load = async () => {
    if (!userTeam) return;
    setLoading(true);
    const data = await window.api.getDepthChart(userTeam.id);
    setChart(data);
    setLoading(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleMoveUp = async (idx: number) => {
    if (idx === 0 || !userTeam) return;
    const players = [...(chart[activeGroup] ?? [])];
    [players[idx - 1], players[idx]] = [players[idx], players[idx - 1]];
    setChart({ ...chart, [activeGroup]: players });
    setSaving(activeGroup);
    await window.api.setDepthChartOrder({ teamId: userTeam.id, positionGroup: activeGroup, playerIds: players.map(p => p.player_id) });
    setSaving(null);
    showToast(`${players[idx - 1].first_name} ${players[idx - 1].last_name} moved to #${idx}`);
  };

  const handleMoveDown = async (idx: number) => {
    if (!userTeam) return;
    const players = [...(chart[activeGroup] ?? [])];
    if (idx >= players.length - 1) return;
    [players[idx], players[idx + 1]] = [players[idx + 1], players[idx]];
    setChart({ ...chart, [activeGroup]: players });
    setSaving(activeGroup);
    await window.api.setDepthChartOrder({ teamId: userTeam.id, positionGroup: activeGroup, playerIds: players.map(p => p.player_id) });
    setSaving(null);
    showToast(`${players[idx].first_name} ${players[idx].last_name} moved to #${idx + 1}`);
  };

  const handleAutoSort = async () => {
    if (!userTeam) return;
    const players = [...(chart[activeGroup] ?? [])].sort((a, b) => b.overall_rating - a.overall_rating);
    setChart({ ...chart, [activeGroup]: players });
    setSaving(activeGroup);
    await window.api.setDepthChartOrder({ teamId: userTeam.id, positionGroup: activeGroup, playerIds: players.map(p => p.player_id) });
    setSaving(null);
    showToast(`${GROUP_LABELS[activeGroup]} sorted by OVR`);
  };

  const handleReset = async () => {
    if (!userTeam) return;
    setResetting(true);
    await window.api.resetDepthChart(userTeam.id);
    await load();
    setResetting(false);
    showToast('Full depth chart reset to OVR order');
  };

  if (!userTeam) return null;

  const players = chart[activeGroup] ?? [];
  const injuredCount = Object.values(chart).flat().filter(p => p.injury_status !== 'healthy').length;

  // Mismatch detection: any healthy backup OVR > starter OVR
  const starter = players[0];
  const hasMismatch = starter &&
    (starter.injury_status === 'healthy' || starter.injury_status === 'questionable') &&
    players.slice(1).some(p =>
      (p.injury_status === 'healthy' || p.injury_status === 'questionable') &&
      p.overall_rating > starter.overall_rating
    );

  if (loading) return <div style={{ color: T.textMuted, padding: 32 }}>Loading depth chart...</div>;

  return (
    <div style={{ color: T.textPrimary, fontFamily: 'monospace', padding: '16px 20px', maxWidth: 960, margin: '0 auto', position: 'relative' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 999,
          background: '#0a1a0a', border: '1px solid #2a4a2a',
          color: '#4caf50', padding: '8px 16px', borderRadius: 6, fontSize: 12,
        }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#FF8740', textTransform: 'uppercase' }}>Depth Chart</div>
          <div style={{ fontSize: 13, color: T.textMuted }}>
            {userTeam.city} {userTeam.name}
            {injuredCount > 0 && (
              <span style={{ marginLeft: 10, color: '#FF8740', fontSize: 11 }}>⚠ {injuredCount} injured</span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleAutoSort}
            disabled={saving === activeGroup}
            style={{
              padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: '#0a1a2a', border: '1px solid #1a3a5a', color: '#4FC3F7',
            }}
          >
            ⇅ Sort {activeGroup} by OVR
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: T.bgCard, border: `1px solid ${T.bgCardBorder}`, color: T.textMuted,
            }}
          >
            {resetting ? 'Resetting...' : '↺ Reset All'}
          </button>
        </div>
      </div>

      {/* Phase-grouped tabs */}
      <div style={{ marginBottom: 16 }}>
        {PHASE_GROUPS.map(phase => {
          const phaseGroups = phase.groups.filter(g => (chart[g] ?? []).length > 0);
          if (phaseGroups.length === 0) return null;
          return (
            <div key={phase.label} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#333', marginBottom: 5, textTransform: 'uppercase' }}>
                {phase.label}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {phaseGroups.map(group => {
                  const groupPlayers = chart[group] ?? [];
                  const hasInjury = groupPlayers.some(p => p.injury_status !== 'healthy');
                  const groupStarter = groupPlayers[0];
                  const groupMismatch = groupStarter &&
                    (groupStarter.injury_status === 'healthy' || groupStarter.injury_status === 'questionable') &&
                    groupPlayers.slice(1).some(p =>
                      (p.injury_status === 'healthy' || p.injury_status === 'questionable') &&
                      p.overall_rating > groupStarter.overall_rating
                    );
                  const isActive = activeGroup === group;
                  return (
                    <button
                      key={group}
                      onClick={() => setActiveGroup(group)}
                      style={{
                        padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                        fontFamily: 'monospace',
                        background: isActive ? '#0a2a0a' : T.bgPage,
                        border: `1px solid ${isActive ? '#2a6a2a' : groupMismatch ? '#5a3a00' : hasInjury ? '#2a1a00' : T.bgCard}`,
                        color: isActive ? '#4caf50' : groupMismatch ? '#FF8740' : hasInjury ? '#FF8740' : T.textMuted,
                        fontWeight: isActive ? 'bold' : 'normal',
                      }}
                    >
                      {group}
                      {groupMismatch && <span style={{ marginLeft: 4, fontSize: 9 }}>⚠</span>}
                      {!groupMismatch && hasInjury && <span style={{ marginLeft: 4, fontSize: 9, color: '#FF8740' }}>+</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mismatch warning banner */}
      {hasMismatch && (
        <div style={{
          background: '#1a0e00', border: '1px solid #5a3a00', borderRadius: 6,
          padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#FF8740',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠</span>
          <span>
            A backup has a higher OVR than your starter. Use <strong>⇅ Sort by OVR</strong> to fix or manually reorder below.
          </span>
        </div>
      )}

      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 1 }}>
          {GROUP_LABELS[activeGroup]?.toUpperCase()} — {players.length} PLAYERS
        </div>
        {saving === activeGroup && <span style={{ fontSize: 10, color: T.textDim }}>saving...</span>}
      </div>

      {/* Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <StarterCard players={players} activeGroup={activeGroup} />
        <DepthChartList
          players={players}
          activeGroup={activeGroup}
          saving={saving}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
      </div>
    </div>
  );
}
