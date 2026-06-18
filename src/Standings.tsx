import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Team } from './standings/types';
import { DIVISION_ORDER, pct, getPlayoffSeeds } from './standings/standingsUtils';
import DivisionBlock from './standings/DivisionBlock';
import PlayoffSeedPanel from './standings/PlayoffSeedPanel';
import { useGameStore } from './store/gameStore';

declare const window: any;

export default function Standings() {
  const { currentSeason } = useGameStore();
  const [standings, setStandings] = useState<Team[]>([]);
  const [viewSeason, setViewSeason] = useState(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [userTeamId, setUserTeamId] = useState<number | undefined>();
  const [view, setView] = useState<'division' | 'conference'>('division');

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
    window.api.getUserTeam().then((t: any) => { if (t) setUserTeamId(t.id); });
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);

  useEffect(() => {
    window.api.getStandings(viewSeason).then((data: Team[]) => setStandings(data));
  }, [viewSeason]);

  const afcSeeds = getPlayoffSeeds(standings, 'AFC');
  const nfcSeeds = getPlayoffSeeds(standings, 'NFC');
  const playoffIds = new Set([...afcSeeds, ...nfcSeeds].map(t => t.id));

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary }}>{viewSeason} Standings</div>
        <div style={{ display: 'flex', gap: 4, background: T.bgCard, borderRadius: 5, padding: 3 }}>
          {(['division', 'conference'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px',
              background: view === v ? T.bgGreen : 'transparent', border: 'none',
              color: view === v ? '#4caf50' : T.textDim,
              cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
              fontWeight: view === v ? 'bold' : 'normal',
            }}>
              {v === 'division' ? 'By Division' : 'By Conference'}
            </button>
          ))}
        </div>
        {availableSeasons.length > 1 && (
          <select onChange={e => setViewSeason(Number(e.target.value))} value={viewSeason} style={{
            background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`,
            borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {view === 'division' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            {(['AFC', 'NFC'] as const).map(conf => (
              <div key={conf}>
                <div style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>{conf}</div>
                {DIVISION_ORDER.map(div => {
                  const divTeams = standings.filter(t => t.conference === conf && t.division === div);
                  if (divTeams.length === 0) return null;
                  return (
                    <DivisionBlock
                      key={div}
                      conf={conf}
                      division={div}
                      teams={divTeams}
                      playoffIds={playoffIds}
                      userTeamId={userTeamId}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>PLAYOFF PICTURE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <PlayoffSeedPanel conf="AFC" seeds={afcSeeds} />
              <PlayoffSeedPanel conf="NFC" seeds={nfcSeeds} />
            </div>
            <div style={{ color: T.textDim, fontSize: 10, marginTop: 10 }}>
              ■ Orange = division winner (seeds 1–4) &nbsp; ■ Blue = wildcard (seeds 5–7) &nbsp; ■ Seed 1 receives bye week
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {(['AFC', 'NFC'] as const).map(conf => {
            const seeds = conf === 'AFC' ? afcSeeds : nfcSeeds;
            const confTeams = standings
              .filter(t => t.conference === conf)
              .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
            const cutlineIdx = 7;
            return (
              <div key={conf}>
                <div style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>{conf}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['', 'TEAM', 'W', 'L', 'PCT', 'DIV'].map(h => (
                        <th key={h} style={{ padding: '4px 8px', fontSize: 9, color: T.textDim, letterSpacing: 1, fontWeight: 700, textAlign: h === 'TEAM' ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {confTeams.map((team, i) => {
                      const seedNum = seeds.findIndex(s => s.id === team.id) + 1;
                      const isDivWinner = seedNum >= 1 && seedNum <= 4;
                      const isUser = team.id === userTeamId;
                      const isCutline = i === cutlineIdx;
                      return (
                        <React.Fragment key={team.id}>
                          {isCutline && (
                            <tr><td colSpan={6} style={{ padding: '2px 8px', fontSize: 9, color: T.textDim, borderTop: `1px dashed ${T.borderMid}`, textAlign: 'center' }}>— playoff cutline (after seed 7) —</td></tr>
                          )}
                          <tr style={{ borderTop: `1px solid ${T.borderFaint}` }}>
                            <td style={{ padding: '5px 8px', width: 24 }}>
                              {seedNum > 0 && <span style={{ fontSize: 10, color: isDivWinner ? '#FF8740' : '#4FC3F7', fontWeight: 700 }}>{seedNum}</span>}
                            </td>
                            <td style={{ padding: '5px 8px', color: isUser ? '#FFD700' : T.textPrimary, fontWeight: isUser ? 700 : 400 }}>
                              {team.city} {team.name}
                              {isUser && <span style={{ marginLeft: 4, fontSize: 9, color: '#FFD700' }}>◆</span>}
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: T.textMuted }}>{team.wins}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: T.textMuted }}>{team.losses}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: T.textMuted }}>{pct(team.wins, team.losses)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: T.textDim, fontSize: 10 }}>{team.division}</td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
