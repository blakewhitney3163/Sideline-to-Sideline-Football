import React from 'react';
import { T } from '../theme';
import { BoxScoreData, BoxScorePlayer } from './types';

function SectionHeader({ cols }: { cols: string[] }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9,
      color: T.textDim, letterSpacing: 1, padding: '0 0 3px 0',
      borderBottom: `1px solid ${T.borderMid}`, marginBottom: 3 }}>
      <span>PLAYER</span>
      <span style={{ fontFamily: 'monospace' }}>{cols.join('  ')}</span>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>{title}</div>
      {children}
    </div>
  );
}

function StatRow({ name, line }: { name: string; line: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
      <span style={{ color: T.textMuted }}>{name}</span>
      <span style={{ color: T.textPrimary, fontFamily: 'monospace' }}>{line}</span>
    </div>
  );
}

function TeamStats({ teamName, players }: { teamName: string; players: BoxScorePlayer[] }) {
  const passers   = players.filter(p => p.pass_attempts > 0).sort((a, b) => b.pass_yards - a.pass_yards);
  const rushers   = players.filter(p => p.rush_attempts > 0).sort((a, b) => b.rush_yards - a.rush_yards).slice(0, 3);
  const receivers = players.filter(p => p.targets > 0).sort((a, b) => b.rec_yards - a.rec_yards).slice(0, 4);
  const nickname  = teamName.split(' ').pop()?.toUpperCase() ?? teamName;

  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>{nickname}</div>
      {passers.length > 0 && (
        <StatSection title="PASSING">
          <SectionHeader cols={['CMP/ATT', 'YDS', 'TD', 'INT']} />
          {passers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.completions}/${p.pass_attempts}  ${p.pass_yards}  ${p.pass_tds}  ${p.interceptions}`} />
          ))}
        </StatSection>
      )}
      {rushers.length > 0 && (
        <StatSection title="RUSHING">
          <SectionHeader cols={['CAR', 'YDS', 'TD']} />
          {rushers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.rush_attempts}  ${p.rush_yards}  ${p.rush_tds}`} />
          ))}
        </StatSection>
      )}
      {receivers.length > 0 && (
        <StatSection title="RECEIVING">
          <SectionHeader cols={['REC/TGT', 'YDS', 'TD']} />
          {receivers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.receptions}/${p.targets}  ${p.rec_yards}  ${p.rec_tds}`} />
          ))}
        </StatSection>
      )}
    </div>
  );
}

export default function BoxScore({ data }: { data: BoxScoreData }) {
  const { game, players } = data;
  const homeWon = game.home_score > game.away_score;

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { name: game.home_team, score: game.home_score, won: homeWon,  side: 'HOME' },
          { name: game.away_team, score: game.away_score, won: !homeWon, side: 'AWAY' },
        ].map((t, i) => (
          <div key={i} style={{ flex: 1, background: T.bgCard, borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>{t.side}</div>
            <div style={{ color: t.won ? '#4caf50' : T.textPrimary, fontWeight: 700, fontSize: 14 }}>{t.name}</div>
            <div style={{ color: t.won ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 24 }}>{t.score}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TeamStats teamName={game.home_team} players={players.filter(p => p.team_id === game.home_team_id)} />
        <TeamStats teamName={game.away_team} players={players.filter(p => p.team_id === game.away_team_id)} />
      </div>
    </div>
  );
}
