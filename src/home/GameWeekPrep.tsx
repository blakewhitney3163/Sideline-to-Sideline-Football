import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

const OFFENSE_PLANS = [
  { id: 'balanced',     label: 'Balanced',     desc: 'No modifiers' },
  { id: 'run_heavy',    label: 'Run Heavy',    desc: '+D, −O' },
  { id: 'pass_attack',  label: 'Pass Attack',  desc: '+O, slight −D' },
  { id: 'ball_control', label: 'Ball Control', desc: '+D, −O' },
  { id: 'bombs_away',   label: 'Bombs Away',   desc: '+O++, −D++ (risky)' },
];

const DEFENSE_PLANS = [
  { id: 'base',      label: 'Base D',    desc: 'No adjustment' },
  { id: 'blitz',     label: 'Blitz',     desc: '+D++, −O' },
  { id: 'zone',      label: 'Zone',      desc: '+D coverage' },
  { id: 'press_man', label: 'Press Man', desc: '+D, slight −O' },
  { id: 'run_stop',  label: 'Run Stop',  desc: '+D vs run, −O' },
];

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
  const [planSaved, setPlanSaved] = useState(false);
  const [scoutData, setScoutData] = useState<any>(null);
  const [scouting, setScouting] = useState(false);
  const [alreadyScouted, setAlreadyScouted] = useState(false);
  const [expanded, setExpanded] = useState<'plan' | 'scout' | null>(null);

  useEffect(() => {
    if (!season || !week) return;
    window.api.getGameplan({ season, week }).then((gp: any) => {
      if (gp?.offense) { setOffense(gp.offense); setPlanSaved(true); }
      if (gp?.defense) setDefense(gp.defense);
    });
    window.api.isOpponentScouted({ season, week }).then((v: boolean) => setAlreadyScouted(v));
  }, [season, week]);

  const saveGameplan = async () => {
    await window.api.setGameplan({ season, week, offense, defense });
    setSaved(true);
    setPlanSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setExpanded(null);
  };

  const handleScout = async () => {
    setScouting(true);
    const data = await window.api.scoutOpponent({ opponentTeamId, season, week });
    setScoutData(data);
    setAlreadyScouted(true);
    setScouting(false);
    setExpanded('scout');
  };

  const outCount = injuredPlayers.filter((p: any) => p.injury_status === 'out' || p.injury_status === 'ir').length;
  const qCount = injuredPlayers.filter((p: any) => p.injury_status === 'questionable').length;
  const offLabel = OFFENSE_PLANS.find(p => p.id === offense)?.label ?? offense;
  const defLabel = DEFENSE_PLANS.find(p => p.id === defense)?.label ?? defense;

  const CheckRow = ({ done, label, action, onAction, open, onToggle }: {
    done: boolean; label: React.ReactNode; action?: string;
    onAction?: () => void; open?: boolean; onToggle?: () => void;
  }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}`,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#0a2a0a' : '#1a1a1a',
        border: `1px solid ${done ? '#4caf50' : '#333'}`,
        fontSize: 10, color: done ? '#4caf50' : '#444',
      }}>
        {done ? '✓' : '○'}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: done ? '#aaa' : '#ccc' }}>{label}</span>
      {onToggle && (
        <button onClick={onToggle} style={{
          fontSize: 10, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
          background: 'none', border: `1px solid ${open ? '#FF8740' : '#333'}`,
          color: open ? '#FF8740' : '#555',
        }}>
          {open ? '▲ close' : '▼ edit'}
        </button>
      )}
      {action && onAction && (
        <button onClick={onAction} style={{
          fontSize: 10, padding: '2px 10px', cursor: 'pointer', borderRadius: 3,
          background: '#0a1a2a', border: '1px solid #4FC3F7', color: '#4FC3F7',
        }}>
          {action}
        </button>
      )}
    </div>
  );

  return (
    <div style={{ fontSize: 12, marginBottom: 12 }}>

      {/* Weekly checklist header */}
      <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 10, textTransform: 'uppercase' }}>
        Week {week} Prep Checklist
      </div>

      {/* Checklist items */}
      <CheckRow
        done={planSaved}
        label={planSaved
          ? <><span style={{ color: '#4caf50' }}>Game Plan Set</span> · <span style={{ color: '#888', fontSize: 11 }}>{offLabel} / {defLabel}</span></>
          : 'Set Game Plan'}
        onToggle={() => setExpanded(expanded === 'plan' ? null : 'plan')}
        open={expanded === 'plan'}
      />

      {/* Game Plan inline editor */}
      {expanded === 'plan' && (
        <div style={{ padding: '10px 0 4px 28px' }}>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginBottom: 6 }}>OFFENSE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {OFFENSE_PLANS.map(p => (
              <button key={p.id} onClick={() => { setOffense(p.id); setSaved(false); }} style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                background: offense === p.id ? '#2a1200' : '#141414',
                border: `1px solid ${offense === p.id ? '#FF8740' : '#222'}`,
                color: offense === p.id ? '#FF8740' : '#555',
                fontWeight: offense === p.id ? 'bold' : 'normal',
              }}>
                {p.label} <span style={{ fontSize: 9, opacity: 0.7 }}>{p.desc}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginBottom: 6 }}>DEFENSE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {DEFENSE_PLANS.map(p => (
              <button key={p.id} onClick={() => { setDefense(p.id); setSaved(false); }} style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                background: defense === p.id ? '#0a1a2a' : '#141414',
                border: `1px solid ${defense === p.id ? '#4FC3F7' : '#222'}`,
                color: defense === p.id ? '#4FC3F7' : '#555',
                fontWeight: defense === p.id ? 'bold' : 'normal',
              }}>
                {p.label} <span style={{ fontSize: 9, opacity: 0.7 }}>{p.desc}</span>
              </button>
            ))}
          </div>
          <button onClick={saveGameplan} style={{
            padding: '6px 20px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
            background: '#0a1a2a', border: '1px solid #4FC3F7', color: '#4FC3F7', fontWeight: 700,
          }}>
            {saved ? '✓ Saved' : 'Save Plan'}
          </button>
        </div>
      )}

      <CheckRow
        done={alreadyScouted}
        label={alreadyScouted ? <><span style={{ color: '#4caf50' }}>Opponent Scouted</span> · <span style={{ color: '#888', fontSize: 11 }}>{opponentName}</span></> : `Scout ${opponentName}`}
        action={alreadyScouted ? undefined : (scouting ? 'Scouting...' : 'Scout Now')}
        onAction={alreadyScouted ? undefined : handleScout}
        onToggle={alreadyScouted ? () => setExpanded(expanded === 'scout' ? null : 'scout') : undefined}
        open={expanded === 'scout'}
      />

      {/* Scout results inline */}
      {expanded === 'scout' && scoutData && (
        <div style={{ padding: '10px 0 4px 28px' }}>
          {scoutData.scoutLevel === 'basic' && (
            <div style={{ fontSize: 10, color: '#FF8740', marginBottom: 8, padding: '4px 8px', background: '#1a0e00', borderRadius: 3 }}>
              No scouts on staff — only scheme info available. Hire scouts in Coaching Staff.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888' }}>OFF: <span style={{ color: '#aaa' }}>{scoutData.scheme?.offense_scheme ?? '?'}</span></span>
            <span style={{ fontSize: 11, color: '#888' }}>DEF: <span style={{ color: '#aaa' }}>{scoutData.scheme?.defense_scheme ?? '?'}</span></span>
            {scoutData.tendency && <span style={{ fontSize: 11, color: '#888' }}>{scoutData.tendency}</span>}
          </div>
          {scoutData.topPlayers?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 1, marginBottom: 4 }}>KEY PLAYERS</div>
              {scoutData.topPlayers.map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', borderBottom: `1px solid ${T.borderFaint}`, fontSize: 11 }}>
                  <span style={{ width: 32, fontWeight: 800, color: '#FF8740', fontFamily: 'monospace' }}>{p.overall_rating}</span>
                  <span style={{ flex: 1, color: '#ccc' }}>{p.first_name} {p.last_name}</span>
                  <span style={{ color: '#555', fontSize: 10 }}>{p.position}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CheckRow
        done={outCount === 0 && qCount === 0}
        label={
          outCount > 0 || qCount > 0
            ? <><span style={{ color: '#FF8740' }}>Injuries</span> · <span style={{ fontSize: 11, color: '#888' }}>{outCount > 0 ? `${outCount} OUT/IR` : ''}{outCount > 0 && qCount > 0 ? ', ' : ''}{qCount > 0 ? `${qCount} Q` : ''}</span></>
            : <span style={{ color: '#666' }}>No injuries to report</span>
        }
      />

    </div>
  );
}
