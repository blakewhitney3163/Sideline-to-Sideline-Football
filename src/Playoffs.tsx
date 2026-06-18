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

export default function Playoffs({ data: propData, setData: propSetData }: Props = {}) {
  const { currentSeason } = useGameStore();
  const [simulating, setSimulating] = useState(false);
  const [localData, setLocalData] = useState<PlayoffData | null>(propData ?? null);
  const data = propData !== undefined ? propData : localData;
  const setData = propSetData ?? setLocalData;

function GameCard({ game, label }: { game: PlayoffGame; label?: string }) {
  const homeWon = game.homeScore > game.awayScore;
  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderFaint}`, borderRadius: 6, padding: '10px 14px', marginBottom: 8 }}>
      {label && <div style={{ color: T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{label}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: homeWon ? T.textPrimary : T.textMuted, fontWeight: homeWon ? 700 : 400 }}>{game.home.city} {game.home.name}</span>
        <span style={{ color: homeWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 16 }}>{game.homeScore}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: !homeWon ? T.textPrimary : T.textMuted, fontWeight: !homeWon ? 700 : 400 }}>{game.away.city} {game.away.name}</span>
        <span style={{ color: !homeWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 16 }}>{game.awayScore}</span>
      </div>
    </div>
  );
}

function SeedList({ seeds }: { seeds: PlayoffTeam[] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>SEEDS</div>
      {seeds.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
          <span style={{ color: i === 0 ? '#FF8740' : T.textDim, fontSize: 11, width: 16 }}>{i + 1}</span>
          <span style={{ color: T.textPrimary, flex: 1, fontSize: 13 }}>{t.city} {t.name}</span>
          <span style={{ color: T.textDim, fontSize: 11 }}>{t.wins}W</span>
          {i === 0 && <span style={{ color: '#4caf50', fontSize: 9, fontWeight: 700 }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

export default function Playoffs({ data, setData }: Props) {
  const { currentSeason } = useGameStore();
  const [simulating, setSimulating] = useState(false);

  const handleSimulate = async () => {
    setSimulating(true);
    const result = await window.api.simulatePlayoffs(currentSeason);
    setData(result);
    setSimulating(false);
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 700, margin: 0 }}>{currentSeason} Playoffs</h2>
        <button onClick={handleSimulate} disabled={simulating} style={{
          padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: simulating ? 'not-allowed' : 'pointer',
          background: '#0a1a3a', border: '1px solid #4FC3F7', borderRadius: 4, color: '#4FC3F7',
        }}>
          {simulating ? 'Simulating...' : data ? 'Re-Simulate' : 'Simulate Playoffs'}
        </button>
      </div>

      {!data ? (
        <div style={{ color: T.textDim, fontSize: 13, padding: '40px 0' }}>Click "Simulate Playoffs" to run the bracket.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
            {(['afc', 'nfc'] as const).map(conf => (
              <div key={conf}>
                <div style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>{conf.toUpperCase()}</div>
                <SeedList seeds={data[conf].seeds} />
                <div style={{ color: T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>WILD CARD</div>
                {data[conf].wildCard.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ color: T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>DIVISIONAL</div>
                {data[conf].divisional.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ color: T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>CHAMPIONSHIP</div>
                <GameCard game={data[conf].championship} />
              </div>
            ))}
          </div>
          <div style={{ background: '#0a1020', border: '1px solid #4FC3F7', borderRadius: 8, padding: '20px 24px' }}>
            <div style={{ color: '#4FC3F7', fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>SUPER BOWL</div>
            <GameCard game={data.superBowl} />
            <div style={{ color: '#FFD700', fontSize: 18, fontWeight: 700, marginTop: 12 }}>
              🏆 {data.superBowl.winner.city} {data.superBowl.winner.name}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
