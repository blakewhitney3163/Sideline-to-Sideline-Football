import React from 'react';
import { T } from '../theme';
import { Player, DraftPick, TeamStatus } from './types';
import { pickLabel, calcPickValue } from './tradeUtils';

interface Props {
  myRoster: Player[];
  theirRoster: Player[];
  myPicks: DraftPick[];
  theirPicks: DraftPick[];
  mySelected: number[];
  theirSelected: number[];
  myPicksSelected: number[];
  theirPicksSelected: number[];
  myValue: number;
  theirValue: number;
  canPropose: boolean;
  isPastDeadline: boolean;
  teamStatus: TeamStatus | null;
  result: { accepted: boolean; reason?: string } | null;
  proposing: boolean;
  currentSeason: number;
  onPropose: () => void;
}

export default function TradeSummary({
  myRoster, theirRoster, myPicks, theirPicks,
  mySelected, theirSelected, myPicksSelected, theirPicksSelected,
  myValue, theirValue, canPropose, isPastDeadline,
  teamStatus, result, proposing, currentSeason, onPropose,
}: Props) {
  const threshold = teamStatus?.acceptanceThreshold ?? -8;
  const margin = (myValue - theirValue) - threshold;
  const likelihood = !canPropose ? 'idle' : margin >= 5 ? 'yes' : margin >= -5 ? 'maybe' : 'no';

  const likelihoodText: Record<string, string> = {
    idle:  'Select players or picks from both sides to propose',
    yes:   `✓ ${teamStatus?.status ?? 'CPU'} will likely accept`,
    maybe: `~ Borderline — ${teamStatus?.status ?? 'CPU'} might accept`,
    no:    `✗ ${teamStatus?.status ?? 'CPU'} will likely reject — add more value`,
  };
  const likelihoodColor: Record<string, string> = {
    idle: T.textDim, yes: '#4caf50', maybe: '#FF8740', no: '#e57373',
  };

  const assetRow = (label: string, sub: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
      <span style={{ color: T.textPrimary, fontWeight: 600 }}>{label}</span>
      <span style={{ color: T.textDim, fontSize: 10 }}>{sub}</span>
    </div>
  );

  const empty = (mySelected.length === 0 && myPicksSelected.length === 0);
  const theirEmpty = (theirSelected.length === 0 && theirPicksSelected.length === 0);

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: 14 }}>
      {/* You Offer */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>YOU OFFER</div>
        {empty ? (
          <div style={{ color: T.textDim, fontSize: 12, fontStyle: 'italic' }}>No assets selected</div>
        ) : (
          <>
            {mySelected.map(id => {
              const p = myRoster.find(x => x.id === id);
              return p ? assetRow(`${p.first_name} ${p.last_name}`, `${p.position} · ${p.overall_rating} OVR`) : null;
            })}
            {myPicksSelected.map(id => {
              const pk = myPicks.find(x => x.id === id);
              return pk ? assetRow(`📋 ${pickLabel(pk, currentSeason)}`, `${calcPickValue(pk.round, pk.season, currentSeason)} val`) : null;
            })}
            <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>Value: <strong style={{ color: T.textPrimary }}>{myValue}</strong></div>
          </>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.borderFaint}`, marginBottom: 14 }} />

      {/* You Receive */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>YOU RECEIVE</div>
        {theirEmpty ? (
          <div style={{ color: T.textDim, fontSize: 12, fontStyle: 'italic' }}>No assets selected</div>
        ) : (
          <>
            {theirSelected.map(id => {
              const p = theirRoster.find(x => x.id === id);
              return p ? assetRow(`${p.first_name} ${p.last_name}`, `${p.position} · ${p.overall_rating} OVR`) : null;
            })}
            {theirPicksSelected.map(id => {
              const pk = theirPicks.find(x => x.id === id);
              return pk ? assetRow(`📋 ${pickLabel(pk, currentSeason)}`, `${calcPickValue(pk.round, pk.season, currentSeason)} val`) : null;
            })}
            <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>Value: <strong style={{ color: T.textPrimary }}>{theirValue}</strong></div>
          </>
        )}
      </div>

      {/* Value bar */}
      {canPropose && myValue > 0 && theirValue > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ background: T.bgPanel, borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{
              background: myValue > theirValue ? '#FF8740' : '#4caf50',
              height: '100%',
              width: `${Math.min(100, (myValue / (myValue + theirValue)) * 100)}%`,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textDim }}>
            <span>Give: {myValue}</span>
            <span>Get: {theirValue}</span>
          </div>
        </div>
      )}

      {/* Likelihood */}
      <div style={{ color: likelihoodColor[likelihood], fontSize: 11, marginBottom: 12, lineHeight: 1.4 }}>
        {likelihoodText[likelihood]}
      </div>

      {/* Propose button */}
      <button
        onClick={onPropose}
        disabled={!canPropose || proposing || isPastDeadline}
        style={{
          width: '100%', padding: '8px 0', fontWeight: 700, fontSize: 12, borderRadius: 5,
          background: !canPropose || isPastDeadline ? T.bgPanel : T.bgGreen,
          border: `1px solid ${!canPropose || isPastDeadline ? T.borderFaint : '#2a4a2a'}`,
          color: !canPropose || isPastDeadline ? T.textDim : '#4caf50',
          cursor: !canPropose || proposing || isPastDeadline ? 'not-allowed' : 'pointer',
        }}
      >
        {proposing ? 'Proposing...' : isPastDeadline ? 'DEADLINE PASSED' : 'Propose Trade'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 5, fontSize: 12,
          background: result.accepted ? T.bgGreen : T.bgRed,
          color: result.accepted ? '#4caf50' : '#e57373',
          border: `1px solid ${result.accepted ? '#2a4a2a' : '#4a1a1a'}`,
        }}>
          {result.accepted ? '✓ Trade accepted! Rosters updated.' : `✗ ${result.reason}`}
        </div>
      )}
    </div>
  );
}
