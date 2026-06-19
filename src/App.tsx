import React, { useState, lazy, Suspense } from 'react';
import { T } from './theme';
import { useGameStore, UserTeam } from './store/gameStore';

declare const window: any;

const Home       = lazy(() => import('./Home'));
const Standings  = lazy(() => import('./Standings'));
const Teams      = lazy(() => import('./Teams'));
const Schedule   = lazy(() => import('./Schedule'));
const Stats      = lazy(() => import('./Stats'));
const Playoffs   = lazy(() => import('./Playoffs'));
const Trades     = lazy(() => import('./Trades'));
const Franchise  = lazy(() => import('./Franchise'));
const Draft      = lazy(() => import('./Draft'));
const DepthChart = lazy(() => import('./DepthChart'));
const Records    = lazy(() => import('./Records'));
const NewsFeed   = lazy(() => import('./newsCenter/NewsFeed'));
const Import     = lazy(() => import('./Import'));
const TeamSelection = lazy(() => import('./TeamSelection'));
const SavePicker    = lazy(() => import('./SavePicker'));
const MeetTheTeam = lazy(() => import('./MeetTheTeam'));

type Tab    = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft' | 'depth' | 'records' | 'news' | 'import';
type Screen = 'main-menu' | 'loading' | 'custom-setup' | 'save-picker' | 'team-select' | 'setup' | 'meet-team' | 'game';

interface SetupStep   { label: string; done: boolean; }
type     ImportStatus = 'idle' | 'running' | 'done' | 'error';
interface ImportState { status: ImportStatus; message: string; }
const IDLE: ImportState = { status: 'idle', message: '' };

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'home',      label: 'Home'       },
  { id: 'standings', label: 'Standings'  },
  { id: 'teams',     label: 'Teams'      },
  { id: 'schedule',  label: 'Schedule'   },
  { id: 'stats',     label: 'Stats'      },
  { id: 'records',   label: 'Records'    },
  { id: 'playoffs',  label: 'Playoffs'   },
  { id: 'trades',    label: 'Trades'     },
  { id: 'franchise', label: 'Franchise'  },
  { id: 'depth',     label: 'Depth Chart'},
  { id: 'news',      label: '📰 News'    },
  { id: 'import',    label: 'Import'     },
];

