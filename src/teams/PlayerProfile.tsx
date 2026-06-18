import React from 'react';
import { T } from '../theme';
import { Player, PlayerStats, CareerSeasonStats } from './types';
import { getRatingCols, getOvrColor, attrColor, DEF_POSITIONS, showStats, getCareerHeaders } from './teamsUtils';

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 15 }}>{value ?? '—'}</div>
      <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function SeasonStatsRow({ s, position }: { s: CareerSeasonStats; position: string }) {
  if (DEF_POSITIONS.includes(position)) {
    return (
      <tr>
        <td>{s.season}</td><td>{s.games}</td>
        <td>{(s.tackles ?? 0) + (s.assisted_tackles ?? 0)}</td>
        <td>{Number(s.sacks ?? 0).toFixed(1)}</td>
        <td>{s.tfl ?? 0}</td>
        <td>{s.def_interceptions ?? 0}</td>
        <td>{s.pass_deflections ?? 0}</td>
      </tr>
    );
  }
  if (position === 'QB') {
    return (
      <tr>
        <td>{s.season}</td><td>{s.games}</td>
        <td>{s.pass_yards}</td><td>{s.pass_tds}</td><td>{s.interceptions}</td>
        <td>{s.pass_attempts > 0 ? `${Math.round((s.completions / s.pass_attempts) * 100)}%` : '—'}</td>
      </tr>
    );
  }
  if (position === 'RB') {
    return (
      <tr>
        <td>{s.season}</td><td>{s.games}</td>
        <td>{s.rush_yards}</td><td>{s.rush_tds}</td>
        <td>{s.rush_attempts > 0 ? (s.rush_yards / s.rush_attempts).toFixed(1) : '—'}</td>
        <td>{s.receptions} / {s.rec_yards}</td>
      </tr>
    );
  }
  if (position === 'K') {
    const fgPct = (s.fg_att ?? 0) > 0 ? `${Math.round(((s.fg_made ?? 0) / s.fg_att) * 100)}%` : '—';
    return (
      <tr>
        <td>{s.season}</td><td>{s.games}</td>
        <td>{s.fg_made ?? 0}/{s.fg_att ?? 0}</td>
        <td>{fgPct}</td>
        <td>{s.xp_made ?? 0}/{s.xp_att ?? 0}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{s.season}</td><td>{s.games}</td>
      <td>{s.rec_yards}</td><td>{s.rec_tds}</td>
      <td>{s.receptions}/{s.targets}</td>
      <td>{s.targets > 0 ? `${Math.round((s.receptions / s.targets) * 100)}%` : '—'}</td>
    </tr>
  );
}

interface Props {
  player: Player;
  playerStats: PlayerStats | null;
  careerStats: CareerSeasonStats[];
  statsView: 'season' | 'career';
  setStatsView: (v: 'season' | 'career') => void;
  onClose: () => void;
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px', borderBottom: '1px solid #1a1a1a', fontSize: 12, color: T.textSecondary,
};

export default function PlayerProfile({ player, playerStats, careerStats, statsView, setStatsView, onClose }: Props) {
  const pos = player.position_label || player.position;
  const attrCols = getRatingCols(pos);

  return (
    <div style={{
      width: 280, flexShrink: 0, borderLeft: `1px solid ${T.borderFaint}`,
      padding: '16px', overflowY: 'auto', background: T.bgPanel,
    }}>
      <button onClick={onClose} style={{
        float: 'right', background: 'none', border: 'none',
        color: T.textSecondary, cursor: 'pointer', fontSize: '20px', lineHeight: 1,
      }}>✕</button>

      {/* Name + ratings */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
          {player.first_name} {player.last_name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: T.textDim, fontSize: 12, background: T.bgCard, padding: '2px 8px', borderRadius: 4 }}>
            {pos}
          </span>
          <span style={{ color: T.textMuted, fontSize: 12 }}>Age {player.age}</span>
          <span style={{ color: getOvrColor(player.overall_rating), fontWeight: 700, fontSize: 14 }}>
            {player.overall_rating} OVR
          </span>
        </div>
      </div>

      {/* Attributes */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>ATTRIBUTES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {attrCols.map(col => (
            <div key={col.label} style={{ textAlign: 'center', minWidth: 44 }}>
              <div style={{ color: attrColor((player[col.key] as number) ?? 0), fontWeight: 700, fontSize: 16 }}>
                {(player[col.key] as number) ?? '—'}
              </div>
              <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>{col.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      {showStats(pos) && (
        <div>
          {/* Toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['season', 'career'] as const).map(v => (
              <button key={v} onClick={() => setStatsView(v)} style={{
                padding: '5px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                background: statsView === v ? '#4FC3F7' : T.bgCard,
                color: statsView === v ? '#000' : T.textSecondary,
                fontWeight: statsView === v ? 'bold' : 'normal', fontSize: '12px',
              }}>
                {v === 'season' ? 'This Season' : 'Career'}
              </button>
            ))}
          </div>

          {/* Season stats */}
          {statsView === 'season' && (
            <>
              {!playerStats ? (
                <div style={{ color: T.textDim, fontSize: 12 }}>Loading...</div>
              ) : playerStats.games === 0 ? (
                <div style={{ color: T.textDim, fontSize: 12 }}>No stats this season</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px' }}>
                  {pos === 'QB' && <>
                    <StatBox label="G" value={playerStats.games} />
                    <StatBox label="PASS YDS" value={playerStats.pass_yards} />
                    <StatBox label="PASS TDs" value={playerStats.pass_tds} />
                    <StatBox label="INT" value={playerStats.interceptions} />
                    <StatBox label="CMP%" value={playerStats.pass_attempts > 0 ? `${Math.round((playerStats.completions / playerStats.pass_attempts) * 100)}%` : '—'} />
                  </>}
                  {pos === 'RB' && <>
                    <StatBox label="G" value={playerStats.games} />
                    <StatBox label="RUSH YDS" value={playerStats.rush_yards} />
                    <StatBox label="RUSH TDs" value={playerStats.rush_tds} />
                    <StatBox label="YPC" value={playerStats.rush_attempts > 0 ? (playerStats.rush_yards / playerStats.rush_attempts).toFixed(1) : '—'} />
                    <StatBox label="REC" value={playerStats.receptions} />
                  </>}
                  {(pos === 'WR' || pos === 'TE') && <>
                    <StatBox label="G" value={playerStats.games} />
                    <StatBox label="REC YDS" value={playerStats.rec_yards} />
                    <StatBox label="REC TDs" value={playerStats.rec_tds} />
                    <StatBox label="REC" value={playerStats.receptions} />
                    <StatBox label="CTH%" value={playerStats.targets > 0 ? `${Math.round((playerStats.receptions / playerStats.targets) * 100)}%` : '—'} />
                  </>}
                  {DEF_POSITIONS.includes(pos) && <>
                    <StatBox label="G" value={playerStats.games} />
                    <StatBox label="TACKLES" value={(playerStats.tackles ?? 0) + (playerStats.assisted_tackles ?? 0)} />
                    <StatBox label="SACKS" value={Number(playerStats.sacks ?? 0).toFixed(1)} />
                    <StatBox label="TFL" value={playerStats.tfl} />
                    <StatBox label="INT" value={playerStats.def_interceptions} />
                    <StatBox label="PD" value={playerStats.pass_deflections} />
                    <StatBox label="FF" value={playerStats.forced_fumbles} />
                  </>}
                  {pos === 'K' && <>
                    <StatBox label="G" value={playerStats.games} />
                    <StatBox label="FGM" value={playerStats.fg_made ?? 0} />
                    <StatBox label="FGA" value={playerStats.fg_att ?? 0} />
                    <StatBox label="FG%" value={(playerStats.fg_att ?? 0) > 0 ? `${Math.round(((playerStats.fg_made ?? 0) / playerStats.fg_att) * 100)}%` : '—'} />
                    <StatBox label="XPM" value={playerStats.xp_made ?? 0} />
                    <StatBox label="XPA" value={playerStats.xp_att ?? 0} />
                  </>}
                </div>
              )}
            </>
          )}

          {/* Career stats */}
          {statsView === 'career' && (
            <>
              {careerStats.length === 0 ? (
                <div style={{ color: T.textDim, fontSize: 12 }}>No career stats yet</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {getCareerHeaders(pos).map(h => (
                          <th key={h} style={{ ...tdStyle, color: T.textDim, fontWeight: 700, fontSize: 9, letterSpacing: 1 }}>{h}</th>
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

      {!showStats(pos) && (
        <div style={{ color: T.textDim, fontSize: 12 }}>Stats not tracked for this position</div>
      )}
    </div>
  );
}
