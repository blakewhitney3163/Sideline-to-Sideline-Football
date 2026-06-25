import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

const OFFENSE_PLANS = [
  { id: 'balanced',     label: 'Balanced',      desc: 'Standard — no modifiers' },
  { id: 'run_heavy',    label: 'Run Heavy',      desc: '+D, −O' },
  { id: 'pass_attack',  label: 'Pass Attack',    desc: '+O, slight −D' },
  { id: 'ball_control', label: 'Ball Control',   desc: '+D, −O' },
  { id: 'bombs_away',   label: 'Bombs Away',     desc: '+O++, −D++ (risky)' },
];

const DEFENSE_PLANS = [
  { id: 'base',      label: 'Base D',    desc: 'No adjustment' },
  { id: 'blitz',     label: 'Blitz',     desc: '+D++, −O' },
  { id: 'zone',      label: 'Zone',      desc: '+D coverage' },
  { id: 'press_man', label: 'Press Man', desc: '+D, slight −O' },
  { id: 'run_stop',  label: 'Run Stop',  desc: '+D vs run, −O' },
];

const ovrColor = (v: number) => v >= 85 ? '#4caf50' : v >= 75 ? '#FF8740' : '#aaa';
const DEV_COLOR: Record<string, string> = { 'X-Factor': '#FFD700', 'Superstar': '#FF8740', 'Star': '#4FC3F7', 'Normal': '#555' };

interface Props {
  season: number;
  week: number | null;
  opponentTeamId: number;
  opponentName: string;
  injuredPlayers: any[];
}

