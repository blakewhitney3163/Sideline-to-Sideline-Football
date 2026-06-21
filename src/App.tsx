import React, { useState, lazy, Suspense } from 'react';
import { T } from './theme';
import { useGameStore, UserTeam } from './store/gameStore';

declare const window: any;

const Home    = lazy(() => import('./Home'));
const MyTeam  = lazy(() => import('./MyTeam'));
const League  = lazy(() => import('./League'));
const Trades  = lazy(() => import('./Trades'));
const Draft   = lazy(() => import('./Draft'));
const NewsFeed = lazy(() => import('./newsCenter/NewsFeed'));
const Import  = lazy(() => import('./Import'));
const TeamSelection = lazy(() => import('./TeamSelection'));
const SavePicker    = lazy(() => import('./SavePicker'));
const MeetTheTeam   = lazy(() => import('./MeetTheTeam'));

type Tab = 'home' | 'myteam' | 'league' | 'trades' | 'draft' | 'news' | 'import';
type Screen = 'main-menu' | 'loading' | 'custom-setup' | 'save-picker' | 'team-select' | 'setup' | 'meet-team' | 'game';

interface SetupStep { label: string; done: boolean; }
type ImportStatus = 'idle' | 'running' | 'done' | 'error';
interface ImportState { status: ImportStatus; message: string; }
const IDLE: ImportState = { status: 'idle', message: '' };

const TAB_MAP: Record<string, Tab> = {
  franchise: 'myteam',
  depth:     'myteam',
  standings: 'league',
  teams:     'league',
  schedule:  'league',
  stats:     'league',
  records:   'league',
  playoffs:  'league',
};

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'home',   label: 'Home' },
  { id: 'myteam', label: 'My Team' },
  { id: 'league', label: 'League' },
  { id: 'trades', label: 'Trades' },
  { id: 'news',   label: '📰 News' },
  { id: 'import', label: 'Import' },
];

