import React, { useState } from 'react';
import { T } from './theme';
import { useGameStore } from './store/gameStore';

declare const window: any;

interface PlayoffTeam { id: number; city: string; name: string; wins: number; }
interface PlayoffGame { home: PlayoffTeam; away: PlayoffTeam; homeScore: number; awayScore: number; winner: PlayoffTeam; }
interface ConferenceBracket { seeds: PlayoffTeam[]; wildCard: PlayoffGame[]; divisional: PlayoffGame[]; championship: PlayoffGame; }
interface PlayoffData { afc: ConferenceBracket; nfc: ConferenceBracket; superBowl: PlayoffGame; }

interface Props {
  data?: PlayoffData | null;
  setData?: (data: PlayoffData) => void;
}

function GameCard({ game, label }: { game: PlayoffGame; label?: string }) {
  const homeWon = game.homeScore > game.awayScore;
  return (
    <div style={{ background: T.bgCard, borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
      {label && <div style={{ fontSize: 9, color: T.textDim, marginBottom: 4, letterSpacing: 1 }}>{label}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: homeWon ? T.textPrimary : T.textMuted, fontWeight: homeWon ? 700 : 400, fontSize: 12 }}>
          {game.home.city} {game.home.name}
        </span>
        <span style={{ color: homeWon ? T.green : T.textMuted, fontWeight: 700 }}>{game.homeScore}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: !homeWon ? T.textPrimary : T.textMuted, fontWeight: !homeWon ? 700 : 400, fontSize: 12 }}>
          {game.away.city} {game.away.name}
        </span>
        <span style={{ color: !homeWon ? T.green : T.textMuted, fontWeight: 700 }}>{game.awayScore}</span>
      </div>
    </div>
  );
}

function SeedList({ seeds }: { seeds: PlayoffTeam[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 4 }}>SEEDS</div>
      {seeds.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: T.textDim, width: 14 }}>{i + 1}</span>
          <span style={{ color: T.textPrimary, flex: 1 }}>{t.city} {t.name}</span>
          <span style={{ color: T.textMuted }}>{t.wins}W</span>
          {i === 0 && <span style={{ fontSize: 9, color: T.green, fontWeight: 700 }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

export default function Playoffs({ data: propData, setData: propSetData }: Props = {}) {
  const { currentSeason } = useGameStore();
  const [simulating, setSimulating] = useState(false);
  const [localData, setLocalData] = useState<PlayoffData | null>(propData ?? null);
  const data = propData !== undefined ? propData : localData;
  const setData = propSetData ?? setLocalData;

  const handleSimulate = async () => {
    setSimulating(true);
    const result = await window.api.simulatePlayoffs(currentSeason);
    setData(result);
    setSimulating(false);
  };

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: T.textPrimary, fontSize: 18 }}>{currentSeason} Playoffs</h2>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 700,
            background: simulating ? T.bgCard : T.green,
            color: simulating ? T.textMuted : '#000',
            border: 'none', borderRadius: 4, cursor: simulating ? 'not-allowed' : 'pointer',
          }}
        >
          {simulating ? 'Simulating...' : data ? 'Re-Simulate' : 'Simulate Playoffs'}
        </button>
      </div>

      {!data ? (
        <div style={{ color: T.textMuted, fontSize: 13 }}>Click "Simulate Playoffs" to run the bracket.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {(['afc', 'nfc'] as const).map(conf => (
              <div key={conf} style={{ background: T.bgPanel, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 12, letterSpacing: 1 }}>
                  {conf.toUpperCase()}
                </div>
                <SeedList seeds={data[conf].seeds} />
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>WILD CARD</div>
                {data[conf].wildCard.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6, marginTop: 8 }}>DIVISIONAL</div>
                {data[conf].divisional.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6, marginTop: 8 }}>CHAMPIONSHIP</div>
                <GameCard game={data[conf].championship} />
              </div>
            ))}
          </div>

          <div style={{ background: T.bgGold, borderRadius: 8, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.gold, letterSpacing: 2, marginBottom: 8 }}>SUPER BOWL</div>
            <GameCard game={data.superBowl} />
            <div style={{ fontSize: 16, fontWeight: 700, color: T.gold, marginTop: 8 }}>
              🏆 {data.superBowl.winner.city} {data.superBowl.winner.name}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
