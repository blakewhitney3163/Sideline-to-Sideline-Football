import React, { useState } from 'react';
import { useGameStore } from './store/gameStore';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayoffTeam { id: number; city: string; name: string; wins: number; }
interface PlayoffGame {
  home: PlayoffTeam; away: PlayoffTeam;
  homeScore: number; awayScore: number;
  winner: PlayoffTeam;
}
interface ConferenceBracket {
  seeds: PlayoffTeam[];
  wildCard: PlayoffGame[];    // [2v7, 3v6, 4v5]
  divisional: PlayoffGame[];  // [seed1 vs wc2w, wc0w vs wc1w]
  championship: PlayoffGame;
}
interface PlayoffData {
  afc: ConferenceBracket;
  nfc: ConferenceBracket;
  gridironCup: PlayoffGame;
}
interface Props {
  data?: PlayoffData | null;
  setData?: (d: PlayoffData) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const SLOT    = 82;               // px per bracket slot
const CONF_H  = 4 * SLOT;         // 328px — total bracket height
const CARD_H  = 66;               // game card height
const CARD_PAD = (SLOT - CARD_H) / 2;  // 8px — vertical offset within slot
const COL_W   = 250;              // round column width
const GAP     = 20;               // gap between columns (connector lane)
const BRKT_W  = COL_W * 3 + GAP * 2; // 790px total bracket width

// Slot center y-coordinates
const slotCY  = (i: number) => i * SLOT + SLOT / 2;
const WC_CY   = [0, 1, 2, 3].map(slotCY);            // [41, 123, 205, 287]
const DIV_CY  = [
  (WC_CY[0] + WC_CY[1]) / 2,  // 82  — top divisional
  (WC_CY[2] + WC_CY[3]) / 2,  // 246 — bottom divisional
];
const CHAMP_CY = (DIV_CY[0] + DIV_CY[1]) / 2;        // 164

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seed(seeds: PlayoffTeam[], teamId: number) {
  const i = seeds.findIndex(s => s.id === teamId);
  return i >= 0 ? i + 1 : 0;
}

// ─── Team row inside a game card ──────────────────────────────────────────────

function TeamRow({ team, score, won, s, isUser }: {
  team: PlayoffTeam; score: number; won: boolean; s: number; isUser: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 6 }}>
      <span style={{
        color: '#2a2a2a', fontSize: 9, fontWeight: 700,
        width: 12, textAlign: 'right', flexShrink: 0,
      }}>
        {s > 0 ? s : ''}
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

// ─── Game card ────────────────────────────────────────────────────────────────

function GameCard({ game, seeds, userTeamId, style }: {
  game: PlayoffGame; seeds: PlayoffTeam[]; userTeamId: number;
  style?: React.CSSProperties;
}) {
  const homeWon = game.winner.id === game.home.id;
  return (
    <div style={{
      height: CARD_H,
      background: '#0e0e0e', border: '1px solid #1e1e1e',
      borderRadius: 5, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      ...style,
    }}>
      <TeamRow
        team={game.home} score={game.homeScore} won={homeWon}
        s={seed(seeds, game.home.id)} isUser={game.home.id === userTeamId}
      />
      <div style={{ height: 1, background: '#1a1a1a', margin: '0 6px' }} />
      <TeamRow
        team={game.away} score={game.awayScore} won={!homeWon}
        s={seed(seeds, game.away.id)} isUser={game.away.id === userTeamId}
      />
    </div>
  );
}

// ─── Bye card (seed 1) ────────────────────────────────────────────────────────

function ByeCard({ team, seeds, userTeamId }: {
  team: PlayoffTeam; seeds: PlayoffTeam[]; userTeamId: number;
}) {
  const s = seed(seeds, team.id);
  const isUser = team.id === userTeamId;
  return (
    <div style={{
      height: CARD_H,
      background: '#080808', border: '1px dashed #1a1a1a',
      borderRadius: 5,
      display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6,
    }}>
      <span style={{ color: '#2a2a2a', fontSize: 9, fontWeight: 700, width: 12, textAlign: 'right' }}>{s}</span>
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
  const m1     = wcR  + GAP / 2;   // midpoint between WC and DIV
  const m2     = divR + GAP / 2;   // midpoint between DIV and CHAMP

  const [wc0, wc1, wc2, byeY] = WC_CY;
  const [d0, d1] = DIV_CY;  // d0=top pair, d1=bottom pair
  const ch = CHAMP_CY;

  return (
    <svg
      width={BRKT_W} height={CONF_H}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      {/* ── WC pair 0+1 (2v7 & 3v6) → top divisional ── */}
      <line x1={wcR} y1={wc0} x2={m1} y2={wc0} stroke={stroke} strokeWidth={sw} />
      <line x1={wcR} y1={wc1} x2={m1} y2={wc1} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={wc0} x2={m1} y2={wc1} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={d0}  x2={divL} y2={d0} stroke={stroke} strokeWidth={sw} />

      {/* ── WC pair 2+bye (4v5 & seed1) → bottom divisional ── */}
      <line x1={wcR} y1={wc2}  x2={m1} y2={wc2}  stroke={stroke} strokeWidth={sw} />
      <line x1={wcR} y1={byeY} x2={m1} y2={byeY} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={wc2}  x2={m1} y2={byeY} stroke={stroke} strokeWidth={sw} />
      <line x1={m1}  y1={d1}   x2={divL} y2={d1}  stroke={stroke} strokeWidth={sw} />

      {/* ── DIV pair → championship ── */}
      <line x1={divR} y1={d0} x2={m2} y2={d0} stroke={stroke} strokeWidth={sw} />
      <line x1={divR} y1={d1} x2={m2} y2={d1} stroke={stroke} strokeWidth={sw} />
      <line x1={m2}   y1={d0} x2={m2} y2={d1} stroke={stroke} strokeWidth={sw} />
      <line x1={m2}   y1={ch} x2={champL} y2={ch} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}

// ─── Conference bracket ───────────────────────────────────────────────────────

function ConferenceBracket({ bracket, label, userTeamId }: {
  bracket: ConferenceBracket; label: string; userTeamId: number;
}) {
  const { seeds, wildCard, divisional, championship } = bracket;

  const wcTop    = (slot: number) => slot * SLOT + CARD_PAD;
  const divTop   = (idx: number)  => DIV_CY[idx] - CARD_H / 2;
  const champTop = CHAMP_CY - CARD_H / 2;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Round column labels */}
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

      {/* Bracket canvas */}
      <div style={{ position: 'relative', height: CONF_H, width: BRKT_W }}>
        <BracketLines />

        {/* Wild Card — 3 games + bye */}
        <div style={{ position: 'absolute', left: 0, top: wcTop(0), width: COL_W }}>
          <GameCard game={wildCard[0]} seeds={seeds} userTeamId={userTeamId} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(1), width: COL_W }}>
          <GameCard game={wildCard[1]} seeds={seeds} userTeamId={userTeamId} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(2), width: COL_W }}>
          <GameCard game={wildCard[2]} seeds={seeds} userTeamId={userTeamId} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: wcTop(3), width: COL_W }}>
          <ByeCard team={seeds[0]} seeds={seeds} userTeamId={userTeamId} />
        </div>

        {/* Divisional
            divisional[1] = WC[0]w vs WC[1]w  → top pair → DIV_CY[0]
            divisional[0] = seed1  vs WC[2]w  → bot pair → DIV_CY[1] */}
        <div style={{ position: 'absolute', left: COL_W + GAP, top: divTop(0), width: COL_W }}>
          <GameCard game={divisional[1]} seeds={seeds} userTeamId={userTeamId} />
        </div>
        <div style={{ position: 'absolute', left: COL_W + GAP, top: divTop(1), width: COL_W }}>
          <GameCard game={divisional[0]} seeds={seeds} userTeamId={userTeamId} />
        </div>

        {/* Championship */}
        <div style={{ position: 'absolute', left: (COL_W + GAP) * 2, top: champTop, width: COL_W }}>
          <GameCard game={championship} seeds={seeds} userTeamId={userTeamId} />
        </div>
      </div>
    </div>
  );
}

