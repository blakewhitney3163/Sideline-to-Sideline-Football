import React, { useEffect, useRef, useState, useCallback } from 'react';

declare const window: any;

// ─── Types (mirrored from LiveGameEngine — no import to avoid preload contamination) ──

interface LiveGameState {
  gameId: number;
  homeTeamId: number; awayTeamId: number;
  homeTeamName: string; awayTeamName: string;
  quarter: number;
  clockSeconds: number;
  possession: 'home' | 'away';
  yardLine: number;
  down: number;
  yardsToGo: number;
  homeScore: number;
  awayScore: number;
  timeouts: { home: number; away: number };
  challenges: { home: number; away: number };
  done: boolean;
  kickoffNext: boolean;
  userTeamId: number;
}

interface PlayResult {
  type: string;
  yardsGained: number;
  description: string;
  quarter: number;
  clockSeconds: number;
  playerName?: string;
  isScoring: boolean;
  homeScore: number;
  awayScore: number;
  down: number;
  yardsToGo: number;
  yardLine: number;
  possession: 'home' | 'away';
  clockUsed: number;
  firstDown?: boolean;
}

interface Props {
  gameId: number;
  userTeamId: number;
  onGameComplete: (homeScore: number, awayScore: number) => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function quarterLabel(q: number): string {
  if (q === 5) return 'OT';
  return `Q${q}`;
}

function downLabel(down: number, yardsToGo: number): string {
  const labels = ['1ST', '2ND', '3RD', '4TH'];
  return `${labels[down - 1] ?? `${down}TH`} & ${yardsToGo}`;
}

function fieldLabel(yardLine: number): string {
  if (yardLine <= 50) return `OWN ${yardLine}`;
  const opp = 100 - yardLine;
  if (opp === 0) return 'GOAL LINE';
  return `OPP ${opp}`;
}

function playTypeColor(type: string): string {
  if (['touchdown'].includes(type)) return '#FFD700';
  if (['field_goal'].includes(type)) return '#FF8740';
  if (['interception', 'fumble', 'field_goal_miss'].includes(type)) return '#e57373';
  if (['sack', 'turnover_downs'].includes(type)) return '#e57373';
  if (type === 'timeout' || type === 'challenge') return '#9b59b6';
  if (type === 'kickoff' || type === 'punt') return '#4FC3F7';
  if (type === 'pass' || type === 'run') return '#ccc';
  return '#777';
}

function playTypeIcon(type: string): string {
  if (type === 'touchdown') return '🏈 TD';
  if (type === 'field_goal') return '✅ FG';
  if (type === 'field_goal_miss') return '❌ FG';
  if (type === 'interception') return '🔄 INT';
  if (type === 'fumble') return '🔄 FUM';
  if (type === 'sack') return '💥 SACK';
  if (type === 'incomplete') return '○';
  if (type === 'pass') return '→';
  if (type === 'run') return '↑';
  if (type === 'punt') return '↟ PUNT';
  if (type === 'kickoff') return '↑ KO';
  if (type === 'timeout') return '⏱ TO';
  if (type === 'challenge') return '📋';
  if (type === 'turnover_downs') return '↩ 4DN';
  return '•';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimeoutDots({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: max }, (_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i < count ? '#FFD700' : '#2a2a2a',
          border: '1px solid #444',
        }} />
      ))}
    </div>
  );
}

