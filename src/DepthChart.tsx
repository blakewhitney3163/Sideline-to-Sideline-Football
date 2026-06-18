import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { DepthPlayer } from './depthChart/types';
import { POSITION_GROUPS, GROUP_LABELS, TRAIT_META } from './depthChart/depthUtils';
import DepthChartList from './depthChart/DepthChartList';
import StarterCard from './depthChart/StarterCard';
import { useGameStore } from './store/gameStore';

declare const window: any;

export default function DepthChart() {
  const { userTeam } = useGameStore();
  const [chart, setChart]           = useState<Record<string, DepthPlayer[]>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState<string | null>(null);
  const [resetting, setResetting]   = useState(false);
  const [activeGroup, setActiveGroup] = useState('QB');
  const [toast, setToast]           = useState<string | null>(null);

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

  const handleReset = async () => {
    if (!userTeam) return;
    setResetting(true);
    await window.api.resetDepthChart(userTeam.id);
    await load();
    setResetting(false);
    showToast('Depth chart reset to OVR order');
  };

  if (!userTeam) return null;

  const players      = chart[activeGroup] ?? [];
  const injuredCount = Object.values(chart).flat().filter(p => p.injury_status !== 'healthy').length;

  if (loading) return <div style={{ color: '#555', padding: 40 }}>Loading depth chart...</div>;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, background: '#0a2a0a', border: '1px solid #4caf50', borderRadius: 6, padding: '8px 16px', color: '#4caf50', fontSize: 12, zIndex: 1000 }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 700, margin: 0 }}>Depth Chart</h2>
          <div style={{ color: T.textDim, fontSize: 12, marginTop: 2 }}>
            {userTeam.city} {userTeam.name}
            {injuredCount > 0 && (
              <span style={{ color: '#FF8740', marginLeft: 8 }}>⚠ {injuredCount} injured</span>
            )}
          </div>
        </div>
        <button onClick={handleReset} disabled={resetting} style={{
          marginLeft: 'auto', padding: '6px 14px', fontSize: 11, cursor: resetting ? 'not-allowed' : 'pointer',
          background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted, fontFamily: 'monospace',
        }}>
          {resetting ? 'Resetting...' : '↺ Reset to OVR Order'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
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
              {group}{hasInjury && <span style={{ marginLeft: 4 }}>⚠</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          {GROUP_LABELS[activeGroup]?.toUpperCase()} — {players.length} PLAYERS
        </span>
        {saving === activeGroup && <span style={{ color: T.textDim, fontSize: 11 }}>saving...</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
        <DepthChartList players={players} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} />
        <StarterCard player={players[0] ?? null} />
      </div>
    </div>
  );
}