export default function GameWeekPrep({ season, week, opponentTeamId, opponentName, injuredPlayers }: Props) {
  const [offense, setOffense] = useState('balanced');
  const [defense, setDefense] = useState('base');
  const [saved, setSaved] = useState(false);
  const [scoutData, setScoutData] = useState<any>(null);
  const [scouting, setScouting] = useState(false);
  const [alreadyScouted, setAlreadyScouted] = useState(false);

  useEffect(() => {
    if (!season || !week) return;
    window.api.getGameplan({ season, week }).then((gp: any) => {
      if (gp?.offense) setOffense(gp.offense);
      if (gp?.defense) setDefense(gp.defense);
    });
    window.api.isOpponentScouted({ season, week }).then((v: boolean) => setAlreadyScouted(v));
  }, [season, week]);

  const saveGameplan = async () => {
    await window.api.setGameplan({ season, week, offense, defense });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleScout = async () => {
    setScouting(true);
    const data = await window.api.scoutOpponent({ opponentTeamId, season, week });
    setScoutData(data);
    setAlreadyScouted(true);
    setScouting(false);
  };

  const outCount = injuredPlayers.filter((p: any) => p.injury_status === 'out' || p.injury_status === 'ir').length;
  const qCount   = injuredPlayers.filter((p: any) => p.injury_status === 'questionable').length;

  const sectionHeader = (label: string) => (
    <div style={{ fontSize: 9, letterSpacing: 2, color: T.textDim, marginBottom: 10, textTransform: 'uppercase' as const }}>
      {label}
    </div>
  );

  const pillBtn = (id: string, label: string, desc: string, active: boolean, onClick: () => void, accent: string) => (
    <button key={id} onClick={onClick} style={{
      padding: '5px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
      background: active ? `${accent}22` : '#0a0a0a',
      border: `1px solid ${active ? accent : '#222'}`,
      color: active ? accent : '#555',
      textAlign: 'left' as const,
    }}>
      <div style={{ fontWeight: active ? 700 : 400 }}>{label}</div>
      <div style={{ fontSize: 9, opacity: 0.7 }}>{desc}</div>
    </button>
  );

  return (
    <div style={{ borderBottom: `1px solid #1a1a1a`, marginBottom: 16, paddingBottom: 16 }}>

      {/* Opponent Scout */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Opponent Scout')}
        {!alreadyScouted ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleScout}
              disabled={scouting}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 700,
                background: scouting ? '#111' : '#0a1a2a',
                border: `1px solid ${scouting ? '#222' : '#4FC3F7'}`,
                borderRadius: 4, color: scouting ? '#444' : '#4FC3F7',
                cursor: scouting ? 'not-allowed' : 'pointer',
              }}
            >
              {scouting ? 'Scouting...' : `Scout ${opponentName}`}
            </button>
            <span style={{ fontSize: 10, color: '#444' }}>Reveals players, tendencies & scheme</span>
          </div>
        ) : scoutData ? (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {/* No scouts banner */}
            {scoutData.scoutLevel === 'basic' && (
              <div style={{ fontSize: 10, color: '#FF8740', background: '#1a0e00', border: '1px solid #FF874030', borderRadius: 4, padding: '5px 10px' }}>
                No scouts on staff — only scheme info available. Hire scouts in Franchise → Coaching Staff.
              </div>
            )}

            {/* Scheme + tendency */}
            <div style={{ background: '#0a0a0a', borderRadius: 4, padding: '8px 10px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#4FC3F7', background: '#0a1a2a', padding: '2px 6px', borderRadius: 3 }}>
                  OFF: {scoutData.scheme?.offense_scheme ?? '?'}
                </span>
                <span style={{ fontSize: 9, color: '#ef5350', background: '#1a0a0a', padding: '2px 6px', borderRadius: 3 }}>
                  DEF: {scoutData.scheme?.defense_scheme ?? '?'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>{scoutData.tendency}</div>
            </div>

            {/* Home/away split (Regional scout) */}
            {scoutData.homeAwaySplit && (
              <div style={{ background: '#0a0a0a', borderRadius: 4, padding: '6px 10px', display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 9, color: '#555' }}>SPLITS (same conf):</span>
                <span style={{ fontSize: 10, color: '#4caf50' }}>Home {scoutData.homeAwaySplit.homeWins}-{scoutData.homeAwaySplit.homeLosses}</span>
                <span style={{ fontSize: 10, color: '#FF8740' }}>Away {scoutData.homeAwaySplit.awayWins}-{scoutData.homeAwaySplit.awayLosses}</span>
              </div>
            )}

            {/* Top players */}
            {scoutData.topPlayers?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 4 }}>TOP PLAYERS</div>
                {scoutData.topPlayers.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid #111' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: ovrColor(p.overall_rating), minWidth: 28, fontFamily: 'monospace' }}>{p.overall_rating}</span>
                    <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{p.first_name} {p.last_name}</span>
                    <span style={{ fontSize: 9, color: '#555' }}>{p.position}</span>
                    {p.dev_trait !== 'Normal' && (
                      <span style={{ fontSize: 8, color: DEV_COLOR[p.dev_trait] ?? '#888', background: `${DEV_COLOR[p.dev_trait]}22`, padding: '1px 5px', borderRadius: 3 }}>
                        {p.dev_trait}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Offensive stats (Offense scout) */}
            {scoutData.offensiveStats?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: '#FF8740', letterSpacing: 1, marginBottom: 4 }}>OFFENSIVE STATS (season)</div>
                {scoutData.offensiveStats.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #111', fontSize: 10 }}>
                    <span style={{ color: '#ccc', flex: 1 }}>{p.name}</span>
                    <span style={{ color: '#555', minWidth: 28 }}>{p.position}</span>
                    {p.pass_yards > 0 && <span style={{ color: '#4FC3F7', fontFamily: 'monospace' }}>{p.pass_yards}py {p.pass_tds}td</span>}
                    {p.rush_yards > 0 && <span style={{ color: '#4caf50', fontFamily: 'monospace' }}>{p.rush_yards}ry</span>}
                    {p.rec_yards  > 0 && <span style={{ color: '#AB47BC', fontFamily: 'monospace' }}>{p.rec_yards}recy</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Defensive stats (Defense scout) */}
            {scoutData.defensiveStats?.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: '#ef5350', letterSpacing: 1, marginBottom: 4 }}>DEFENSIVE STATS (season)</div>
                {scoutData.defensiveStats.map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid #111', fontSize: 10 }}>
                    <span style={{ color: '#ccc', flex: 1 }}>{p.name}</span>
                    <span style={{ color: '#555', minWidth: 28 }}>{p.position}</span>
                    <span style={{ color: '#ef5350', fontFamily: 'monospace' }}>{p.tackles}tkl {p.sacks}sck</span>
                    {p.ints > 0 && <span style={{ color: '#4FC3F7', fontFamily: 'monospace' }}>{p.ints}int</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: '#4caf50' }}>✓ Scouted</span>
          </div>
        )}
      </div>

      {/* Game Plan */}
      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Game Plan')}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#555', marginBottom: 5 }}>OFFENSE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
            {OFFENSE_PLANS.map(p => pillBtn(p.id, p.label, p.desc, offense === p.id, () => { setOffense(p.id); setSaved(false); }, '#FF8740'))}
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#555', marginBottom: 5 }}>DEFENSE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
            {DEFENSE_PLANS.map(p => pillBtn(p.id, p.label, p.desc, defense === p.id, () => { setDefense(p.id); setSaved(false); }, '#4FC3F7'))}
          </div>
        </div>
        <button
          onClick={saveGameplan}
          style={{
            padding: '5px 14px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: saved ? '#0a1a0a' : '#0a0a0a',
            border: `1px solid ${saved ? '#4caf50' : '#333'}`,
            borderRadius: 4, color: saved ? '#4caf50' : '#666',
          }}
        >
          {saved ? '✓ Saved' : 'Save Plan'}
        </button>
      </div>

      {/* Injury Report */}
      {injuredPlayers.length > 0 && (
        <div>
          {sectionHeader('Injury Report')}
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            {outCount > 0 && <span style={{ fontSize: 10, color: '#e57373', background: '#1a0a0a', padding: '2px 8px', borderRadius: 3 }}>{outCount} OUT/IR</span>}
            {qCount  > 0 && <span style={{ fontSize: 10, color: '#FF8740', background: '#1a0800', padding: '2px 8px', borderRadius: 3 }}>{qCount} QUESTIONABLE</span>}
          </div>
          {injuredPlayers.slice(0, 5).map((p: any) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid #111', fontSize: 10 }}>
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, minWidth: 24, textAlign: 'center',
                background: p.injury_status === 'ir' ? '#1a0a0a' : p.injury_status === 'out' ? '#140800' : '#0a0a0a',
                color:      p.injury_status === 'ir' ? '#e57373' : p.injury_status === 'out' ? '#FF8740' : '#888',
              }}>
                {p.injury_status?.toUpperCase()}
              </span>
              <span style={{ color: '#bbb', flex: 1 }}>{p.first_name[0]}. {p.last_name}</span>
              <span style={{ color: '#555' }}>{p.position}</span>
            </div>
          ))}
          {injuredPlayers.length > 5 && <div style={{ fontSize: 9, color: '#444', marginTop: 4 }}>+{injuredPlayers.length - 5} more</div>}
        </div>
      )}
    </div>
  );
}
