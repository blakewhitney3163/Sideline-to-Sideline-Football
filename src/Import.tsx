import React, { useState } from 'react';
import { T } from './theme';

declare const window: any;

type ImportStatus = 'idle' | 'running' | 'done' | 'error';
interface ImportState { status: ImportStatus; message: string; }
const IDLE: ImportState = { status: 'idle', message: '' };

function formatResult(res: any): string {
  if (res.imported !== undefined && res.skipped !== undefined) {
    return `${res.imported} rows imported. ${res.skipped} skipped (no matching player).`;
  }
  if (res.imported !== undefined && res.contractsGenerated !== undefined) {
    return `${res.imported} players imported. Contracts ${res.contractsGenerated ? 'auto-generated from ratings' : 'loaded from CSV'}.`;
  }
  if (res.imported !== undefined) return `${res.imported} rows imported successfully.`;
  return 'Import complete.';
}

export default function Import() {
  const [teams,          setTeams]          = useState<ImportState>(IDLE);
  const [players,        setPlayers]        = useState<ImportState>(IDLE);
  const [careerStats,    setCareerStats]    = useState<ImportState>(IDLE);
  const [alltimeRecords, setAlltimeRecords] = useState<ImportState>(IDLE);
  const [seasonRecords,  setSeasonRecords]  = useState<ImportState>(IDLE);

  const run = async (
    apiFn: () => Promise<any>,
    set: React.Dispatch<React.SetStateAction<ImportState>>
  ) => {
    set({ status: 'running', message: '' });
    try {
      const res = await apiFn();
      if (res.success) {
        set({ status: 'done', message: formatResult(res) });
      } else if (res.reason === 'Cancelled') {
        set(IDLE);
      } else {
        set({ status: 'error', message: res.reason ?? 'Unknown error' });
      }
    } catch (e: any) {
      set({ status: 'error', message: e.message ?? 'Unknown error' });
    }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 780, margin: '0 auto', fontFamily: 'monospace' }}>
      <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, marginBottom: 6 }}>GRIDIRON DYNASTY</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#4FC3F7', letterSpacing: 3, marginBottom: 4 }}>
        CUSTOM DATA IMPORT
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, letterSpacing: 1 }}>
        Replace generated content with your own CSV data.
      </div>
      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 32, lineHeight: 1.8 }}>
        Recommended order: <strong style={{ color: T.textMuted }}>Teams</strong> → <strong style={{ color: T.textMuted }}>Players</strong> → <strong style={{ color: T.textMuted }}>Career Stats</strong> → <strong style={{ color: T.textMuted }}>Records</strong>.
      </div>

      <ImportCard
        title="CUSTOM TEAMS"
        badge="STEP 1"
        description="Replace all default teams with teams from a CSV. This triggers a full dynasty reset — all season data, players, contracts, and history will be cleared and regenerated for your new teams."
        warning="FULL RESET — all current dynasty data will be erased. You will need to select a team again after importing."
        hint="Required columns: city, name, abbreviation, conference, division"
        docsLink="See docs/csv-schema.md for full schema and example."
        state={teams}
        onImport={() => run(() => window.api.importCustomTeams(), setTeams)}
        onReset={() => setTeams(IDLE)}
      />

      <ImportCard
        title="CUSTOM PLAYERS / ROSTER"
        badge="STEP 2"
        description="Replace all players and contracts with a custom roster from a CSV. Teams remain unchanged. If annual_salary and years_remaining columns are present they are used directly; otherwise contracts are auto-generated from ratings."
        warning="CLEARS all players, contracts, depth charts, and career history across every team."
        hint="Required: first_name, last_name, position. Key optional: team_abbreviation (blank or FA for free agents), age, overall_rating, dev_trait, speed, strength, awareness, throw_accuracy, throw_power, catching, route_running, tackle_rating, coverage, pass_rush, kickpower, kickaccuracy, runblocking, passblocking, annual_salary, years_remaining."
        docsLink="See docs/csv-schema.md for full schema and example."
        state={players}
        onImport={() => run(() => window.api.importCustomPlayers(), setPlayers)}
        onReset={() => setPlayers(IDLE)}
      />

      <ImportCard
        title="CAREER STATS"
        badge="STEP 3"
        description="Seed historical per-season career stat lines for imported players. Each row is matched to a player by first and last name. Rows with no matching player are skipped and reported."
        warning="Overwrites existing career stat entries for any matched player + season combination."
        hint="Required: first_name, last_name, season. Optional: games, pass_yards, pass_tds, interceptions, completions, pass_attempts, rush_yards, rush_tds, rush_attempts, targets, receptions, rec_yards, rec_tds, tackles, assisted_tackles, sacks, tfl, forced_fumbles, fumble_recoveries, def_interceptions, pass_deflections, def_tds, team_abbreviation."
        docsLink="See docs/csv-schema.md for full schema and example."
        state={careerStats}
        onImport={() => run(() => window.api.importCareerStats(), setCareerStats)}
        onReset={() => setCareerStats(IDLE)}
      />

      <ImportCard
        title="ALL-TIME RECORDS"
        badge="STEP 4"
        description="Replace the all-time leaderboard benchmarks shown on the Records tab — career passing yards, rushing yards, receiving yards, TDs, tackles, sacks, and defensive INTs."
        warning="Replaces all existing all-time record entries."
        hint="Required: category, rank, player_name. Key optional: team_display, position, games_played, pass_yards, rush_yards, rec_yards, pass_tds, rec_tds, rush_tds, tackles, assisted_tackles, sacks, def_interceptions, pass_deflections, forced_fumbles."
        docsLink="Valid categories: passing, rushing, receiving, passTds, tds, tackles, sacks, defInts. See docs/csv-schema.md."
        state={alltimeRecords}
        onImport={() => run(() => window.api.importHistoricalRecords('alltime'), setAlltimeRecords)}
        onReset={() => setAlltimeRecords(IDLE)}
      />

      <ImportCard
        title="SEASON RECORDS"
        badge="STEP 5"
        description="Replace the single-season record benchmarks shown on the Records tab. These represent the best individual season performances of all time."
        warning="Replaces all existing season record entries."
        hint="Required: category, rank, player_name, season. Same stat columns as All-Time Records."
        docsLink="Valid categories: passing, rushing, receiving, passTds, tds, tackles, sacks, defInts. See docs/csv-schema.md."
        state={seasonRecords}
        onImport={() => run(() => window.api.importHistoricalRecords('season'), setSeasonRecords)}
        onReset={() => setSeasonRecords(IDLE)}
      />
    </div>
  );
}