function TabFallback() {
  return (
    <div style={{ color: '#4FC3F7', fontFamily: 'monospace', textAlign: 'center', paddingTop: 80 }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [screen,       setScreen]       = useState<Screen>('main-menu');
  const [activeTab,    setActiveTab]    = useState<Tab>('home');
  const [mountedTabs,  setMountedTabs]  = useState<Set<Tab>>(new Set(['home']));
  const [setupSteps,   setSetupSteps]   = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [dynastyName,  setDynastyName]  = useState('');

  // Custom setup import states
  const [importTeams,   setImportTeams]   = useState<ImportState>(IDLE);
  const [importPlayers, setImportPlayers] = useState<ImportState>(IDLE);

  const {
    currentSeason, setCurrentSeason,
    userTeam, setUserTeam,
    playoffsComplete, setPlayoffsComplete,
    difficulty, setDifficulty,
    advanceSeason,
  } = useGameStore();

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setMountedTabs(prev => new Set([...prev, tab]));
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
  setTimeout(() => setScreen('meet-team'), 1200);  // ← was 'game'
};

  const handleDifficultyChange = async (level: 'easy' | 'normal' | 'hard') => {
    setDifficulty(level);
    await window.api.setDifficulty(level);
  };

  // ── New Dynasty (standard or custom) ─────────────────────────────────────

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

  // ── Load Dynasty ──────────────────────────────────────────────────────────

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

  // ── Team Selection ────────────────────────────────────────────────────────
  // Note: resetSave() is NOT called here — it is called once in handleNewGame.
  // Calling it again would wipe any custom imports done on the custom-setup screen.

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

  // ── Custom Setup Import Helper ────────────────────────────────────────────

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

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs = playoffsComplete
    ? [
        ...BASE_TABS.filter(t => t.id !== 'news' && t.id !== 'import'),
        { id: 'draft' as Tab, label: '⚡ Draft' },
        { id: 'news'   as Tab, label: '📰 News'  },
        { id: 'import' as Tab, label: 'Import'   },
      ]
    : BASE_TABS;

  const isMounted = (id: Tab) => mountedTabs.has(id);
  const tabStyle  = (id: Tab): React.CSSProperties => activeTab === id ? {} : { display: 'none' };

  // ─────────────────────────────────────────────────────────────────────────
  // Screens
  // ─────────────────────────────────────────────────────────────────────────

  // ── Main Menu ─────────────────────────────────────────────────────────────
  if (screen === 'main-menu') {
    return (
      <div style={{
        minHeight: '100vh', background: T.bgPage, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: T.textDim, marginBottom: 8 }}>DYNASTY SIMULATOR</div>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: 8, color: '#4FC3F7', marginBottom: 4 }}>GRIDIRON</div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: T.textMuted, marginBottom: 48 }}>DYNASTY</div>

        {/* Dynasty name input */}
        <div style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim }}>DYNASTY NAME</div>
          <input
            type="text"
            value={dynastyName}
            onChange={e => setDynastyName(e.target.value)}
            placeholder="Dynasty"
            maxLength={40}
            style={{
              background: T.bgCard, border: `1px solid ${T.borderFaint}`,
              color: '#fff', fontFamily: 'monospace', fontSize: 14,
              padding: '10px 16px', borderRadius: 4, outline: 'none',
              width: 240, textAlign: 'center', letterSpacing: 1,
            }}
          />
        </div>

        {/* New game options */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <MenuButton
            label="NEW STANDARD DYNASTY"
            sub="Generated teams & players"
            color="#4caf50"
            onClick={() => handleNewGame('standard')}
          />
          <MenuButton
            label="NEW CUSTOM DYNASTY"
            sub="Import your own teams & players"
            color="#4FC3F7"
            onClick={() => handleNewGame('custom')}
          />
        </div>

        {/* Load save */}
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
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 6 }}>Continue a saved game</div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: T.bgPage, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#4FC3F7', fontFamily: 'monospace', fontSize: 13, letterSpacing: 4,
      }}>
        LOADING...
      </div>
    );
  }

  // ── Custom Setup ──────────────────────────────────────────────────────────
  if (screen === 'custom-setup') {
    return (
      <div style={{
        minHeight: '100vh', background: T.bgPage, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', padding: '40px 20px',
      }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: T.textDim, marginBottom: 6 }}>CUSTOM DYNASTY SETUP</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#4FC3F7', letterSpacing: 3, marginBottom: 8 }}>
          {dynastyName.trim() || 'Dynasty'}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 32, textAlign: 'center', maxWidth: 480, lineHeight: 1.8 }}>
          Optionally import custom teams and players before you pick your team.
          Both imports are optional — skip either to use the default generated content.
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Teams import card */}
          <SetupImportCard
            step="1"
            title="CUSTOM TEAMS"
            description="Replace default teams with your own"
            warning="Resets all players & contracts"
            state={importTeams}
            onImport={() => runImport(() => window.api.importCustomTeams(), setImportTeams)}
            onReset={() => setImportTeams(IDLE)}
          />
          {/* Players import card */}
          <SetupImportCard
            step="2"
            title="CUSTOM PLAYERS"
            description="Replace generated players with your own"
            warning="Clears all rosters & contracts"
            state={importPlayers}
            onImport={() => runImport(() => window.api.importCustomPlayers(), setImportPlayers)}
            onReset={() => setImportPlayers(IDLE)}
          />
        </div>

        <button
          onClick={() => setScreen('team-select')}
          style={{
            padding: '14px 32px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3,
            background: '#4caf50', color: '#000', border: 'none', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace', marginBottom: 12,
          }}
        >
          CONTINUE TO TEAM SELECTION →
        </button>
        <button
          onClick={() => setScreen('main-menu')}
          style={{
            fontSize: 10, color: T.textDim, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace',
          }}
        >
          ← back to main menu
        </button>
      </div>
    );
  }

  // ── Save Picker (Load path) ───────────────────────────────────────────────
  if (screen === 'save-picker') {
    return (
      <Suspense fallback={<TabFallback />}>
        <SavePicker onSaveLoaded={handleSaveLoaded} onBack={() => setScreen('main-menu')} />
      </Suspense>
    );
  }

  // ── Team Selection ────────────────────────────────────────────────────────
  if (screen === 'team-select') {
    return (
      <Suspense fallback={<TabFallback />}>
        <TeamSelection onSelect={handleTeamSelect} />
      </Suspense>
    );
  }

  // ── Setup Animation ───────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div style={{
        minHeight: '100vh', background: T.bgPage, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#4FC3F7', marginBottom: 8 }}>
          GRIDIRON DYNASTY
        </div>
        {userTeam && (
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 32 }}>
            {userTeam.city} {userTeam.name}
          </div>
        )}
        <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, marginBottom: 20 }}>
          SETTING UP YOUR DYNASTY
        </div>
        {setupSteps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 10, fontSize: 12,
            color: step.done ? '#4caf50' : T.textMuted,
          }}>
            <span style={{ width: 16, textAlign: 'center' }}>{step.done ? '✓' : '…'}</span>
            <span>{step.label}</span>
          </div>
        ))}
        <div style={{ marginTop: 32, fontSize: 10, letterSpacing: 2, color: setupComplete ? '#4caf50' : T.textDim }}>
          {setupComplete ? 'DYNASTY READY — LOADING...' : 'PLEASE WAIT'}
        </div>
      </div>
    );
  }

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!userTeam) {
    return (
      <div style={{
        minHeight: '100vh', background: T.bgPage, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#4FC3F7', fontFamily: 'monospace', fontSize: 13, letterSpacing: 4,
      }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', fontFamily: 'monospace' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', borderBottom: `1px solid ${T.bgCard}`, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 4, color: '#4FC3F7' }}>GID</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 'bold' }}>
          {userTeam.city} {userTeam.name}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={async () => {
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
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 2 }}>DIFFICULTY</span>
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
          <span style={{ fontSize: 11, color: T.textDim, letterSpacing: 2 }}>{currentSeason}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bgCard}`, overflowX: 'auto' }}>
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

      {/* Tab content — keep-alive pattern */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<TabFallback />}>
          {isMounted('home') && (
            <div style={tabStyle('home')}>
              <Home onTabChange={tab => handleTabChange(tab as Tab)} onSeasonAdvance={handleSeasonAdvance} />
            </div>
          )}
          {isMounted('standings') && <div style={tabStyle('standings')}><Standings /></div>}
          {isMounted('teams')     && <div style={tabStyle('teams')}><Teams /></div>}
          {isMounted('schedule')  && <div style={tabStyle('schedule')}><Schedule /></div>}
          {isMounted('stats')     && <div style={tabStyle('stats')}><Stats /></div>}
          {isMounted('records')   && <div style={tabStyle('records')}><Records /></div>}
          {isMounted('playoffs')  && <div style={tabStyle('playoffs')}><Playoffs /></div>}
          {isMounted('trades')    && <div style={tabStyle('trades')}><Trades /></div>}
          {isMounted('franchise') && <div style={tabStyle('franchise')}><Franchise /></div>}
          {isMounted('depth')     && <div style={tabStyle('depth')}><DepthChart /></div>}
          {isMounted('news')      && <div style={tabStyle('news')}><NewsFeed /></div>}
          {isMounted('import')    && <div style={tabStyle('import')}><Import /></div>}
          {isMounted('draft')     && (
            <div style={tabStyle('draft')}>
              <Draft onDraftComplete={() => handleTabChange('home')} />
            </div>
          )}
        </Suspense>
      </div>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MenuButton({ label, sub, color, onClick }: {
  label: string; sub: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '18px 28px', fontFamily: 'monospace', cursor: 'pointer',
      background: 'transparent', border: `1px solid ${color}`, borderRadius: 5,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minWidth: 200,
    }}>
      <span style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: 2, color }}>{label}</span>
      <span style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>{sub}</span>
    </button>
  );
}

function SetupImportCard({ step, title, description, warning, state, onImport, onReset }: {
  step: string; title: string; description: string; warning: string;
  state: ImportState; onImport: () => void; onReset: () => void;
}) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.borderFaint}`,
      borderRadius: 6, padding: 20, width: 260,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#4FC3F7',
          border: '1px solid #4FC3F7', borderRadius: 2, padding: '2px 5px',
        }}>
          STEP {step}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4FC3F7', letterSpacing: 2 }}>{title}</div>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, lineHeight: 1.7 }}>{description}</div>
      <div style={{ fontSize: 9, color: '#e57373', marginBottom: 14, letterSpacing: 1 }}>⚠ {warning}</div>

      {state.status === 'idle' && (
        <button onClick={onImport} style={{
          width: '100%', padding: '8px', fontSize: 10, fontWeight: 'bold', letterSpacing: 1,
          background: '#1a2a1a', color: '#4caf50', border: '1px solid #4caf50',
          borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
        }}>
          SELECT CSV
        </button>
      )}
      {state.status === 'running' && (
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2 }}>IMPORTING...</div>
      )}
      {state.status === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#4caf50' }}>✓ {state.message}</div>
          <button onClick={onReset} style={{
            fontSize: 9, color: T.textDim, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace', textAlign: 'left',
          }}>import again</button>
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#e57373', lineHeight: 1.6 }}>✗ {state.message}</div>
          <button onClick={onReset} style={{
            fontSize: 9, color: T.textDim, background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace', textAlign: 'left',
          }}>try again</button>
        </div>
      )}
    </div>
  );
}
