import React, { useState } from 'react';
import { T } from './theme';

declare const window: any;

interface PlayoffTeam {
  id: number;
  city: string;
  name: string;
  wins: number;
}

interface PlayoffGame {
  home: PlayoffTeam;
  away: PlayoffTeam;
  homeScore: number;
  awayScore: number;
  winner: PlayoffTeam;
}

interface ConferenceBracket {
  seeds: PlayoffTeam[];
  wildCard: PlayoffGame[];
  divisional: PlayoffGame[];
  championship: PlayoffGame;
}

interface PlayoffData {
  afc: ConferenceBracket;
  nfc: ConferenceBracket;
  superBowl: PlayoffGame;
}

interface Props {
  data: PlayoffData | null;
  setData: (data: PlayoffData) => void;
  currentSeason: number;
}

function GameCard({ game, label }: { game: PlayoffGame; label?: string }) {
  const homeWon = game.homeScore > game.awayScore;
  return (
    <div style={{ background: '#12122a', borderRadius: '6px', padding: '10px 12px', marginBottom: '8px' }}>
      {label && <div style={{ color: T.textMuted, fontSize: '10px', marginBottom: '6px', textTransform: 'uppercase' }}>{label}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ color: homeWon ? '#fff' : T.textMuted, fontSize: '13px' }}>{game.home.city} {game.home.name}</span>
        <span style={{ color: homeWon ? '#4FC3F7' : T.textSecondary, fontWeight: 'bold' }}>{game.homeScore}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: !homeWon ? '#fff' : T.textMuted, fontSize: '13px' }}>{game.away.city} {game.away.name}</span>
        <span style={{ color: !homeWon ? '#4FC3F7' : T.textSecondary, fontWeight: 'bold' }}>{game.awayScore}</span>
      </div>
    </div>
  );
}

function SeedList({ seeds }: { seeds: PlayoffTeam[] }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: T.textMuted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px' }}>SEEDS</div>
      {seeds.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', fontSize: '12px' }}>
          <span style={{ color: T.textMuted, width: '16px' }}>{i + 1}</span>
          <span style={{ color: T.textPrimary, flex: 1 }}>{t.city} {t.name}</span>
          <span style={{ color: T.textSecondary }}>{t.wins}W</span>
          {i === 0 && <span style={{ color: '#FFD700', fontSize: '10px' }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

export default function Playoffs({ data, setData, currentSeason }: Props) {
  const [simulating, setSimulating] = useState(false);

  const handleSimulate = async () => {
    setSimulating(true);
    const result = await window.api.simulatePlayoffs(currentSeason);
    setData(result);
    setSimulating(false);
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ color: '#4FC3F7', margin: 0 }}>{currentSeason} Playoffs</h2>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          style={{
            padding: '10px 20px', background: simulating ? T.borderStrong : '#FF8740',
            border: 'none', borderRadius: '6px',
            color: simulating ? T.textSecondary : '#000',
            fontWeight: 'bold', cursor: simulating ? 'not-allowed' : 'pointer', fontSize: '13px',
          }}
        >
          {simulating ? 'Simulating...' : data ? 'Re-Simulate' : 'Simulate Playoffs'}
        </button>
      </div>

      {!data ? (
        <div style={{ color: T.textMuted, textAlign: 'center', marginTop: '60px' }}>
          Click "Simulate Playoffs" to run the bracket.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            {(['afc', 'nfc'] as const).map(conf => (
              <div key={conf} style={{ background: '#0f0f23', border: `1px solid ${T.borderStrong}`, borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ color: '#FF8740', marginBottom: '12px', fontSize: '13px', letterSpacing: '1px' }}>{conf.toUpperCase()}</h3>
                <SeedList seeds={data[conf].seeds} />
                <div style={{ color: T.textMuted, fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px' }}>WILD CARD</div>
                {data[conf].wildCard.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ color: T.textMuted, fontSize: '10px', textTransform: 'uppercase', margin: '10px 0 6px' }}>DIVISIONAL</div>
                {data[conf].divisional.map((g, i) => <GameCard key={i} game={g} />)}
                <div style={{ color: T.textMuted, fontSize: '10px', textTransform: 'uppercase', margin: '10px 0 6px' }}>CHAMPIONSHIP</div>
                <GameCard game={data[conf].championship} />
              </div>
            ))}
          </div>

          <div style={{ background: '#0f0f23', border: '2px solid #FFD700', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
            <div style={{ color: '#FFD700', fontSize: '12px', letterSpacing: '2px', marginBottom: '8px' }}>SUPER BOWL</div>
            <GameCard game={data.superBowl} />
            <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '16px', marginTop: '10px' }}>
              🏆 {data.superBowl.winner.city} {data.superBowl.winner.name}
            </div>
          </div>
        </>
      )}
    </div>
  );
}