// ─── Import Card ──────────────────────────────────────────────────────────────

interface CardProps {
  title: string;
  badge: string;
  description: string;
  warning: string;
  hint: string;
  docsLink: string;
  state: ImportState;
  onImport: () => void;
  onReset: () => void;
}

function ImportCard({ title, badge, description, warning, hint, docsLink, state, onImport, onReset }: CardProps) {
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.borderFaint}`,
      borderRadius: 6,
      padding: 24,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: '#4FC3F7' }}>{title}</div>
        <div style={{
          fontSize: 9, letterSpacing: 2, fontWeight: 700,
          color: '#4FC3F7', background: '#0d2233',
          border: '1px solid #4FC3F7', borderRadius: 2,
          padding: '2px 6px',
        }}>
          {badge}
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.8, marginBottom: 12 }}>
        {description}
      </div>

      <div style={{
        fontSize: 10, letterSpacing: 1, color: '#e57373',
        background: '#2a1010', border: '1px solid #5a2020',
        borderRadius: 3, padding: '6px 10px', marginBottom: 12,
      }}>
        ⚠ {warning}
      </div>

      <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.7, marginBottom: 6, fontStyle: 'italic' }}>
        {hint}
      </div>
      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 20 }}>{docsLink}</div>

      {state.status === 'idle' && (
        <button onClick={onImport} style={{
          padding: '10px 20px', fontSize: 11, fontWeight: 'bold', letterSpacing: 2,
          background: '#1a2a1a', color: '#4caf50',
          border: '1px solid #4caf50', borderRadius: 4,
          cursor: 'pointer', fontFamily: 'monospace',
        }}>
          SELECT CSV &amp; IMPORT
        </button>
      )}

      {state.status === 'running' && (
        <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 2 }}>IMPORTING...</div>
      )}

      {state.status === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 11, color: '#4caf50' }}>✓ {state.message}</div>
          <button onClick={onReset} style={{
            fontSize: 10, color: T.textDim, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace',
          }}>
            import again
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#e57373', lineHeight: 1.6 }}>✗ {state.message}</div>
          <button onClick={onReset} style={{
            width: 'fit-content', fontSize: 10, color: T.textDim, background: 'none',
            border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace',
          }}>
            try again
          </button>
        </div>
      )}
    </div>
  );
}