function TabFallback() {
  return (
    <div style={{ color: T.textMuted, padding: 40, textAlign: 'center', fontFamily: 'monospace' }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('main-menu');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['home']));
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [dynastyName, setDynastyName] = useState('');
const [dynastyNameFocused, setDynastyNameFocused] = useState(false);
  const [importTeams, setImportTeams] = useState<ImportState>(IDLE);
  const [importPlayers, setImportPlayers] = useState<ImportState>(IDLE);

  const {
    currentSeason, setCurrentSeason,
    userTeam, setUserTeam,
    playoffsComplete, setPlayoffsComplete,
    difficulty, setDifficulty,
    advanceSeason,
  } = useGameStore();

  const handleTabChange = (tab: string) => {
    const resolved = (TAB_MAP[tab] ?? tab) as Tab;
    setActiveTab(resolved);
    setMountedTabs(prev => new Set([...prev, resolved]));
  };

  const markStep = (label: string, done: boolean) => {
    setSetupSteps(prev => {
      const existing = prev.find(s => s.label === label);
      if (existing) return prev.map(s => s.label === label ? { ...s, done } : s);
      return [...prev, { label, done }];
    });
  };

  const runSetup = async () => {
    markStep('Finalizing dynasty setup...', false);
    await window.api.balanceRosters();
    await new Promise(r => setTimeout(r, 800));
    markStep('Finalizing dynasty setup...', true);
    setSetupComplete(true);
    setTimeout(() => setScreen('meet-team'), 1200);
  };

  const handleDifficultyChange = async (level: 'easy' | 'normal' | 'hard') => {
    setDifficulty(level);
    await window.api.setDifficulty(level);
  };

  const handleNewGame = async (mode: 'standard' | 'custom') => {
    const name = dynastyName.trim() || 'Dynasty';
    setScreen('loading');
    await window.api.openSave(name);
    await window.api.resetSave();
    if (mode === 'standard') {
      setScreen('team-select');
    } else {
      setImportTeams(IDLE);
      setImportPlayers(IDLE);
      setScreen('custom-setup');
    }
  };

  const handleSaveLoaded = async () => {
    setScreen('loading');
    const [season, team, offseason, diff] = await Promise.all([
      window.api.getCurrentSeason(),
      window.api.getUserTeam(),
      window.api.getOffseasonStatus(),
      window.api.getDifficulty(),
    ]);
    setCurrentSeason(season);
    setPlayoffsComplete(offseason.playoffsComplete ?? false);
    setDifficulty(diff as any);
    if (!team) {
      setScreen('team-select');
    } else {
      setUserTeam(team);
      setScreen('game');
    }
  };

  const handleTeamSelect = async (team: UserTeam) => {
    setUserTeam(team);
    setScreen('setup');
    setSetupSteps([]);
    setSetupComplete(false);
    setMountedTabs(new Set(['home']));
    setActiveTab('home');
    await window.api.setUserTeam(team.id);
    runSetup();
  };

  const handleSeasonAdvance = (nextSeason: number) => {
    advanceSeason(nextSeason);
    setActiveTab('home');
  };

  const runImport = async (
    apiFn: () => Promise<any>,
    set: React.Dispatch<React.SetStateAction<ImportState>>
  ) => {
    set({ status: 'running', message: '' });
    try {
      const res = await apiFn();
      if (res.success) {
        const msg = res.imported !== undefined
          ? `${res.imported} rows imported.${res.contractsGenerated ? ' Contracts auto-generated.' : ''}`
          : 'Import complete.';
        set({ status: 'done', message: msg });
      } else if (res.reason === 'Cancelled') {
        set(IDLE);
      } else {
        set({ status: 'error', message: res.reason ?? 'Unknown error' });
      }
    } catch (e: any) {
      set({ status: 'error', message: e.message ?? 'Unknown error' });
    }
  };

  const tabs = playoffsComplete
    ? [
        ...BASE_TABS.filter(t => t.id !== 'news' && t.id !== 'import'),
        { id: 'draft' as Tab, label: '⚡ Draft' },
        { id: 'news'   as Tab, label: '📰 News' },
        { id: 'import' as Tab, label: 'Import' },
      ]
    : BASE_TABS;

  const isMounted = (id: Tab) => mountedTabs.has(id);
  const tabStyle = (id: Tab): React.CSSProperties => activeTab === id ? {} : { display: 'none' };

  // ── Main Menu ─────────────────────────────────────────────────────────────
  if (screen === 'main-menu') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgDark, gap: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, marginBottom: 4, fontFamily: 'monospace' }}>DYNASTY SIMULATOR</div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 6, color: '#fff', fontFamily: 'monospace' }}>GRIDIRON</div>
        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 6, color: '#FF8740', fontFamily: 'monospace', marginBottom: 32 }}>DYNASTY</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 24 }}>
  <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, fontFamily: 'monospace' }}>DYNASTY NAME</div>
  <input
    value={dynastyName}
    onChange={e => setDynastyName(e.target.value)}
    onFocus={() => setDynastyNameFocused(true)}
    onBlur={() => setDynastyNameFocused(false)}
    placeholder="My Dynasty"
    maxLength={40}
    style={{
      background: T.bgCard,
      border: `1px solid ${dynastyNameFocused ? '#FF8740' : T.borderStrong}`,
      boxShadow: dynastyNameFocused ? '0 0 0 2px rgba(255,135,64,0.25)' : 'none',
      color: '#fff', fontFamily: 'monospace', fontSize: 14,
      padding: '10px 16px', borderRadius: 4, outline: 'none',
      width: 240, textAlign: 'center', letterSpacing: 1,
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
  />
  <div style={{ fontSize: 9, color: T.textDim, fontFamily: 'monospace' }}>name your save file</div>
</div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <MenuButton label="NEW DYNASTY" sub="Standard start" color="#4caf50" onClick={() => handleNewGame('standard')} />
          <MenuButton label="CUSTOM DYNASTY" sub="Import teams & rosters" color="#4FC3F7" onClick={() => handleNewGame('custom')} />
        </div>

        <button
          onClick={() => setScreen('save-picker')}
          style={{
            marginTop: 8, padding: '12px 28px', fontSize: 12, fontWeight: 'bold',
            letterSpacing: 2, background: 'transparent', color: T.textMuted,
            border: `1px solid ${T.borderFaint}`, borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          LOAD DYNASTY
        </button>
        <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'monospace' }}>Continue a saved game</div>
      </div>
    );
  }

  if (screen === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgDark, color: T.textMuted, fontFamily: 'monospace', fontSize: 14, letterSpacing: 3 }}>
        LOADING...
      </div>
    );
  }

  if (screen === 'custom-setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgDark, gap: 16, padding: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: T.textDim, fontFamily: 'monospace' }}>CUSTOM DYNASTY SETUP</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{dynastyName.trim() || 'Dynasty'}</div>
        <div style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
          Optionally import custom teams and players before you pick your team.
          Both imports are optional — skip either to use the default generated content.
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <SetupImportCard
            step="1" title="Custom Teams" description="Import team names, cities, and conferences." warning="Replaces all 32 default teams."
            state={importTeams}
            onImport={() => runImport(() => window.api.importCustomTeams(), setImportTeams)}
            onReset={() => setImportTeams(IDLE)}
          />
          <SetupImportCard
            step="2" title="Custom Players" description="Import a full roster for every team." warning="Replaces all generated players."
            state={importPlayers}
            onImport={() => runImport(() => window.api.importCustomPlayers(), setImportPlayers)}
            onReset={() => setImportPlayers(IDLE)}
          />
        </div>
        <button
          onClick={() => setScreen('team-select')}
          style={{
            padding: '12px 28px', fontSize: 12, fontWeight: 'bold', letterSpacing: 2,
            background: '#FF8740', color: '#000', border: 'none', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace', marginTop: 8,
          }}
        >
          CONTINUE TO TEAM SELECTION →
        </button>
        <button
          onClick={() => setScreen('main-menu')}
          style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace' }}
        >
          ← back to main menu
        </button>
      </div>
    );
  }

  if (screen === 'save-picker') {
    return (
      <Suspense fallback={<TabFallback />}>
        <SavePicker onSaveLoaded={handleSaveLoaded} onBack={() => setScreen('main-menu')} />
      </Suspense>
    );
  }

  if (screen === 'team-select') {
    return (
      <Suspense fallback={<TabFallback />}>
        <TeamSelection onSelect={handleTeamSelect} />
      </Suspense>
    );
  }

  if (screen === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgDark, gap: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, fontFamily: 'monospace' }}>GRIDIRON DYNASTY</div>
        {userTeam && (
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace', marginBottom: 8 }}>
            {userTeam.city} {userTeam.name}
          </div>
        )}
        <div style={{ fontSize: 9, letterSpacing: 3, color: T.textDim, fontFamily: 'monospace', marginBottom: 16 }}>SETTING UP YOUR DYNASTY</div>
        {setupSteps.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: step.done ? '#4caf50' : T.textMuted, fontFamily: 'monospace' }}>
            <span>{step.done ? '✓' : '…'}</span>
            <span>{step.label}</span>
          </div>
        ))}
        <div style={{ fontSize: 9, color: T.textDim, fontFamily: 'monospace', marginTop: 24, letterSpacing: 2 }}>
          {setupComplete ? 'DYNASTY READY — LOADING...' : 'PLEASE WAIT'}
        </div>
      </div>
    );
  }

  if (screen === 'meet-team') {
    return (
      <Suspense fallback={<TabFallback />}>
        <MeetTheTeam team={userTeam!} season={currentSeason} onStart={() => setScreen('game')} />
      </Suspense>
    );
  }

  if (!userTeam) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgDark, color: T.textMuted, fontFamily: 'monospace', letterSpacing: 3 }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bgDark, overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 20px', borderBottom: `1px solid ${T.borderFaint}`, background: T.bgDark, flexShrink: 0 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 13, color: '#FF8740', letterSpacing: 2 }}>GID</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ccc', fontWeight: 700 }}>
          {userTeam.city} {userTeam.name}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => {
            if (window.confirm('Return to the main menu? Unsaved progress this week may be lost.')) {
              setUserTeam(null);
              setMountedTabs(new Set(['home']));
              setScreen('main-menu');
            }
          }}
          style={{ fontSize: 10, color: T.borderStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          main menu
        </button>
        <button
          onClick={() => setScreen('save-picker')}
          style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          switch save
        </button>
        <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>DIFFICULTY</span>
        {(['easy', 'normal', 'hard'] as const).map(d => (
          <button key={d} onClick={() => handleDifficultyChange(d)} style={{
            padding: '3px 8px', fontSize: 9, fontFamily: 'monospace',
            background: difficulty === d ? (d === 'easy' ? '#1a3a1a' : d === 'hard' ? '#3a1a1a' : '#1a1a2a') : 'none',
            color: difficulty === d ? (d === 'easy' ? '#4caf50' : d === 'hard' ? '#e57373' : '#4FC3F7') : T.textDim,
            border: `1px solid ${difficulty === d ? (d === 'easy' ? '#4caf50' : d === 'hard' ? '#e57373' : '#4FC3F7') : T.borderFaint}`,
            borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase',
          }}>
            {d}
          </button>
        ))}
        <span style={{ fontSize: 11, color: T.textDim, fontFamily: 'monospace', marginLeft: 8 }}>{currentSeason}</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.borderMid}`, background: T.bgDark, flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)} style={{
            padding: '11px 22px', background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === tab.id ? '#4FC3F7' : tab.id === 'draft' ? '#FF8740' : T.textMuted,
            borderBottom: activeTab === tab.id ? '2px solid #4FC3F7' : '2px solid transparent',
            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            fontSize: 13, whiteSpace: 'nowrap', fontFamily: 'monospace',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — keep-alive */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={<TabFallback />}>
          {isMounted('home') && (
            <div style={{ ...tabStyle('home'), height: '100%' }}>
              <Home onNavigate={handleTabChange} onSeasonAdvance={handleSeasonAdvance} />
            </div>
          )}
          {isMounted('myteam') && (
            <div style={{ ...tabStyle('myteam'), height: '100%' }}>
              <MyTeam />
            </div>
          )}
          {isMounted('league') && (
            <div style={{ ...tabStyle('league'), height: '100%' }}>
              <League />
            </div>
          )}
          {isMounted('trades') && (
            <div style={{ ...tabStyle('trades'), height: '100%' }}>
              <Trades isActive={activeTab === 'trades'} />
            </div>
          )}
          {isMounted('news') && (
            <div style={{ ...tabStyle('news'), height: '100%' }}>
              <NewsFeed />
            </div>
          )}
          {isMounted('import') && (
            <div style={{ ...tabStyle('import'), height: '100%' }}>
              <Import />
            </div>
          )}
          {isMounted('draft') && (
            <div style={{ ...tabStyle('draft'), height: '100%' }}>
              <Draft onDraftComplete={() => handleTabChange('home')} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MenuButton({ label, sub, color, onClick }: { label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '16px 28px', background: 'transparent',
      border: `1px solid ${color}`, borderRadius: 4, cursor: 'pointer',
      color, fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12,
      letterSpacing: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 'normal', letterSpacing: 1 }}>{sub}</span>
    </button>
  );
}

function SetupImportCard({ step, title, description, warning, state, onImport, onReset }: {
  step: string; title: string; description: string; warning: string;
  state: ImportState; onImport: () => void; onReset: () => void;
}) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: 20, width: 220 }}>
      <div style={{ fontSize: 9, color: '#FF8740', letterSpacing: 2, marginBottom: 4, fontFamily: 'monospace' }}>STEP {step}</div>
      <div style={{ fontWeight: 700, color: '#fff', marginBottom: 6, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, lineHeight: 1.5 }}>{description}</div>
      <div style={{ fontSize: 10, color: '#FF8740', marginBottom: 12 }}>⚠ {warning}</div>
      {state.status === 'idle' && (
        <button onClick={onImport} style={{ padding: '8px 16px', background: '#1a1a1a', border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 }}>
          SELECT CSV
        </button>
      )}
      {state.status === 'running' && <div style={{ color: '#4FC3F7', fontSize: 11, fontFamily: 'monospace' }}>IMPORTING...</div>}
      {state.status === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ color: '#4caf50', fontSize: 11 }}>✓ {state.message}</div>
          <button onClick={onReset} style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }}>import again</button>
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ color: '#e57373', fontSize: 11 }}>✗ {state.message}</div>
          <button onClick={onReset} style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }}>try again</button>
        </div>
      )}
    </div>
  );
}
