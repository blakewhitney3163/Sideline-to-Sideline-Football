import React, { useEffect, useState, useCallback } from 'react';
import { T } from './theme';
import { useGameStore } from './store/gameStore';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BracketTeam { id: number; city: string; name: string; }

interface BracketGame {
  id: number;
  week: number;
  homeTeam: BracketTeam;
  awayTeam: BracketTeam;
  homeScore: number;
  awayScore: number;
  isSimulated: boolean;
  winner: BracketTeam | null;
}

interface ConferenceBracketData {
  wildCard: BracketGame[];
  divisional: BracketGame[];
  championship: BracketGame | null;
}

interface PlayoffState {
  initialized: boolean;
  complete: boolean;
  champion: BracketTeam | null;
  afcSeeds: BracketTeam[];
  nfcSeeds: BracketTeam[];
  afc: ConferenceBracketData;
  nfc: ConferenceBracketData;
  gridironCup: BracketGame | null;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const SLOT     = 82;
const CONF_H   = 4 * SLOT;
const CARD_H   = 66;
const CARD_PAD = (SLOT - CARD_H) / 2;
const COL_W    = 250;
const GAP      = 20;
const BRKT_W   = COL_W * 3 + GAP * 2;

const slotCY  = (i: number) => i * SLOT + SLOT / 2;
const WC_CY   = [0, 1, 2, 3].map(slotCY);
const DIV_CY  = [(WC_CY[0] + WC_CY[1]) / 2, (WC_CY[2] + WC_CY[3]) / 2];
const CHAMP_CY = (DIV_CY[0] + DIV_CY[1]) / 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedNum(seeds: BracketTeam[], teamId: number): number {
  const idx = seeds.findIndex(s => s.id === teamId);
  return idx >= 0 ? idx + 1 : 0;
}

function allGames(state: PlayoffState): BracketGame[] {
  return [
    ...state.afc.wildCard,
    ...state.nfc.wildCard,
    ...state.afc.divisional,
    ...state.nfc.divisional,
    state.afc.championship,
    state.nfc.championship,
    state.gridironCup,
  ].filter((g): g is BracketGame => g !== null);
}

function currentRoundWeek(state: PlayoffState): number {
  const pending = allGames(state).filter(g => !g.isSimulated);
  if (pending.length === 0) return 21;
  return Math.min(...pending.map(g => g.week));
}

// ─── Team row ─────────────────────────────────────────────────────────────────

function TeamRow({ team, score, won, sn, isUser }: {
  team: BracketTeam; score: number; won: boolean; sn: number; isUser: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 6 }}>
      <span style={{ color: '#2a2a2a', fontSize: 9, fontWeight: 700, width: 12, textAlign: 'right', flexShrink: 0 }}>
        {sn > 0 ? sn : ''}
      </span>
      <span style={{
        flex: 1, fontSize: 11,
        color: isUser ? '#FF8740' : won ? '#ddd' : '#3a3a3a',
        fontWeight: won ? 700 : 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {team.city} {team.name}
      </span>
      <span style={{
        fontSize: 14, fontWeight: won ? 700 : 400,
        color: won ? '#fff' : '#2a2a2a',
        minWidth: 22, textAlign: 'right', flexShrink: 0,
      }}>
        {score}
      </span>
    </div>
  );
}

// ─── Game card (completed or pending) ─────────────────────────────────────────

function GameCard({ game, seeds, userTeamId, onSimulate, isSimulating, style }: {
  game: BracketGame;
  seeds: BracketTeam[];
  userTeamId: number;
  onSimulate?: (gameId: number) => void;
  isSimulating?: boolean;
  style?: React.CSSProperties;
}) {
  const isUserGame = game.homeTeam.id === userTeamId || game.awayTeam.id === userTeamId;

  if (!game.isSimulated) {
    return (
      <div style={{
        height: CARD_H,
        background: '#080808',
        border: `1px dashed ${isUserGame ? 'rgba(255,135,64,0.5)' : '#1c1c1c'}`,
        borderRadius: 5,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '6px 10px', gap: 4, ...style,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#2a2a2a', fontSize: 9, width: 12 }}>{seedNum(seeds, game.homeTeam.id) || ''}</span>
          <span style={{ flex: 1, fontSize: 10, color: isUserGame ? '#FF8740' : '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {game.homeTeam.city} {game.homeTeam.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#2a2a2a', fontSize: 9, width: 12 }}>{seedNum(seeds, game.awayTeam.id) || ''}</span>
          <span style={{ flex: 1, fontSize: 10, color: isUserGame ? '#FF8740' : '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {game.awayTeam.city} {game.awayTeam.name}
          </span>
          {onSimulate && (
            <button
              onClick={() => onSimulate(game.id)}
              disabled={isSimulating}
              style={{
                padding: '2px 8px', fontSize: 9, cursor: isSimulating ? 'not-allowed' : 'pointer',
                borderRadius: 3, flexShrink: 0,
                background: isUserGame ? 'rgba(255,135,64,0.12)' : '#0e0e0e',
                border: `1px solid ${isUserGame ? '#FF8740' : '#2a2a2a'}`,
                color: isUserGame ? '#FF8740' : '#555',
              }}
            >
              {isSimulating ? '…' : isUserGame ? '▶ Play' : 'Sim'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const homeWon = game.winner?.id === game.homeTeam.id;
  return (
    <div style={{
      height: CARD_H,
      background: '#0e0e0e', border: '1px solid #1e1e1e',
      borderRadius: 5, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', ...style,
    }}>
      <TeamRow team={game.homeTeam} score={game.homeScore} won={homeWon}
        sn={seedNum(seeds, game.homeTeam.id)} isUser={game.homeTeam.id === userTeamId} />
      <div style={{ height: 1, background: '#1a1a1a', margin: '0 6px' }} />
      <TeamRow team={game.awayTeam} score={game.awayScore} won={!homeWon}
        sn={seedNum(seeds, game.awayTeam.id)} isUser={game.awayTeam.id === userTeamId} />
    </div>
  );
}

// ─── Placeholder for games not yet created ────────────────────────────────────

function TbdCard({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      height: CARD_H,
      background: '#050505', border: '1px dashed #111',
      borderRadius: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}>
      <span style={{ color: '#222', fontSize: 10, letterSpacing: 1 }}>TBD</span>
    </div>
  );
}

// ─── Bye card ─────────────────────────────────────────────────────────────────

function ByeCard({ team, seeds, userTeamId }: {
  team: BracketTeam; seeds: BracketTeam[]; userTeamId: number;
}) {
  const sn = seedNum(seeds, team.id);
  const isUser = team.id === userTeamId;
  return (
    <div style={{
      height: CARD_H,
      background: '#080808', border: '1px dashed #1a1a1a',
      borderRadius: 5,
      display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6,
    }}>
      <span style={{ color: '#2a2a2a', fontSize: 9, fontWeight: 700, width: 12, textAlign: 'right' }}>{sn}</span>
      <span style={{
        flex: 1, fontSize: 11,
        color: isUser ? '#FF8740' : '#3a3a3a',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {team.city} {team.name}
      </span>
      <span style={{ color: '#252525', fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>BYE</span>
    </div>
  );
}

// ─── SVG connector lines ──────────────────────────────────────────────────────

function BracketLines() {
  const stroke = '#1e1e1e';
  const sw = 1.5;
  const wcR    = COL_W;
  const divL   = COL_W + GAP;
  const divR   = COL_W * 2 + GAP;
  const champL = COL_W * 2 + GAP * 2;
  const m1     = wcR  + GAP / 2;
  const m2     = divR + GAP / 2;
  const [wc0, wc1, wc2, byeY] = WC_CY;
  const [d0, d1] = DIV_CY;
  const ch = CHAMP_CY;
  return (
    <svg width={BRKT_W} height={CONF_H} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <line x1={wcR} y1={wc0} x2={m1} y2={wc0} stroke={stroke} strokeWidth={sw} />
      <line x1={wcR} y1={wc1} x2={m1} y2={wc1} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={wc0} x2={m1} y2={wc1} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={d0}  x2={divL} y2={d0} stroke={stroke} strokeWidth={sw} />
      <line x1={wcR} y1={wc2}  x2={m1} y2={wc2}  stroke={stroke} strokeWidth={sw} />
      <line x1={wcR} y1={byeY} x2={m1} y2={byeY} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={wc2}  x2={m1} y2={byeY} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={d1}   x2={divL} y2={d1}  stroke={stroke} strokeWidth={sw} />
      <line x1={divR} y1={d0} x2={m2} y2={d0} stroke={stroke} strokeWidth={sw} />
      <line x1={divR} y1={d1} x2={m2} y2={d1} stroke={stroke} strokeWidth={sw} />
      <line x1={m2}   y1={d0} x2={m2} y2={d1} stroke={stroke} strokeWidth={sw} />
      <line x1={m2}   y1={ch} x2={champL} y2={ch} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}

// ─── Conference bracket ───────────────────────────────────────────────────────

function ConferenceBracket({ bracket, seeds, label, userTeamId, onSimulate, simulatingId }: {
  bracket: ConferenceBracketData;
  seeds: BracketTeam[];
  label: string;
  userTeamId: number;
  onSimulate: (gameId: number) => void;
  simulatingId: number | null;
}) {
  const { wildCard, divisional, championship } = bracket;
  const wcTop    = (slot: number) => slot * SLOT + CARD_PAD;
  const divTop   = (idx: number) => DIV_CY[idx] - CARD_H / 2;
  const champTop = CHAMP_CY - CARD_H / 2;

  const renderGame = (game: BracketGame | null | undefined) => {
    if (!game) return <TbdCard />;
    return (
      <GameCard
        game={game} seeds={seeds} userTeamId={userTeamId}
        onSimulate={onSimulate} isSimulating={simulatingId === game.id}
      />
    );
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', width: BRKT_W, marginBottom: 6 }}>
        {[
          { label: `${label} · WILD CARD`, w: COL_W },
          { label: '',                      w: GAP   },
          { label: 'DIVISIONAL',            w: COL_W },
          { label: '',                      w: GAP   },
          { label: 'CONF. CHAMPIONSHIP',    w: COL_W },
        ].map((col, i) => (
          <div key={i} style={{ width: col.w, flexShrink: 0, textAlign: i === 4 ? 'right' : 'left' }}>
            {col.label && (
              <span style={{
                color: i === 0 ? '#FF8740' : '#2a2a2a',
                fontSize: 9, letterSpacing: 1, fontWeight: i === 0 ? 700 : 400,
              }}>
                {col.label}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', height: CONF_H, width: BRKT_W }}>
        <BracketLines />

        <div style={{ position: 'absolute', left: 0, top: wcTop(0), width: COL_W }}>
          {renderGame(wildCard[0])}
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(1), width: COL_W }}>
          {renderGame(wildCard[1])}
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(2), width: COL_W }}>
          {renderGame(wildCard[2])}
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(3), width: COL_W }}>
          {seeds[0] ? <ByeCard team={seeds[0]} seeds={seeds} userTeamId={userTeamId} /> : <TbdCard />}
        </div>

        <div style={{ position: 'absolute', left: COL_W + GAP, top: divTop(0), width: COL_W }}>
          {renderGame(divisional[1])}
        </div>
        <div style={{ position: 'absolute', left: COL_W + GAP, top: divTop(1), width: COL_W }}>
          {renderGame(divisional[0])}
        </div>

        <div style={{ position: 'absolute', left: (COL_W + GAP) * 2, top: champTop, width: COL_W }}>
          {renderGame(championship)}
        </div>
      </div>
    </div>
  );
}

// ─── Gridiron Cup ─────────────────────────────────────────────────────────────

function GridironCup({ game, afcSeeds, nfcSeeds, userTeamId, onSimulate, isSimulating }: {
  game: BracketGame | null;
  afcSeeds: BracketTeam[];
  nfcSeeds: BracketTeam[];
  userTeamId: number;
  onSimulate: (gameId: number) => void;
  isSimulating: boolean;
}) {
  const allSeeds = [...afcSeeds, ...nfcSeeds];

  if (!game) {
    return (
      <div style={{
        width: BRKT_W, marginBottom: 12,
        background: '#0a0a0a', border: '1px dashed #1a1a1a', borderRadius: 8,
        padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#1e1e1e', fontSize: 11, letterSpacing: 2 }}>GRIDIRON CUP — TBD</span>
      </div>
    );
  }

  if (!game.isSimulated) {
    const isUserGame = game.homeTeam.id === userTeamId || game.awayTeam.id === userTeamId;
    return (
      <div style={{
        width: BRKT_W, marginBottom: 12,
        background: '#0a0a0a', border: `1px dashed ${isUserGame ? 'rgba(255,215,0,0.3)' : '#2a2a00'}`,
        borderRadius: 8, padding: '16px 20px',
      }}>
        <div style={{ textAlign: 'center', color: '#3a3a00', fontSize: 9, letterSpacing: 2, marginBottom: 12 }}>
          GRIDIRON CUP
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#2a2a2a', fontSize: 9, marginBottom: 4 }}>#{seedNum(allSeeds, game.homeTeam.id)}</div>
            <div style={{ fontSize: 13, color: game.homeTeam.id === userTeamId ? '#FF8740' : '#444' }}>
              {game.homeTeam.city} {game.homeTeam.name}
            </div>
          </div>
          <div style={{ color: '#2a2a2a', fontSize: 14, fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#2a2a2a', fontSize: 9, marginBottom: 4 }}>#{seedNum(allSeeds, game.awayTeam.id)}</div>
            <div style={{ fontSize: 13, color: game.awayTeam.id === userTeamId ? '#FF8740' : '#444' }}>
              {game.awayTeam.city} {game.awayTeam.name}
            </div>
          </div>
          <button
            onClick={() => onSimulate(game.id)}
            disabled={isSimulating}
            style={{
              padding: '7px 18px', fontSize: 11, cursor: isSimulating ? 'not-allowed' : 'pointer',
              borderRadius: 4,
              background: isUserGame ? 'rgba(255,215,0,0.1)' : '#111',
              border: `1px solid ${isUserGame ? '#FFD700' : '#2a2a00'}`,
              color: isUserGame ? '#FFD700' : '#555',
              fontWeight: 600, marginLeft: 20,
            }}
          >
            {isSimulating ? 'Simulating…' : isUserGame ? '▶ Play Gridiron Cup' : '🏆 Simulate Cup'}
          </button>
        </div>
      </div>
    );
  }

  const homeWon = game.winner?.id === game.homeTeam.id;
  const Block = ({ team, score, won }: { team: BracketTeam; score: number; won: boolean }) => (
    <div style={{
      flex: 1, textAlign: 'center', padding: '14px 16px', borderRadius: 6,
      background: won ? 'rgba(255,215,0,0.04)' : 'transparent',
      border: won ? '1px solid rgba(255,215,0,0.15)' : '1px solid transparent',
    }}>
      <div style={{ color: '#333', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
        #{seedNum(allSeeds, team.id)} SEED
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: team.id === userTeamId ? '#FF8740' : won ? '#FFD700' : '#555' }}>
        {team.city} {team.name}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color: won ? '#fff' : '#222' }}>{score}</div>
      {won && <div style={{ fontSize: 10, color: '#FFD700', marginTop: 8, letterSpacing: 1 }}>🏆 GRIDIRON CUP CHAMPION</div>}
    </div>
  );
  return (
    <div style={{
      width: BRKT_W, marginBottom: 12,
      background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 20px',
    }}>
      <div style={{ textAlign: 'center', color: '#2a2a2a', fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>GRIDIRON CUP</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Block team={game.homeTeam} score={game.homeScore} won={homeWon} />
        <div style={{ color: '#1e1e1e', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>vs</div>
        <Block team={game.awayTeam} score={game.awayScore} won={!homeWon} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Playoffs() {
  const { currentSeason, userTeam, setPlayoffsComplete, playoffsComplete } = useGameStore();
  const [state, setState] = useState<PlayoffState | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const [simulatingAll, setSimulatingAll] = useState(false);
  const [starting, setStarting] = useState(false);

  const userTeamId = userTeam?.id ?? -1;

  const loadState = useCallback(async () => {
    const result = await window.api.getPlayoffState(currentSeason);
    setState(result?.initialized ? result : null);
    setLoading(false);
    if (result?.complete && !playoffsComplete) {
      setPlayoffsComplete(true);
    }
  }, [currentSeason]);

  useEffect(() => { loadState(); }, [loadState]);

  const handleSimulateGame = async (gameId: number) => {
    setSimulatingId(gameId);
    await window.api.simulatePlayoffGame(gameId);
    await loadState();
    setSimulatingId(null);
  };

  const handleSimulateAllRemaining = async () => {
    setSimulatingAll(true);
    try {
      let iterations = 0;
      while (iterations < 4) {
        const current = await window.api.getPlayoffState(currentSeason);
        if (!current?.initialized || current.complete) break;
        const pending = allGames(current).filter((g: BracketGame) => !g.isSimulated);
        if (pending.length === 0) break;
        const roundWeek = Math.min(...pending.map((g: BracketGame) => g.week));
        const roundPending = pending.filter((g: BracketGame) => g.week === roundWeek);
        for (const game of roundPending) {
          await window.api.simulatePlayoffGame(game.id);
        }
        iterations++;
      }
      await loadState();
    } finally {
      setSimulatingAll(false);
    }
  };

  const handleStartPlayoffs = async () => {
    setStarting(true);
    await window.api.initPlayoffs(currentSeason);
    await loadState();
    setStarting(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  const roundLabel = state ? (() => {
    const week = currentRoundWeek(state);
    return { 18: 'Wild Card', 19: 'Divisional', 20: 'Conference Championship', 21: 'Gridiron Cup' }[week] ?? '';
  })() : '';

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
            {currentSeason} Playoffs
          </h1>
          <p style={{ color: '#444', fontSize: 12, margin: '2px 0 0' }}>
            {state?.complete
              ? `🏆 ${state.champion?.city} ${state.champion?.name} — Gridiron Cup Champions`
              : state
              ? `${roundLabel} Round${state ? ' — click Sim on each game or simulate all at once' : ''}`
              : '14 teams · Wild Card → Divisional → Conference Championship → Gridiron Cup'}
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {!state && (
            <button
              onClick={handleStartPlayoffs}
              disabled={starting}
              style={{
                padding: '8px 20px', background: starting ? '#141414' : '#FF8740',
                border: 'none', borderRadius: 5,
                color: starting ? '#444' : '#000', fontWeight: 700, fontSize: 12,
                cursor: starting ? 'not-allowed' : 'pointer',
              }}
            >
              {starting ? 'Setting up…' : '▶ Start Playoffs'}
            </button>
          )}
          {state && !state.complete && (
            <button
              onClick={handleSimulateAllRemaining}
              disabled={simulatingAll || simulatingId !== null}
              style={{
                padding: '8px 20px',
                background: simulatingAll ? '#141414' : '#1a1a1a',
                border: '1px solid #333', borderRadius: 5,
                color: simulatingAll ? '#444' : '#888', fontSize: 12,
                cursor: simulatingAll ? 'not-allowed' : 'pointer',
              }}
            >
              {simulatingAll ? 'Simulating…' : 'Simulate All Remaining'}
            </button>
          )}
        </div>
      </div>

      {!state ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#2a2a2a', fontSize: 14 }}>
          Click "Start Playoffs" to begin. You'll be able to simulate each game individually.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <ConferenceBracket
            bracket={state.afc} seeds={state.afcSeeds} label="AFC"
            userTeamId={userTeamId} onSimulate={handleSimulateGame} simulatingId={simulatingId}
          />
          <GridironCup
            game={state.gridironCup}
            afcSeeds={state.afcSeeds} nfcSeeds={state.nfcSeeds}
            userTeamId={userTeamId}
            onSimulate={handleSimulateGame} isSimulating={simulatingId === state.gridironCup?.id || simulatingAll}
          />
          <ConferenceBracket
            bracket={state.nfc} seeds={state.nfcSeeds} label="NFC"
            userTeamId={userTeamId} onSimulate={handleSimulateGame} simulatingId={simulatingId}
          />
        </div>
      )}
    </div>
  );
}
