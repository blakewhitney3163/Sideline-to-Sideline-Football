import React, { useState } from 'react';
import { T } from '../theme';
import { Player, PlayerStats, CareerSeasonStats } from './types';
import { getRatingCols, getOvrColor, attrColor, DEF_POSITIONS, showStats, getCareerHeaders } from './teamsUtils';

declare const window: any;

// ─── Sub-components (unchanged) ───────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SeasonStatsRow({ s, position }: { s: CareerSeasonStats; position: string }) {
  if (DEF_POSITIONS.includes(position)) {
    return (
      <tr>
        <td style={tdStyle}>{s.season}</td>
        <td style={tdStyle}>{s.games}</td>
        <td style={tdStyle}>{(s.tackles ?? 0) + (s.assisted_tackles ?? 0)}</td>
        <td style={tdStyle}>{Number(s.sacks ?? 0).toFixed(1)}</td>
        <td style={tdStyle}>{s.tfl ?? 0}</td>
        <td style={tdStyle}>{s.def_interceptions ?? 0}</td>
        <td style={tdStyle}>{s.pass_deflections ?? 0}</td>
      </tr>
    );
  }
  if (position === 'QB') {
    return (
      <tr>
        <td style={tdStyle}>{s.season}</td>
        <td style={tdStyle}>{s.games}</td>
        <td style={tdStyle}>{s.pass_yards}</td>
        <td style={tdStyle}>{s.pass_tds}</td>
        <td style={tdStyle}>{s.interceptions}</td>
        <td style={tdStyle}>{s.pass_attempts > 0 ? `${Math.round((s.completions / s.pass_attempts) * 100)}%` : '—'}</td>
      </tr>
    );
  }
  if (position === 'RB') {
    return (
      <tr>
        <td style={tdStyle}>{s.season}</td>
        <td style={tdStyle}>{s.games}</td>
        <td style={tdStyle}>{s.rush_yards}</td>
        <td style={tdStyle}>{s.rush_tds}</td>
        <td style={tdStyle}>{s.rush_attempts > 0 ? (s.rush_yards / s.rush_attempts).toFixed(1) : '—'}</td>
        <td style={tdStyle}>{s.receptions} / {s.rec_yards}</td>
      </tr>
    );
  }
  if (position === 'K') {
    const fgPct = (s.fg_att ?? 0) > 0 ? `${Math.round(((s.fg_made ?? 0) / s.fg_att) * 100)}%` : '—';
    return (
      <tr>
        <td style={tdStyle}>{s.season}</td>
        <td style={tdStyle}>{s.games}</td>
        <td style={tdStyle}>{s.fg_made ?? 0}/{s.fg_att ?? 0}</td>
        <td style={tdStyle}>{fgPct}</td>
        <td style={tdStyle}>{s.xp_made ?? 0}/{s.xp_att ?? 0}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td style={tdStyle}>{s.season}</td>
      <td style={tdStyle}>{s.games}</td>
      <td style={tdStyle}>{s.rec_yards}</td>
      <td style={tdStyle}>{s.rec_tds}</td>
      <td style={tdStyle}>{s.receptions}/{s.targets}</td>
      <td style={tdStyle}>{s.targets > 0 ? `${Math.round((s.receptions / s.targets) * 100)}%` : '—'}</td>
    </tr>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  player: Player;
  playerStats: PlayerStats | null;
  careerStats: CareerSeasonStats[];
  statsView: 'season' | 'career';
  setStatsView: (v: 'season' | 'career') => void;
  onClose: () => void;
  onSave?: (updated: Player) => void;
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px', borderBottom: '1px solid #1a1a1a', fontSize: 12, color: T.textSecondary,
};

const DEV_TRAITS = ['Normal', 'Star', 'Superstar', 'X-Factor'] as const;
const TRAIT_COLOR: Record<string, string> = {
  Normal: '#9CA3AF', Star: '#4FC3F7', Superstar: '#C084FC', 'X-Factor': '#FFD700',
};

// ─── Edit Panel ───────────────────────────────────────────────────────────────

function RatingInput({
  label, field, vals, onChange,
}: {
  label: string;
  field: keyof Player;
  vals: Partial<Player>;
  onChange: (field: keyof Player, val: number) => void;
}) {
  const val = (vals[field] as number) ?? 70;
  const color = val >= 90 ? '#FFD700' : val >= 80 ? '#4caf50' : val >= 70 ? '#FF8740' : '#888';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: T.textSecondary, fontSize: 10, letterSpacing: 1 }}>{label}</span>
        <span style={{ color, fontSize: 13, fontWeight: 700, minWidth: 26, textAlign: 'right' }}>{val}</span>
      </div>
      <input
        type="range" min={40} max={99} value={val}
        onChange={e => onChange(field, Number(e.target.value))}
        style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
      />
    </div>
  );
}

