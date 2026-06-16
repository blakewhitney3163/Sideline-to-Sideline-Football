import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: number;
  city: string;
  name: string;
  conference: string;
  division: string;
  wins: number;
  losses: number;
}

interface Props {
  currentSeason: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIVISION_ORDER = ['East', 'North', 'South', 'West'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(w: number, l: number): string {
  const g = w + l;
  return g === 0 ? '.000' : (w / g).toFixed(3);
}

function gb(leaderW: number, leaderL: number, w: number, l: number): string {
  const diff = (leaderW - w + l - leaderL) / 2;
  return diff === 0 ? '—' : diff.toFixed(1);
}

function getPlayoffSeeds(teams: Team[], conf: string): Team[] {
  const confTeams = teams.filter(t => t.conference === conf);
  const divs = [...new Set(confTeams.map(t => t.division))];

  const divWinners: Team[] = divs.map(div => {
    const divTeams = confTeams
      .filter(t => t.division === div)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return divTeams[0];
  }).filter(Boolean).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  const divWinnerIds = new Set(divWinners.map(t => t.id));
  const wildcards = confTeams
    .filter(t => !divWinnerIds.has(t.id))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .slice(0, 3);

  return [...divWinners, ...wildcards];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DivisionBlock({
  conf,
  division,
  teams,
  userTeamId,
  playoffIds,
}: {
  conf: string;
  division: string;
  teams: Team[];
  userTeamId?: number;
  playoffIds: Set<number>;
}) {
  const sorted = [...teams].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const leader = sorted[0];

  return (
    <div style={{ background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '8px 14px', background: T.bgPage, borderBottom: `1px solid ${T.borderFaint}` }}>
        <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 2 }}>{conf.toUpperCase()} {division.toUpperCase()}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 9, color: T.borderStrong, textAlign: 'right', letterSpacing: 1 }}>
            <th style={{ padding: '6px 14px', textAlign: 'left', fontWeight: 'normal' }}>TEAM</th>
            <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>W</th>
            <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>L</th>
            <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>PCT</th>
            <th style={{ padding: '6px 14px', fontWeight: 'normal' }}>GB</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const isUser     = team.id === userTeamId;
            const inPlayoffs = playoffIds.has(team.id);
            const isLeader   = i === 0;
            return (
              <tr key={team.id} style={{
                borderTop: `1px solid ${T.bgPanel}`,
                background: isUser ? T.bgGreen : 'transparent',
              }}>
                <td style={{ padding: '8px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {inPlayoffs && (
                      <span style={{
                        fontSize: 8,
                        color: isLeader ? '#FF8740' : '#4FC3F7',
                        border: `1px solid ${isLeader ? '#FF8740' : '#4FC3F7'}`,
                        borderRadius: 2, padding: '0px 3px', minWidth: 14, textAlign: 'center',
                      }}>
                        {isLeader ? 'DIV' : 'WC'}
                      </span>
                    )}
                    <span style={{
                      fontSize: 12,
                      color: isUser ? '#4caf50' : isLeader ? '#fff' : T.textMuted,
                      fontWeight: isLeader ? 'bold' : 'normal',
                    }}>
                      {team.city} {team.name}
                      {isUser && <span style={{ fontSize: 9, color: '#4caf50', marginLeft: 6 }}>◆</span>}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold', fontSize: 12 }}>{team.wins}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: T.textMuted, fontSize: 12 }}>{team.losses}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: T.textDim, fontSize: 11 }}>{pct(team.wins, team.losses)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: T.borderStrong, fontSize: 11 }}>
                  {leader ? gb(leader.wins, leader.losses, team.wins, team.losses) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayoffSeedPanel({ seeds, conf }: { seeds: Team[]; conf: string }) {
  return (
    <div style={{ background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '8px 14px', background: T.bgPage, borderBottom: `1px solid ${T.borderFaint}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 2 }}>{conf} PLAYOFF PICTURE</span>
        <span style={{ fontSize: 9, color: T.borderMid }}>TOP 7</span>
      </div>
      {seeds.length === 0 && (
        <div style={{ padding: '12px 14px', fontSize: 11, color: T.borderStrong }}>Simulate games to see seedings</div>
      )}
      {seeds.map((team, i) => {
        const isDivWinner = i < 4;
        const hasBye      = i === 0;
        return (
          <div key={team.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 14px',
            borderTop: i === 4 ? `1px dashed ${T.borderFaint}` : `1px solid ${T.bgPanel}`,
            background: hasBye ? '#0f1a0a' : 'transparent',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 'bold', width: 18, textAlign: 'center',
              color: isDivWinner ? '#FF8740' : '#4FC3F7',
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 11, color: T.textMuted }}>
              {team.city} {team.name}
            </span>
            <span style={{ fontSize: 11, color: T.textMuted }}>{team.wins}-{team.losses}</span>
            {hasBye && <span style={{ fontSize: 8, color: '#4caf50', letterSpacing: 1 }}>BYE</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Standings ────────────────────────────────────────────────────────────────

export default function Standings({ currentSeason }: Props) {
  const [standings,        setStandings]        = useState<Team[]>([]);
  const [viewSeason,       setViewSeason]       = useState<number>(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [userTeamId,       setUserTeamId]       = useState<number | undefined>();
  const [view,             setView]             = useState<'division' | 'conference'>('division');

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
    window.api.getUserTeam().then((t: any) => { if (t) setUserTeamId(t.id); });
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);

  useEffect(() => {
    window.api.getStandings(viewSeason).then((data: Team[]) => setStandings(data));
  }, [viewSeason]);

  const afcSeeds  = getPlayoffSeeds(standings, 'AFC');
  const nfcSeeds  = getPlayoffSeeds(standings, 'NFC');
  const playoffIds = new Set([...afcSeeds, ...nfcSeeds].map(t => t.id));

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: T.textPrimary, background: T.bgPage, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{viewSeason} Standings</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 4, overflow: 'hidden' }}>
            {(['division', 'conference'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 14px',
                background: view === v ? T.bgGreen : 'transparent',
                border: 'none',
                color: view === v ? '#4caf50' : T.textDim,
                cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                fontWeight: view === v ? 'bold' : 'normal',
              }}>
                {v === 'division' ? 'By Division' : 'By Conference'}
              </button>
            ))}
          </div>
          {availableSeasons.length > 1 && (
            <select
              value={viewSeason}
              onChange={e => setViewSeason(Number(e.target.value))}
              style={{
                background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`,
                borderRadius: 4, padding: '5px 12px', fontSize: 11,
                cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {availableSeasons.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {view === 'division' ? (
        /* ── Division View ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: 24 }}>

          {/* AFC */}
          <div>
            <div style={{ fontSize: 10, color: '#FF8740', letterSpacing: 2, marginBottom: 12 }}>AFC</div>
            {DIVISION_ORDER.map(div => {
              const divTeams = standings.filter(t => t.conference === 'AFC' && t.division === div);
              if (divTeams.length === 0) return null;
              return (
                <DivisionBlock
                  key={div}
                  conf="AFC"
                  division={div}
                  teams={divTeams}
                  userTeamId={userTeamId}
                  playoffIds={playoffIds}
                />
              );
            })}
          </div>

          {/* NFC */}
          <div>
            <div style={{ fontSize: 10, color: '#4FC3F7', letterSpacing: 2, marginBottom: 12 }}>NFC</div>
            {DIVISION_ORDER.map(div => {
              const divTeams = standings.filter(t => t.conference === 'NFC' && t.division === div);
              if (divTeams.length === 0) return null;
              return (
                <DivisionBlock
                  key={div}
                  conf="NFC"
                  division={div}
                  teams={divTeams}
                  userTeamId={userTeamId}
                  playoffIds={playoffIds}
                />
              );
            })}
          </div>

          {/* Playoff Picture */}
          <div>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 12 }}>PLAYOFF PICTURE</div>
            <PlayoffSeedPanel seeds={afcSeeds} conf="AFC" />
            <PlayoffSeedPanel seeds={nfcSeeds} conf="NFC" />
            <div style={{ fontSize: 9, color: T.borderMid, lineHeight: 1.8, marginTop: 8 }}>
              <div>■ Orange = division winner (seeds 1–4)</div>
              <div>■ Blue = wildcard (seeds 5–7)</div>
              <div>■ Seed 1 receives bye week</div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Conference View ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {(['AFC', 'NFC'] as const).map(conf => {
            const seeds     = conf === 'AFC' ? afcSeeds : nfcSeeds;
            const confTeams = standings
              .filter(t => t.conference === conf)
              .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
            return (
              <div key={conf}>
                <div style={{ fontSize: 10, color: conf === 'AFC' ? '#FF8740' : '#4FC3F7', letterSpacing: 2, marginBottom: 12 }}>{conf}</div>
                <div style={{ background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 6, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 9, color: T.borderStrong, textAlign: 'right', letterSpacing: 1, borderBottom: `1px solid ${T.borderFaint}` }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left', fontWeight: 'normal' }}>TEAM</th>
                        <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>W</th>
                        <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>L</th>
                        <th style={{ padding: '6px 10px', fontWeight: 'normal' }}>PCT</th>
                        <th style={{ padding: '6px 14px', fontWeight: 'normal', textAlign: 'left' }}>DIV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confTeams.map((team, i) => {
                        const seedNum = seeds.findIndex(s => s.id === team.id) + 1;
                        const isDivWinner = seedNum >= 1 && seedNum <= 4;
                        return (
                          <tr key={team.id} style={{
                            borderTop: `1px solid ${T.bgPanel}`,
                            background: team.id === userTeamId ? T.bgGreen : 'transparent',
                          }}>
                            <td style={{ padding: '8px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {seedNum > 0 && (
                                  <span style={{
                                    fontSize: 9, width: 14, textAlign: 'center',
                                    color: isDivWinner ? '#FF8740' : '#4FC3F7',
                                  }}>{seedNum}</span>
                                )}
                                <span style={{
                                  fontSize: 12,
                                  color: team.id === userTeamId ? '#4caf50' : i < 7 ? T.textPrimary : T.textDim,
                                }}>
                                  {team.city} {team.name}
                                  {team.id === userTeamId && <span style={{ fontSize: 9, color: '#4caf50', marginLeft: 6 }}>◆</span>}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold', fontSize: 12 }}>{team.wins}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: T.textMuted, fontSize: 12 }}>{team.losses}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: T.textDim, fontSize: 11 }}>{pct(team.wins, team.losses)}</td>
                            <td style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: T.borderStrong }}>{team.division}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: '5px 14px', borderTop: `1px dashed ${T.borderFaint}`, fontSize: 9, color: '#252525' }}>
                    — playoff cutline (after seed 7) —
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}