function FieldStrip({ yardLine, possession, homeTeamName, awayTeamName }: {
  yardLine: number; possession: 'home' | 'away'; homeTeamName: string; awayTeamName: string;
}) {
  // Convert yardLine (1-99 from offensive team) to absolute position
  const absPos = possession === 'home' ? yardLine : 100 - yardLine;
  const ballPct = Math.max(2, Math.min(98, absPos));
  const firstDownPct = possession === 'home'
    ? Math.min(98, absPos + 10)
    : Math.max(2, absPos - 10);

  return (
    <div style={{ position: 'relative', width: '100%', height: 40, background: '#1a2a1a', borderRadius: 4, overflow: 'hidden', border: '1px solid #2a3a2a' }}>
      {/* Yard line markers */}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(pct => (
        <div key={pct} style={{
          position: 'absolute', left: `${pct}%`, top: 0, bottom: 0,
          width: 1, background: '#2a3a2a', opacity: 0.6,
        }} />
      ))}
      {/* 50-yard line */}
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#3a4a3a' }} />
      {/* Red zone (inside OPP 20) */}
      <div style={{
        position: 'absolute',
        left: possession === 'home' ? '80%' : '0%',
        right: possession === 'home' ? '0%' : '20%',
        top: 0, bottom: 0,
        background: '#e5737311',
      }} />
      {/* First down marker */}
      <div style={{
        position: 'absolute', left: `${firstDownPct}%`, top: 0, bottom: 0,
        width: 2, background: '#FFD700', opacity: 0.7,
      }} />
      {/* Ball */}
      <div style={{
        position: 'absolute', left: `${ballPct}%`, top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 14, height: 14, borderRadius: '50%',
        background: possession === 'home' ? '#FF8740' : '#4FC3F7',
        border: '2px solid #fff',
        boxShadow: `0 0 8px ${possession === 'home' ? '#FF874088' : '#4FC3F788'}`,
        zIndex: 2,
      }} />
      {/* Labels */}
      <div style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: '#3a5a3a', letterSpacing: 0.5 }}>
        {homeTeamName.split(' ').pop()}
      </div>
      <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: '#3a5a3a', letterSpacing: 0.5 }}>
        {awayTeamName.split(' ').pop()}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveGameView({ gameId, userTeamId, onGameComplete, onClose }: Props) {
  const [gameState, setGameState] = useState<LiveGameState | null>(null);
  const [plays, setPlays] = useState<PlayResult[]>([]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(600);       // ms between plays
  const [awaitingDecision, setAwaitingDecision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [done, setDone] = useState(false);
  const playLogRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize
  useEffect(() => {
    window.api.startLiveGame(gameId).then((state: LiveGameState) => {
      setGameState(state);
      setLoading(false);
    }).catch((e: any) => {
      console.error('Failed to start live game:', e);
      onClose();
    });
    return () => {
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, [gameId]);

  // Auto-scroll play log to top on new play
  useEffect(() => {
    if (playLogRef.current) playLogRef.current.scrollTop = 0;
  }, [plays.length]);

  // Sim loop
  const runNextPlay = useCallback(async (decision?: any) => {
    if (!gameState || finalizing) return;

    try {
      const result: { play: PlayResult; state: LiveGameState; awaitingDecision?: string } =
        await window.api.simLivePlay(gameId, decision ?? null);

      setGameState(result.state);

      if (result.play && result.play.type !== 'awaiting_decision') {
        setPlays(prev => [result.play, ...prev]);
      }

      if (result.awaitingDecision) {
        setAwaitingDecision(result.awaitingDecision);
        return;
      }
      setAwaitingDecision(null);

      if (result.state.done || result.play?.type === 'game_over') {
        setDone(true);
        setFinalizing(true);
        const finalResult = await window.api.finalizeLiveGame(gameId);
        onGameComplete(finalResult.homeScore, finalResult.awayScore);
        setFinalizing(false);
        return;
      }
    } catch (e) {
      console.error('[LiveGame] sim error:', e);
    }
  }, [gameId, gameState, finalizing, onGameComplete]);

  useEffect(() => {
    if (loading || paused || awaitingDecision || done || finalizing) return;
    loopRef.current = setTimeout(() => { runNextPlay(); }, speed);
    return () => { if (loopRef.current) clearTimeout(loopRef.current); };
  }, [gameState, paused, speed, awaitingDecision, done, finalizing, loading, runNextPlay]);

  // Skip to end
  const handleSkipToEnd = async () => {
    if (loopRef.current) clearTimeout(loopRef.current);
    setPaused(true);
    setLoading(true);
    try {
      const result: { plays: PlayResult[]; state: LiveGameState } = await window.api.simLiveToEnd(gameId);
      setGameState(result.state);
      setPlays(prev => [...result.plays.filter(p => p.type !== 'awaiting_decision'), ...prev]);
      setDone(true);
      setFinalizing(true);
      const finalResult = await window.api.finalizeLiveGame(gameId);
      onGameComplete(finalResult.homeScore, finalResult.awayScore);
      setFinalizing(false);
    } catch (e) {
      console.error('[LiveGame] skip error:', e);
    }
    setLoading(false);
    setPaused(false);
  };

  const handleFourthDown = (choice: 'go_for_it' | 'punt' | 'field_goal') => {
    setAwaitingDecision(null);
    runNextPlay({ type: 'fourth_down', choice });
  };

  const handleTimeout = () => {
    runNextPlay({ type: 'timeout' });
  };

  const handleChallenge = () => {
    if (!paused) setPaused(true);
    runNextPlay({ type: 'challenge' });
    setPaused(false);
  };

  const handleAbort = async () => {
    if (loopRef.current) clearTimeout(loopRef.current);
    await window.api.abortLiveGame(gameId);
    onClose();
  };

  if (loading || !gameState) {
    return (
      <div style={{ ...overlayStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#FF8740', fontSize: 14 }}>Loading game...</div>
      </div>
    );
  }

  const gs = gameState;
  const isUserHome = gs.homeTeamId === userTeamId;
  const userScore = isUserHome ? gs.homeScore : gs.awayScore;
  const oppScore = isUserHome ? gs.awayScore : gs.homeScore;
  const userTeamName = isUserHome ? gs.homeTeamName : gs.awayTeamName;
  const oppTeamName  = isUserHome ? gs.awayTeamName  : gs.homeTeamName;
  const isUserPossession = (gs.possession === 'home' && isUserHome) || (gs.possession === 'away' && !isUserHome);
  const userSide: 'home' | 'away' = isUserHome ? 'home' : 'away';
  const userTimeouts = gs.timeouts[userSide];
  const userChallenges = gs.challenges[userSide];
  const oppSide: 'home' | 'away' = isUserHome ? 'away' : 'home';

  const fgDist = Math.max(18, (100 - gs.yardLine) + 17);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>

        {/* ── Score Bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#050505', borderBottom: '1px solid #1a1a1a' }}>
          {/* Home */}
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: 1 }}>
              {isUserHome ? '★ YOUR TEAM' : 'OPPONENT'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{gs.homeTeamName}</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: gs.possession === 'home' ? '#FF8740' : '#ccc', lineHeight: 1 }}>
              {gs.homeScore}
            </div>
            <div style={{ marginTop: 4 }}>
              <TimeoutDots count={gs.timeouts.home} />
            </div>
          </div>

          {/* Center */}
          <div style={{ textAlign: 'center', padding: '0 16px' }}>
            <div style={{ fontSize: 11, color: '#FF8740', fontWeight: 700, letterSpacing: 1 }}>
              {quarterLabel(gs.quarter)}
            </div>
            <div style={{ fontSize: 20, color: '#ccc', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {fmtClock(gs.clockSeconds)}
            </div>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: 0.5, marginTop: 2 }}>
              {gs.done ? 'FINAL' : paused ? '⏸ PAUSED' : finalizing ? 'FINALIZING...' : '● LIVE'}
            </div>
          </div>

          {/* Away */}
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: 1 }}>
              {!isUserHome ? '★ YOUR TEAM' : 'OPPONENT'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{gs.awayTeamName}</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: gs.possession === 'away' ? '#FF8740' : '#ccc', lineHeight: 1 }}>
              {gs.awayScore}
            </div>
            <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <TimeoutDots count={gs.timeouts.away} />
            </div>
          </div>

          {/* Close button */}
          <button onClick={handleAbort} style={{
            marginLeft: 12, padding: '4px 8px', fontSize: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 3, color: '#555',
          }}>Exit</button>
        </div>

        {/* ── Field Strip ────────────────────────────────────────────────── */}
        {!gs.done && !gs.kickoffNext && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #111' }}>
            <FieldStrip
              yardLine={gs.yardLine}
              possession={gs.possession}
              homeTeamName={gs.homeTeamName}
              awayTeamName={gs.awayTeamName}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}>
              <span style={{ color: '#FF8740', fontWeight: 700 }}>{downLabel(gs.down, gs.yardsToGo)}</span>
              <span style={{ color: '#555' }}>at {fieldLabel(gs.yardLine)}</span>
              <span style={{ color: gs.possession === userSide ? '#4caf50' : '#e57373', fontSize: 9 }}>
                {gs.possession === userSide ? '▶ YOUR BALL' : '▶ OPP BALL'}
              </span>
            </div>
          </div>
        )}

        {/* ── Play Log ───────────────────────────────────────────────────── */}
        <div
          ref={playLogRef}
          style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', minHeight: 0 }}
        >
          {plays.length === 0 && !gs.done && (
            <div style={{ color: '#333', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
              Game starting...
            </div>
          )}
          {plays.map((play, i) => {
            const color = playTypeColor(play.type);
            const icon = playTypeIcon(play.type);
            const isLatest = i === 0;
            return (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '5px 8px', marginBottom: 2,
                background: isLatest ? '#0d0d0d' : 'transparent',
                borderRadius: 4,
                borderLeft: isLatest ? `2px solid ${color}` : '2px solid transparent',
                opacity: Math.max(0.4, 1 - i * 0.04),
              }}>
                <span style={{ fontSize: 9, color: '#555', minWidth: 32, paddingTop: 1, flexShrink: 0 }}>
                  {quarterLabel(play.quarter)}
                </span>
                <span style={{ fontSize: 9, color: color, minWidth: 36, flexShrink: 0, fontWeight: 700 }}>
                  {icon}
                </span>
                <span style={{ fontSize: 11, color: isLatest ? '#ccc' : '#666', lineHeight: 1.4, flex: 1 }}>
                  {play.description}
                </span>
                {play.isScoring && (
                  <span style={{ fontSize: 10, color: '#777', flexShrink: 0 }}>
                    {play.homeScore}–{play.awayScore}
                  </span>
                )}
              </div>
            );
          })}
          {gs.done && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#4caf50', fontSize: 13, fontWeight: 700 }}>
              FINAL: {gs.homeTeamName} {gs.homeScore} — {gs.awayTeamName} {gs.awayScore}
            </div>
          )}
        </div>

        {/* ── Controls ───────────────────────────────────────────────────── */}
        {!gs.done && (
          <div style={{ padding: '10px 14px', borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Speed + pause controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setPaused(p => !p)} style={{
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                background: paused ? '#FF8740' : '#1a1a1a',
                border: `1px solid ${paused ? '#FF8740' : '#2a2a2a'}`,
                color: paused ? '#000' : '#777', fontWeight: 700,
              }}>
                {paused ? '▶ PLAY' : '⏸ PAUSE'}
              </button>

              {/* Speed selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, color: '#444' }}>SPEED</span>
                {[{ label: 'Slow', val: 1200 }, { label: 'Normal', val: 600 }, { label: 'Fast', val: 180 }].map(s => (
                  <button key={s.val} onClick={() => setSpeed(s.val)} style={{
                    padding: '3px 8px', fontSize: 9, cursor: 'pointer', borderRadius: 3,
                    background: speed === s.val ? '#1a1a2a' : 'transparent',
                    border: `1px solid ${speed === s.val ? '#4FC3F7' : '#2a2a2a'}`,
                    color: speed === s.val ? '#4FC3F7' : '#444',
                  }}>{s.label}</button>
                ))}
              </div>

              <button onClick={handleSkipToEnd} style={{
                marginLeft: 'auto', padding: '5px 12px', fontSize: 10, cursor: 'pointer',
                background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 3, color: '#555',
              }}>
                ⏭ Skip to End
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={handleTimeout}
                disabled={!paused || userTimeouts === 0}
                title={!paused ? 'Pause first to call timeout' : ''}
                style={{
                  padding: '4px 10px', fontSize: 9, cursor: userTimeouts > 0 && paused ? 'pointer' : 'not-allowed',
                  background: 'transparent',
                  border: `1px solid ${userTimeouts > 0 ? '#FFD70055' : '#2a2a2a'}`,
                  borderRadius: 3, color: userTimeouts > 0 && paused ? '#FFD700' : '#444',
                  opacity: userTimeouts > 0 ? 1 : 0.4,
                }}
              >
                ⏱ Timeout ({userTimeouts})
              </button>

              <button
                onClick={handleChallenge}
                disabled={userChallenges === 0 || plays.length === 0}
                title="Pause, then challenge the last play"
                style={{
                  padding: '4px 10px', fontSize: 9, cursor: userChallenges > 0 ? 'pointer' : 'not-allowed',
                  background: 'transparent',
                  border: `1px solid ${userChallenges > 0 ? '#9b59b655' : '#2a2a2a'}`,
                  borderRadius: 3, color: userChallenges > 0 ? '#9b59b6' : '#444',
                  opacity: userChallenges > 0 ? 1 : 0.4,
                }}
              >
                📋 Challenge ({userChallenges})
              </button>
            </div>

            {/* 4th Down Decision Prompt */}
            {awaitingDecision === 'fourth_down' && (
              <div style={{
                padding: '12px 14px', background: '#0a0a14',
                border: '1px solid #FF874055', borderRadius: 4,
              }}>
                <div style={{ fontSize: 10, color: '#FF8740', fontWeight: 700, marginBottom: 8 }}>
                  4TH DOWN DECISION — {downLabel(gs.down, gs.yardsToGo)} at {fieldLabel(gs.yardLine)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => handleFourthDown('go_for_it')} style={decBtn('#4caf50')}>
                    Go For It
                  </button>
                  <button onClick={() => handleFourthDown('field_goal')} style={decBtn('#FF8740')}>
                    Field Goal (~{fgDist} yd)
                  </button>
                  <button onClick={() => handleFourthDown('punt')} style={decBtn('#4FC3F7')}>
                    Punt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Game Over ──────────────────────────────────────────────────── */}
        {gs.done && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid #1a1a1a', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#4caf50', fontWeight: 700, marginBottom: 8 }}>
              {finalizing ? 'Saving game result...' : 'Game Complete'}
            </div>
            {!finalizing && (
              <button onClick={onClose} style={{
                padding: '8px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: '#FF8740', color: '#000', border: 'none', borderRadius: 4,
              }}>
                Return to Schedule
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  width: 560, maxWidth: '95vw',
  height: 680, maxHeight: '92vh',
  background: '#0a0a0a',
  border: '1px solid #222',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
};

const decBtn = (color: string): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 700,
  background: `${color}22`, border: `1px solid ${color}88`,
  borderRadius: 4, color, flex: 1, minWidth: 100,
});
