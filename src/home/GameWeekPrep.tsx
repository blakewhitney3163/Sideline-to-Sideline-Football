import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

const OFFENSE_PLANS = [
  { id: 'balanced',     label: 'Balanced',    icon: '⚖️',  desc: 'No adjustments — standard attack' },
  { id: 'run_heavy',    label: 'Run Heavy',   icon: '🏃',  desc: 'Commit to the ground game (+D, −O)' },
  { id: 'pass_attack',  label: 'Pass Attack', icon: '🎯',  desc: 'Air it out (+O, slight −D)' },
  { id: 'ball_control', label: 'Ball Control',icon: '🕐',  desc: 'Protect ball, limit possessions (+D, −O)' },
  { id: 'bombs_away',   label: 'Bombs Away',  icon: '💣',  desc: 'High risk/reward deep shots (+O++, −D++)' },
];

const DEFENSE_PLANS = [
  { id: 'base',      label: 'Base D',         icon: '🛡',  desc: 'Balanced — no adjustment' },
  { id: 'blitz',     label: 'Blitz',          icon: '⚡',  desc: 'Aggressive pressure (+D++, −O)' },
  { id: 'zone',      label: 'Zone',           icon: '📐',  desc: 'Prevent big plays (+D)' },
  { id: 'press_man', label: 'Press Man',      icon: '🔒',  desc: 'Disrupt receivers (+D, −O)' },
  { id: 'run_stop',  label: 'Run Stop',       icon: '🧱',  desc: 'Stack the box (+D++, −O)' },
];

const NET_LABELS: Record<string, string> = {
  balanced_base:         'No modifier',
  run_heavy_base:        'Net: slight D boost',
  pass_attack_base:      'Net: strong O boost',
  ball_control_base:     'Net: strong D, lower O',
  bombs_away_base:       'Net: boom-or-bust O++',
  balanced_blitz:        'Net: strong D pressure',
  balanced_zone:         'Net: D coverage boost',
  balanced_press_man:    'Net: slight D, slight O−',
  balanced_run_stop:     'Net: heavy D, O−',
};

interface Props {
  season: number;
  week: number;
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
    window.api.getGameplan({ season, week }).then((gp: any) => {
      if (gp?.offense) setOffense(gp.offense);
      if (gp?.defense) setDefense(gp.defense);
    });
    window.api.isOpponentScouted({ season, week }).then((v: boolean) => {
      setAlreadyScouted(v);
    });
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

  const netKey = `${offense}_${defense}`;
  const netLabel = NET_LABELS[netKey] ?? '';
  const outCount = injuredPlayers.filter((p: any) => p.injury_status === 'out' || p.injury_status === 'ir').length;
  const qCount = injuredPlayers.filter((p: any) => p.injury_status === 'questionable').length;

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.borderFaint}`,
      borderRadius: 8, padding: '14px 16px', marginBottom: 14,
    }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: T.textDim, marginBottom: 10 }}>
        WEEK {week} GAME PREP · vs. {opponentName}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>

        {/* ── Opponent Scout ─────────────────────── */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#4FC3F7', marginBottom: 8 }}>
            1. SCOUT OPPONENT
          </div>
          {!scoutData && !alreadyScouted ? (
            <button
              onClick={handleScout}
              disabled={scouting}
              style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                background: scouting ? T.bgPage : '#1a2a3a',
                border: `1px solid #4FC3F7`, borderRadius: 4,
                color: scouting ? T.textDim : '#4FC3F7', cursor: scouting ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {scouting ? 'Scouting...' : '🔍 Scout Opponent'}
            </button>
          ) : (
            <div style={{ fontSize: 10, color: '#4caf50', marginBottom: 6 }}>✓ Scouted</div>
          )}

          {scoutData && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>
                {scoutData.scheme?.offense_scheme ?? '?'} O · {scoutData.scheme?.defense_scheme ?? '?'} D
              </div>
              <div style={{ fontSize: 9, color: '#FF8740', marginBottom: 6 }}>{scoutData.tendency}</div>
              {(scoutData.topPlayers ?? []).map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: T.textDim, minWidth: 14 }}>{i + 1}.</span>
                  <span style={{ fontSize: 10, color: T.textPrimary }}>{p.first_name} {p.last_name}</span>
                  <span style={{ fontSize: 9, color: T.textMuted }}>{p.position}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: p.overall_rating >= 85 ? '#4caf50' : p.overall_rating >= 75 ? '#FF8740' : T.textMuted,
                  }}>{p.overall_rating}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Game Plan ──────────────────────────── */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#FF8740', marginBottom: 8 }}>
            2. GAME PLAN
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>OFFENSE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {OFFENSE_PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setOffense(p.id); setSaved(false); }}
                  title={p.desc}
                  style={{
                    padding: '3px 7px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                    background: offense === p.id ? '#FF8740' : T.bgPage,
                    border: `1px solid ${offense === p.id ? '#FF8740' : T.borderFaint}`,
                    color: offense === p.id ? '#000' : T.textMuted,
                    fontWeight: offense === p.id ? 700 : 400,
                  }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4 }}>DEFENSE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {DEFENSE_PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setDefense(p.id); setSaved(false); }}
                  title={p.desc}
                  style={{
                    padding: '3px 7px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                    background: defense === p.id ? '#4FC3F7' : T.bgPage,
                    border: `1px solid ${defense === p.id ? '#4FC3F7' : T.borderFaint}`,
                    color: defense === p.id ? '#000' : T.textMuted,
                    fontWeight: defense === p.id ? 700 : 400,
                  }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          {netLabel && (
            <div style={{ fontSize: 9, color: T.textDim, marginBottom: 6 }}>{netLabel}</div>
          )}

          <button
            onClick={saveGameplan}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700,
              background: saved ? '#4caf50' : '#FF8740',
              border: 'none', borderRadius: 4, cursor: 'pointer', color: '#000',
            }}
          >
            {saved ? '✓ Saved' : 'Save Plan'}
          </button>
        </div>

        {/* ── Injury Report ──────────────────────── */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#e57373', marginBottom: 8 }}>
            3. INJURY REPORT
          </div>
          {injuredPlayers.length === 0 ? (
            <div style={{ fontSize: 10, color: T.textDim }}>Everyone healthy ✓</div>
          ) : (
            <>
              {outCount > 0 && (
                <div style={{ fontSize: 9, color: '#e57373', marginBottom: 4 }}>
                  {outCount} player{outCount > 1 ? 's' : ''} OUT/IR
                </div>
              )}
              {qCount > 0 && (
                <div style={{ fontSize: 9, color: '#FF8740', marginBottom: 6 }}>
                  {qCount} questionable
                </div>
              )}
              {injuredPlayers.slice(0, 5).map((p: any) => (
                <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                    background: p.injury_status === 'ir' ? '#7f0000' : p.injury_status === 'out' ? '#4a1010' : '#4a3010',
                    color: p.injury_status === 'ir' ? '#ff6b6b' : p.injury_status === 'out' ? '#e57373' : '#FF8740',
                  }}>
                    {p.injury_status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: T.textMuted }}>{p.last_name}</span>
                  <span style={{ fontSize: 9, color: T.textDim }}>{p.position}</span>
                </div>
              ))}
              {injuredPlayers.length > 5 && (
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>
                  +{injuredPlayers.length - 5} more
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
