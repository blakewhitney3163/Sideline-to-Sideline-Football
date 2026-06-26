import React from 'react';
import { T } from '../theme';

interface Team { id: number; city: string; name: string; }

interface PlayoffGame {
  id: number;
  week: number;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  isSimulated: boolean;
  winner: Team | null;
}

interface BracketState {
  initialized: boolean;
  complete: boolean;
  champion: Team | null;
  afcSeeds: any[];
  nfcSeeds: any[];
  afc: { wildCard: PlayoffGame[]; divisional: PlayoffGame[]; championship: PlayoffGame | null; };
  nfc: { wildCard: PlayoffGame[]; divisional: PlayoffGame[]; championship: PlayoffGame | null; };
  gridironCup: PlayoffGame | null;
}

interface Props {
  state: BracketState | null;
  onSimulateGame: (gameId: number) => void;
  onSimulateAll: () => void;
  simulatingGameId: number | null;
  simulatingAll?: boolean;
}

function GameCard({ game, onSim, simming }: { game: PlayoffGame; onSim: (id: number) => void; simming: boolean }) {
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${game.isSimulated ? T.borderFaint : T.borderMid}`,
      borderRadius: 6, padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{
            fontSize: 12, fontWeight: game.winner?.id === game.awayTeam.id ? 700 : 400,
            color: game.winner?.id === game.awayTeam.id ? T.textPrimary : T.textSecondary,
          }}>
            {game.awayTeam.city} {game.awayTeam.name}
          </span>
          {game.isSimulated && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: game.winner?.id === game.awayTeam.id ? '#4caf50' : T.textSecondary }}>
              {game.awayScore}
            </span>
          )}
        </div>
        <div style={{ fontSize: 8, color: T.textDim, letterSpacing: 1, marginBottom: 3 }}>@</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 12, fontWeight: game.winner?.id === game.homeTeam.id ? 700 : 400,
            color: game.winner?.id === game.homeTeam.id ? T.textPrimary : T.textSecondary,
          }}>
            {game.homeTeam.city} {game.homeTeam.name}
          </span>
          {game.isSimulated && (
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: game.winner?.id === game.homeTeam.id ? '#4caf50' : T.textSecondary }}>
              {game.homeScore}
            </span>
          )}
        </div>
      </div>

      {!game.isSimulated && (
        <button
          onClick={() => onSim(game.id)}
          disabled={simming}
          style={{
            fontSize: 10, padding: '6px 12px', borderRadius: 4,
            background: simming ? T.bgCard : '#0a1a0a',
            border: `1px solid ${simming ? T.borderFaint : '#2a5a2a'}`,
            color: simming ? T.textDim : '#4caf50',
            cursor: simming ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', fontWeight: 600,
          }}
        >
          {simming ? '...' : '▶ Sim'}
        </button>
      )}
      {game.isSimulated && (
        <div style={{ fontSize: 9, color: '#4caf50', border: '1px solid #1a3a1a', borderRadius: 3, padding: '3px 6px', whiteSpace: 'nowrap' }}>
          Final
        </div>
      )}
    </div>
  );
}

export default function PlayoffBracketView({ state, onSimulateGame, onSimulateAll, simulatingGameId, simulatingAll }: Props) {
  if (!state) return <div style={{ color: T.textMuted, padding: 16 }}>Loading bracket...</div>;

  if (!state.initialized) {
    return (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: 20 }}>
        <div style={{ color: T.textMuted, fontSize: 12 }}>Playoffs not yet initialized.</div>
      </div>
    );
  }

  const allGames: PlayoffGame[] = [
    ...state.afc.wildCard, ...state.nfc.wildCard,
    ...state.afc.divisional, ...state.nfc.divisional,
    ...(state.afc.championship ? [state.afc.championship] : []),
    ...(state.nfc.championship ? [state.nfc.championship] : []),
    ...(state.gridironCup ? [state.gridironCup] : []),
  ];
  const pendingCount = allGames.filter(g => !g.isSimulated).length;
  const currentRoundWeek = allGames.find(g => !g.isSimulated)?.week ?? null;
  const roundLabel: Record<number, string> = {
    18: 'Wild Card', 19: 'Divisional', 20: 'Conference Championships', 21: 'Gridiron Cup',
  };

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase', marginBottom: 3 }}>
            Playoffs
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
            {state.complete && state.champion
              ? `🏆 ${state.champion.city} ${state.champion.name}`
              : currentRoundWeek ? roundLabel[currentRoundWeek] ?? 'Playoffs' : 'Playoffs'}
          </div>
        </div>
        {pendingCount > 0 && (
          <button
            onClick={onSimulateAll}
            disabled={!!simulatingAll || simulatingGameId !== null}
            style={{
              fontSize: 9, padding: '5px 12px', borderRadius: 4,
              background: 'none', border: '1px solid #2a1800',
              color: '#FF8740', cursor: (simulatingAll || simulatingGameId !== null) ? 'not-allowed' : 'pointer',
            }}
          >
            {simulatingAll ? 'Simulating...' : `Simulate All (${pendingCount})`}
          </button>
        )}
      </div>

      {/* Wild Card */}
      {(state.afc.wildCard.length > 0 || state.nfc.wildCard.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
            Wild Card Round
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>AFC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.afc.wildCard.map(g => (
                  <GameCard key={g.id} game={g} onSim={onSimulateGame} simming={simulatingGameId === g.id} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>NFC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.nfc.wildCard.map(g => (
                  <GameCard key={g.id} game={g} onSim={onSimulateGame} simming={simulatingGameId === g.id} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Divisional */}
      {(state.afc.divisional.length > 0 || state.nfc.divisional.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
            Divisional Round
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>AFC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.afc.divisional.map(g => (
                  <GameCard key={g.id} game={g} onSim={onSimulateGame} simming={simulatingGameId === g.id} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>NFC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {state.nfc.divisional.map(g => (
                  <GameCard key={g.id} game={g} onSim={onSimulateGame} simming={simulatingGameId === g.id} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conference Championships */}
      {(state.afc.championship || state.nfc.championship) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
            Conference Championships
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {state.afc.championship && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>AFC</div>
                <GameCard game={state.afc.championship} onSim={onSimulateGame} simming={simulatingGameId === state.afc.championship.id} />
              </div>
            )}
            {state.nfc.championship && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: T.textDim, marginBottom: 5, letterSpacing: 1 }}>NFC</div>
                <GameCard game={state.nfc.championship} onSim={onSimulateGame} simming={simulatingGameId === state.nfc.championship.id} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gridiron Cup */}
      {state.gridironCup && (
        <div>
          <div style={{ fontSize: 8, letterSpacing: 2, color: '#FFD700', textTransform: 'uppercase', marginBottom: 8 }}>
            🏆 Gridiron Cup
          </div>
          <GameCard game={state.gridironCup} onSim={onSimulateGame} simming={simulatingGameId === state.gridironCup.id} />
        </div>
      )}
    </div>
  );
}