function EditPanel({ player, onSave, onCancel }: {
  player: Player;
  onSave: (updated: Player) => void;
  onCancel: () => void;
}) {
  const [vals, setVals] = useState<Player>({ ...player });
  const [saving, setSaving] = useState(false);
  const attrCols = getRatingCols(vals.position_label || vals.position);

  const set = (field: keyof Player, val: any) =>
    setVals(prev => ({ ...prev, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    const result = await window.api.editPlayer({
      playerId: vals.id,
      overall_rating: vals.overall_rating,
      age: vals.age,
      dev_trait: vals.dev_trait,
      speed: vals.speed,
      strength: vals.strength,
      awareness: vals.awareness,
      throw_accuracy: vals.throw_accuracy,
      throw_power: vals.throw_power,
      catching: vals.catching,
      route_running: vals.route_running,
      tackle_rating: vals.tackle_rating,
      coverage: vals.coverage,
      pass_rush: vals.pass_rush,
      kickpower: vals.kickpower,
      kickaccuracy: vals.kickaccuracy,
      runblocking: vals.runblocking,
      passblocking: vals.passblocking,
    });
    setSaving(false);
    if (result?.success) onSave(vals);
  };

  const inputStyle: React.CSSProperties = {
    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4,
    color: '#ccc', padding: '5px 8px', fontSize: 13, width: 60,
  };

  return (
    <div style={{ padding: '0 16px 16px' }}>

      {/* Core fields */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: T.textSecondary, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>OVR</div>
          <input
            type="number" min={40} max={99} value={vals.overall_rating}
            onChange={e => set('overall_rating', Number(e.target.value))}
            style={{ ...inputStyle, width: 54 }}
          />
        </div>
        <div>
          <div style={{ color: T.textSecondary, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>AGE</div>
          <input
            type="number" min={18} max={45} value={vals.age}
            onChange={e => set('age', Number(e.target.value))}
            style={{ ...inputStyle, width: 54 }}
          />
        </div>
        <div>
          <div style={{ color: T.textSecondary, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>DEV TRAIT</div>
          <select
            value={vals.dev_trait}
            onChange={e => set('dev_trait', e.target.value)}
            style={{
              background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4,
              color: TRAIT_COLOR[vals.dev_trait] ?? '#ccc',
              padding: '5px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {DEV_TRAITS.map(t => (
              <option key={t} value={t} style={{ color: TRAIT_COLOR[t] }}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Attribute sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 }}>
        {attrCols.map(col => (
          <RatingInput
            key={col.key as string}
            label={col.label}
            field={col.key}
            vals={vals}
            onChange={(f, v) => set(f, v)}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '7px 20px', background: saving ? '#141414' : '#4caf50',
            border: 'none', borderRadius: 4,
            color: saving ? '#444' : '#000',
            fontWeight: 700, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '7px 16px', background: '#141414',
            border: '1px solid #2a2a2a', borderRadius: 4,
            color: '#555', fontSize: 12, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayerProfile({
  player, playerStats, careerStats, statsView, setStatsView, onClose, onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const pos = player.position_label || player.position;
  const attrCols = getRatingCols(pos);

  const handleSave = (updated: Player) => {
    setEditing(false);
    onSave?.(updated);
  };

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 8, overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: '14px 16px 12px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div>
          <div style={{ color: T.text, fontSize: 16, fontWeight: 700 }}>
            {player.first_name} {player.last_name}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <span style={{
              background: '#1a2a1a', color: '#4caf50', fontSize: 10,
              fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            }}>{pos}</span>
            <span style={{ color: T.textSecondary, fontSize: 11 }}>Age {player.age}</span>
            <span style={{
              color: getOvrColor(player.overall_rating), fontSize: 13, fontWeight: 700,
            }}>{player.overall_rating} OVR</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setEditing(e => !e)}
            style={{
              padding: '4px 12px',
              background: editing ? '#1a1000' : '#141414',
              border: `1px solid ${editing ? '#FF8740' : '#2a2a2a'}`,
              borderRadius: 4,
              color: editing ? '#FF8740' : '#555',
              fontSize: 11, fontWeight: editing ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {editing ? 'Editing…' : 'Edit'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: T.textSecondary, cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={{ borderBottom: `1px solid ${T.border}`, padding: '14px 0 0' }}>
          <EditPanel
            player={player}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {/* Attributes (view mode) */}
      {!editing && (
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ color: T.textSecondary, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>
            ATTRIBUTES
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {attrCols.map(col => (
              <div key={col.key as string} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: attrColor((player[col.key] as number) ?? 0),
                }}>
                  {(player[col.key] as number) ?? '—'}
                </div>
                <div style={{ fontSize: 10, color: T.textSecondary, marginTop: 2 }}>{col.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats section (unchanged, only in view mode) */}
      {!editing && showStats(pos) && (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['season', 'career'] as const).map(v => (
              <button key={v} onClick={() => setStatsView(v)} style={{
                padding: '5px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: statsView === v ? '#4FC3F7' : T.bgCard,
                color: statsView === v ? '#000' : T.textSecondary,
                fontWeight: statsView === v ? 'bold' : 'normal', fontSize: 12,
              }}>
                {v === 'season' ? 'This Season' : 'Career'}
              </button>
            ))}
          </div>

          {statsView === 'season' && (
            <>
              {!playerStats ? (
                <div style={{ color: T.textSecondary, fontSize: 12 }}>Loading...</div>
              ) : playerStats.games === 0 ? (
                <div style={{ color: T.textSecondary, fontSize: 12 }}>No stats this season</div>
              ) : (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {pos === 'QB' && <>
                    <StatBox label="YDS" value={playerStats.pass_yards} />
                    <StatBox label="TD" value={playerStats.pass_tds} />
                    <StatBox label="INT" value={playerStats.interceptions} />
                    <StatBox label="CMP%" value={playerStats.pass_attempts > 0 ? `${Math.round((playerStats.completions / playerStats.pass_attempts) * 100)}%` : '—'} />
                  </>}
                  {pos === 'RB' && <>
                    <StatBox label="YDS" value={playerStats.rush_yards} />
                    <StatBox label="TD" value={playerStats.rush_tds} />
                    <StatBox label="YPC" value={playerStats.rush_attempts > 0 ? (playerStats.rush_yards / playerStats.rush_attempts).toFixed(1) : '—'} />
                    <StatBox label="REC" value={playerStats.receptions} />
                  </>}
                  {(pos === 'WR' || pos === 'TE') && <>
                    <StatBox label="REC" value={playerStats.receptions} />
                    <StatBox label="YDS" value={playerStats.rec_yards} />
                    <StatBox label="TD" value={playerStats.rec_tds} />
                    <StatBox label="TGT" value={playerStats.targets} />
                  </>}
                  {DEF_POSITIONS.includes(pos) && <>
                    <StatBox label="TKL" value={(playerStats.tackles ?? 0) + (playerStats.assisted_tackles ?? 0)} />
                    <StatBox label="SCK" value={Number(playerStats.sacks ?? 0).toFixed(1)} />
                    <StatBox label="TFL" value={playerStats.tfl ?? 0} />
                    <StatBox label="INT" value={playerStats.def_interceptions ?? 0} />
                    <StatBox label="PD" value={playerStats.pass_deflections ?? 0} />
                    <StatBox label="FF" value={playerStats.forced_fumbles ?? 0} />
                  </>}
                  {pos === 'K' && <>
                    <StatBox label="FG" value={`${playerStats.fg_made ?? 0}/${playerStats.fg_att ?? 0}`} />
                    <StatBox label="FG%" value={(playerStats.fg_att ?? 0) > 0 ? `${Math.round(((playerStats.fg_made ?? 0) / playerStats.fg_att) * 100)}%` : '—'} />
                    <StatBox label="XP" value={`${playerStats.xp_made ?? 0}/${playerStats.xp_att ?? 0}`} />
                  </>}
                </div>
              )}
            </>
          )}

          {statsView === 'career' && (
            <>
              {careerStats.length === 0 ? (
                <div style={{ color: T.textSecondary, fontSize: 12 }}>No career stats yet</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...tdStyle, color: T.textSecondary, textAlign: 'left' }}>Season</th>
                        <th style={{ ...tdStyle, color: T.textSecondary, textAlign: 'left' }}>G</th>
                        {getCareerHeaders(pos).map(h => (
                          <th key={h} style={{ ...tdStyle, color: T.textSecondary, textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {careerStats.map((s, i) => (
                        <SeasonStatsRow key={i} s={s} position={pos} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!editing && !showStats(pos) && (
        <div style={{ padding: '14px 16px', color: T.textSecondary, fontSize: 12 }}>
          Stats not tracked for this position
        </div>
      )}
    </div>
  );
}
