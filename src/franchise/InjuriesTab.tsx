import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

interface InjuredPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label?: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  injury_status: string;
  weeks_out: number;
  injury_type: string | null;
  injury_prone: number;
}

interface InjuryHistoryRow {
  id: number;
  season: number;
  week: number;
  injury_type: string;
  severity: 'minor' | 'moderate' | 'severe';
  weeks_out: number;
}

const SEVERITY_COLOR = {
  minor: '#4caf50',
  moderate: '#FF8740',
  severe: '#e57373',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  out:         { label: 'OUT',         color: '#e57373' },
  questionable:{ label: 'QUESTIONABLE',color: '#FF8740' },
  doubtful:    { label: 'DOUBTFUL',    color: '#ef9a9a' },
  ir:          { label: 'IR',          color: '#b39ddb' },
};

export default function InjuriesTab() {
  const [players, setPlayers] = useState<InjuredPlayer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<InjuryHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await window.api.getTeamInjuries();
    setPlayers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) { setHistory([]); return; }
    setHistoryLoading(true);
    window.api.getInjuryHistory(selectedId).then((rows: InjuryHistoryRow[]) => {
      setHistory(rows ?? []);
      setHistoryLoading(false);
    });
  }, [selectedId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const handlePlaceOnIR = async (playerId: number, name: string) => {
    const res = await window.api.placeOnIR(playerId);
    if (res.success) {
      showToast(`${name} placed on IR`);
      await load();
      if (selectedId === playerId) setSelectedId(null);
    } else {
      showToast(res.reason ?? 'Error');
    }
  };

  const handleActivateFromIR = async (playerId: number, name: string) => {
    const res = await window.api.activateFromIR(playerId);
    if (res.success) {
      showToast(`${name} activated from IR`);
      await load();
    } else {
      showToast(res.reason ?? 'Error');
    }
  };

  const irPlayers = players.filter(p => p.injury_status === 'ir');
  const activePlayers = players.filter(p => p.injury_status !== 'ir');
  const selectedPlayer = players.find(p => p.id === selectedId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: T.bg }}>

      {/* Left panel — injury list */}
      <div style={{ width: 420, borderRight: `1px solid ${T.borderFaint}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 10px', borderBottom: `1px solid ${T.borderFaint}` }}>
          <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 }}>INJURY REPORT</div>
          <div style={{ color: T.textDim, fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
            {players.length === 0 ? 'No players currently injured' : `${players.length} player${players.length !== 1 ? 's' : ''} injured`}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: 24, color: T.textDim, fontFamily: 'monospace', fontSize: 11 }}>Loading...</div>
          )}

          {!loading && players.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 11, letterSpacing: 1 }}>
                ALL PLAYERS HEALTHY
              </div>
            </div>
          )}

          {/* IR section */}
          {irPlayers.length > 0 && (
            <>
              <div style={{ padding: '8px 20px 4px', color: '#b39ddb', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 }}>
                INJURED RESERVE ({irPlayers.length})
              </div>
              {irPlayers.map(p => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  onActivate={() => handleActivateFromIR(p.id, `${p.first_name} ${p.last_name}`)}
                />
              ))}
            </>
          )}

          {/* Active injured */}
          {activePlayers.length > 0 && (
            <>
              <div style={{ padding: `${irPlayers.length > 0 ? 12 : 8}px 20px 4px`, color: '#e57373', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2 }}>
                INJURED — ACTIVE ROSTER ({activePlayers.length})
              </div>
              {activePlayers.map(p => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  onPlaceOnIR={p.weeks_out >= 4
                    ? () => handlePlaceOnIR(p.id, `${p.first_name} ${p.last_name}`)
                    : undefined}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right panel — detail / history */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedPlayer ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: T.textDim, fontFamily: 'monospace' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏥</div>
              <div style={{ fontSize: 11, letterSpacing: 1 }}>SELECT A PLAYER TO VIEW HISTORY</div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {/* Player header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${T.borderFaint}` }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold' }}>
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </span>
                  {selectedPlayer.injury_prone === 1 && (
                    <span style={{ background: '#3a1a1a', color: '#e57373', border: '1px solid #e57373', borderRadius: 3, padding: '2px 7px', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
                      ⚠ INJURY PRONE
                    </span>
                  )}
                </div>
                <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 11, marginBottom: 10 }}>
                  {selectedPlayer.position_label ?? selectedPlayer.position} · {selectedPlayer.overall_rating} OVR · Age {selectedPlayer.age} · {selectedPlayer.dev_trait}
                </div>

                {/* Current status */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatusBadge status={selectedPlayer.injury_status} />
                  {selectedPlayer.injury_type && (
                    <span style={{ background: '#1a1a1a', color: T.textMuted, border: `1px solid ${T.borderFaint}`, borderRadius: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'monospace' }}>
                      {selectedPlayer.injury_type}
                    </span>
                  )}
                  {selectedPlayer.weeks_out > 0 && (
                    <span style={{ background: '#1a1a1a', color: '#FF8740', border: `1px solid #FF8740`, borderRadius: 3, padding: '3px 8px', fontSize: 10, fontFamily: 'monospace' }}>
                      {selectedPlayer.weeks_out} WK{selectedPlayer.weeks_out !== 1 ? 'S' : ''} OUT
                    </span>
                  )}
                </div>

                {/* IR / Activate buttons */}
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  {selectedPlayer.injury_status === 'ir' ? (
                    <button onClick={() => handleActivateFromIR(selectedPlayer.id, `${selectedPlayer.first_name} ${selectedPlayer.last_name}`)} style={btnStyle('#1a2a1a', '#4caf50')}>
                      ↩ Activate from IR
                    </button>
                  ) : selectedPlayer.weeks_out >= 4 ? (
                    <button onClick={() => handlePlaceOnIR(selectedPlayer.id, `${selectedPlayer.first_name} ${selectedPlayer.last_name}`)} style={btnStyle('#2a1a2a', '#b39ddb')}>
                      → Place on IR
                    </button>
                  ) : null}
                </div>

                {selectedPlayer.injury_status !== 'ir' && selectedPlayer.weeks_out >= 4 && (
                  <div style={{ marginTop: 8, color: T.textDim, fontFamily: 'monospace', fontSize: 10 }}>
                    IR clears this player from the active injury list while they recover.
                  </div>
                )}
              </div>
            </div>

            {/* Injury history */}
            <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
              INJURY HISTORY
            </div>

            {historyLoading && (
              <div style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 11 }}>Loading...</div>
            )}

            {!historyLoading && history.length === 0 && (
              <div style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 11 }}>
                No recorded injury history.
              </div>
            )}

            {!historyLoading && history.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: T.textDim, borderBottom: `1px solid ${T.borderFaint}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', fontWeight: 'normal', letterSpacing: 1, fontSize: 10 }}>SEASON</th>
                    <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', fontWeight: 'normal', letterSpacing: 1, fontSize: 10 }}>WEEK</th>
                    <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', fontWeight: 'normal', letterSpacing: 1, fontSize: 10 }}>INJURY</th>
                    <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', fontWeight: 'normal', letterSpacing: 1, fontSize: 10 }}>SEVERITY</th>
                    <th style={{ textAlign: 'right', padding: '6px 0 6px 0', fontWeight: 'normal', letterSpacing: 1, fontSize: 10 }}>TIME LOST</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${T.borderFaint}` }}>
                      <td style={{ padding: '8px 12px 8px 0', color: T.textMuted }}>{row.season}</td>
                      <td style={{ padding: '8px 12px 8px 0', color: T.textMuted }}>Wk {row.week}</td>
                      <td style={{ padding: '8px 12px 8px 0', color: '#fff' }}>{row.injury_type}</td>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <span style={{ color: SEVERITY_COLOR[row.severity], textTransform: 'uppercase', fontSize: 10 }}>
                          {row.severity}
                        </span>
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: T.textMuted }}>
                        {row.weeks_out === 0 ? '—' : `${row.weeks_out} wk${row.weeks_out !== 1 ? 's' : ''}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a2a1a', border: '1px solid #4caf50', color: '#4caf50',
          padding: '10px 20px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12,
          zIndex: 9999, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerRow({ player, selected, onClick, onPlaceOnIR, onActivate }: {
  player: InjuredPlayer;
  selected: boolean;
  onClick: () => void;
  onPlaceOnIR?: () => void;
  onActivate?: () => void;
}) {
  const isIR = player.injury_status === 'ir';
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 20px',
        cursor: 'pointer',
        background: selected ? '#1a1a2a' : 'transparent',
        borderLeft: selected ? '2px solid #4FC3F7' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: 12, fontWeight: selected ? 'bold' : 'normal' }}>
              {player.first_name} {player.last_name}
            </span>
            {player.injury_prone === 1 && (
              <span style={{ color: '#e57373', fontSize: 9, fontFamily: 'monospace' }}>⚠</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 10 }}>
              {player.position_label ?? player.position} · {player.overall_rating} OVR
            </span>
            <StatusBadge status={player.injury_status} />
            {player.injury_type && (
              <span style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 10 }}>{player.injury_type}</span>
            )}
            {player.weeks_out > 0 && (
              <span style={{ color: '#FF8740', fontFamily: 'monospace', fontSize: 10 }}>
                {player.weeks_out} wk{player.weeks_out !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }} onClick={e => e.stopPropagation()}>
          {isIR && onActivate && (
            <button onClick={onActivate} style={btnStyle('#1a2a1a', '#4caf50', true)}>
              Activate
            </button>
          )}
          {!isIR && onPlaceOnIR && player.weeks_out >= 4 && (
            <button onClick={onPlaceOnIR} style={btnStyle('#2a1a2a', '#b39ddb', true)}>
              → IR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status.toUpperCase(), color: T.textDim };
  return (
    <span style={{
      color: s.color,
      border: `1px solid ${s.color}`,
      borderRadius: 3, padding: '1px 5px',
      fontSize: 9, fontFamily: 'monospace', letterSpacing: 0.5,
    }}>
      {s.label}
    </span>
  );
}

function btnStyle(bg: string, color: string, small = false): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${color}`,
    borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
    fontSize: small ? 9 : 10, padding: small ? '3px 8px' : '6px 14px',
    letterSpacing: small ? 0 : 1,
  };
}
