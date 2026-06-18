import React, { useEffect, useState } from 'react';
import { T } from '../theme';
import { SelectedPlayer, SeasonStats, CareerSeasonStats } from './types';
import { TRAIT_META, ovrColor, isQB, isRB, isWRTE, StatGroup, StatLine } from './utils';

declare const window: any;

const DEFENSE_POSITIONS = ['DL','LB','CB','S','DE','DT','MLB','OLB','ILB','FS','SS'];

interface Props {
  player: SelectedPlayer;
  currentSeason: number;
  onClose: () => void;
}

export default function PlayerCard({ player, currentSeason, onClose }: Props) {
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [careerStats, setCareerStats] = useState<CareerSeasonStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.api.getPlayerStats(player.player_id),
      window.api.getPlayerCareerStats(player.player_id),
    ]).then(([season, career]: [SeasonStats, CareerSeasonStats[]]) => {
      setSeasonStats(season ?? null);
      setCareerStats(career ?? []);
      setLoading(false);
    }).catch(() => { setSeasonStats(null); setCareerStats([]); setLoading(false); });
  }, [player.player_id]);

  const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
  const pos = player.position;
  const showPassing   = isQB(pos);
  const showRushing   = isQB(pos) || isRB(pos);
  const showReceiving = isRB(pos) || isWRTE(pos);
  const showDefense   = DEFENSE_POSITIONS.includes(pos);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8,
        padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 18 }}>{player.player_name}</div>
            <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>
              {player.position} · {player.team_name} · Age {player.age}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: ovrColor(player.overall_rating), fontWeight: 700, fontSize: 22 }}>{player.overall_rating}</div>
              <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>OVR</div>
            </div>
            {trait.label && (
              <div style={{
                color: trait.color, background: T.bgPage,
                border: `1px solid ${trait.color}`, borderRadius: 4,
                padding: '2px 6px', fontSize: 10, fontWeight: 700,
              }}>{trait.label}</div>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: T.textMuted,
              cursor: 'pointer', fontSize: 18, marginLeft: 8,
            }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: T.textMuted, fontSize: 12, padding: '20px 0' }}>Loading stats...</div>
        ) : (
          <div>
            {/* Current Season */}
            <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>
              {currentSeason} SEASON
            </div>
            {seasonStats && (
              <div>
                {showPassing && (seasonStats.pass_attempts ?? 0) > 0 && (
                  <StatGroup label="PASSING">
                    <StatLine label="Yards" value={seasonStats.pass_yards ?? 0} />
                    <StatLine label="TDs" value={seasonStats.pass_tds ?? 0} color="#4caf50" />
                    <StatLine label="INTs" value={seasonStats.interceptions ?? 0} color="#e57373" />
                    <StatLine label="Comp %" value={seasonStats.pass_attempts > 0 ? ((seasonStats.completions / seasonStats.pass_attempts) * 100).toFixed(1) + '%' : '-'} />
                  </StatGroup>
                )}
                {showRushing && (seasonStats.rush_attempts ?? 0) > 0 && (
                  <StatGroup label="RUSHING">
                    <StatLine label="Yards" value={seasonStats.rush_yards ?? 0} />
                    <StatLine label="TDs" value={seasonStats.rush_tds ?? 0} color="#4caf50" />
                    <StatLine label="YPC" value={seasonStats.rush_attempts > 0 ? ((seasonStats.rush_yards ?? 0) / seasonStats.rush_attempts).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {showReceiving && (seasonStats.targets ?? 0) > 0 && (
                  <StatGroup label="RECEIVING">
                    <StatLine label="Yards" value={seasonStats.rec_yards ?? 0} />
                    <StatLine label="TDs" value={seasonStats.rec_tds ?? 0} color="#4caf50" />
                    <StatLine label="Receptions" value={seasonStats.receptions ?? 0} />
                    <StatLine label="YPR" value={seasonStats.receptions > 0 ? ((seasonStats.rec_yards ?? 0) / seasonStats.receptions).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {showDefense && ((seasonStats.tackles ?? 0) + (seasonStats.assisted_tackles ?? 0) > 0 || (seasonStats.sacks ?? 0) > 0) && (
                  <StatGroup label="DEFENSE">
                    <StatLine label="Solo Tackles" value={seasonStats.tackles ?? 0} />
                    <StatLine label="Assisted" value={seasonStats.assisted_tackles ?? 0} />
                    <StatLine label="Total" value={(seasonStats.tackles ?? 0) + (seasonStats.assisted_tackles ?? 0)} />
                    <StatLine label="Sacks" value={Number(seasonStats.sacks ?? 0).toFixed(1)} color="#FF8740" />
                    <StatLine label="TFL" value={seasonStats.tfl ?? 0} />
                    <StatLine label="INTs" value={seasonStats.def_interceptions ?? 0} color="#4FC3F7" />
                    <StatLine label="PDs" value={seasonStats.pass_deflections ?? 0} />
                  </StatGroup>
                )}
                {(seasonStats.pass_attempts ?? 0) === 0 &&
                 (seasonStats.rush_attempts ?? 0) === 0 &&
                 (seasonStats.targets ?? 0) === 0 &&
                 !showDefense && (
                  <div style={{ color: T.textMuted, fontSize: 12 }}>No stats recorded this season.</div>
                )}
              </div>
            )}

            {/* Career Table */}
            {careerStats.length > 0 && (
              <>
                <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, margin: '16px 0 8px' }}>
                  CAREER ({careerStats.length} SEASON{careerStats.length !== 1 ? 'S' : ''})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.borderFaint}` }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: T.textDim }}>YR</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>G</th>
                        {showPassing   && <><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>PYDS</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>PTD</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>INT</th></>}
                        {showRushing   && <><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>RYDS</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>RTD</th></>}
                        {showReceiving && <><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>RECYDS</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>RECTD</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>REC</th></>}
                        {showDefense   && <><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>TOT</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>SACKS</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>TFL</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>INT</th><th style={{ textAlign: 'right', padding: '4px 6px', color: T.textDim }}>PD</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {careerStats.map((s, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.borderFaint}` }}>
                          <td style={{ padding: '4px 6px', color: T.textPrimary }}>{s.season}</td>
                          <td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.games ?? 0}</td>
                          {showPassing   && <><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.pass_yards ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.pass_tds ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.interceptions ?? 0}</td></>}
                          {showRushing   && <><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.rush_yards ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.rush_tds ?? 0}</td></>}
                          {showReceiving && <><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.rec_yards ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.rec_tds ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.receptions ?? 0}</td></>}
                          {showDefense   && <><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{(s.tackles ?? 0) + (s.assisted_tackles ?? 0)}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{Number(s.sacks ?? 0).toFixed(1)}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.tfl ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.def_interceptions ?? 0}</td><td style={{ textAlign: 'right', padding: '4px 6px', color: T.textMuted }}>{s.pass_deflections ?? 0}</td></>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