// ─── Gridiron Cup ─────────────────────────────────────────────────────────────

function GridironCup({ game, afcSeeds, nfcSeeds, userTeamId }: {
  game: PlayoffGame; afcSeeds: PlayoffTeam[]; nfcSeeds: PlayoffTeam[]; userTeamId: number;
}) {
  const homeWon = game.winner.id === game.home.id;
  const allSeeds = [...afcSeeds, ...nfcSeeds];

  const Block = ({ team, score, won }: { team: PlayoffTeam; score: number; won: boolean }) => (
    <div style={{
      flex: 1, textAlign: 'center', padding: '14px 16px', borderRadius: 6,
      background: won ? 'rgba(255,215,0,0.04)' : 'transparent',
      border: won ? '1px solid rgba(255,215,0,0.15)' : '1px solid transparent',
    }}>
      <div style={{ color: '#333', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
        #{seed(allSeeds, team.id)} SEED
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, marginBottom: 10,
        color: team.id === userTeamId ? '#FF8740' : won ? '#FFD700' : '#555',
      }}>
        {team.city} {team.name}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color: won ? '#fff' : '#222' }}>
        {score}
      </div>
      {won && (
        <div style={{ fontSize: 10, color: '#FFD700', marginTop: 8, letterSpacing: 1 }}>
          🏆 GRIDIRON CUP CHAMPION
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      width: BRKT_W, marginBottom: 12,
      background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8,
      padding: '12px 20px',
    }}>
      <div style={{ textAlign: 'center', color: '#2a2a2a', fontSize: 9, letterSpacing: 2, marginBottom: 10 }}>
        GRIDIRON CUP
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Block team={game.home} score={game.homeScore} won={homeWon} />
        <div style={{ color: '#1e1e1e', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>vs</div>
        <Block team={game.away} score={game.awayScore} won={!homeWon} />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function Playoffs({ data: propData, setData: propSetData }: Props = {}) {
  const { currentSeason, userTeam } = useGameStore();
  const [simulating, setSimulating] = useState(false);
  const [localData, setLocalData]   = useState<PlayoffData | null>(propData ?? null);

  const data    = propData    !== undefined ? propData    : localData;
  const setData = propSetData !== undefined ? propSetData : setLocalData;
  const userTeamId = userTeam?.id ?? -1;

  const handleSimulate = async () => {
    setSimulating(true);
    const result = await window.api.simulatePlayoffs(currentSeason);
    setData(result);
    setSimulating(false);
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
            {currentSeason} Playoffs
          </h1>
          <p style={{ color: '#444', fontSize: 12, margin: '2px 0 0' }}>
            14 teams · Wild Card → Divisional → Conference Championship → Gridiron Cup
          </p>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          style={{
            marginLeft: 'auto', padding: '8px 20px',
            background: simulating ? '#141414' : '#FF8740',
            border: 'none', borderRadius: 5,
            color: simulating ? '#444' : '#000',
            fontWeight: 700, fontSize: 12,
            cursor: simulating ? 'not-allowed' : 'pointer',
          }}
        >
          {simulating ? 'Simulating…' : data ? 'Re-Simulate' : 'Simulate Playoffs'}
        </button>
      </div>

      {!data ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#2a2a2a', fontSize: 14 }}>
          Click "Simulate Playoffs" to run the bracket.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <ConferenceBracket bracket={data.afc} label="AFC" userTeamId={userTeamId} />
          <GridironCup
            game={data.gridironCup}
            afcSeeds={data.afc.seeds}
            nfcSeeds={data.nfc.seeds}
            userTeamId={userTeamId}
          />
          <ConferenceBracket bracket={data.nfc} label="NFC" userTeamId={userTeamId} />
        </div>
      )}

    </div>
  );
}
