import React, { useState, lazy, Suspense } from 'react';
import { T } from './theme';
import { useGameStore, UserTeam } from './store/gameStore';
import TutorialModal, { hasTutorialBeenSeen } from './tutorial/TutorialModal';

declare const window: any;

const Home         = lazy(() => import('./Home'));
const MyTeam       = lazy(() => import('./MyTeam'));
const League       = lazy(() => import('./League'));
const Trades       = lazy(() => import('./Trades'));
const Draft        = lazy(() => import('./Draft'));
const NewsFeed     = lazy(() => import('./newsCenter/NewsFeed'));
const Import       = lazy(() => import('./Import'));
const TeamSelection= lazy(() => import('./TeamSelection'));
const SavePicker   = lazy(() => import('./SavePicker'));
const MeetTheTeam  = lazy(() => import('./MeetTheTeam'));
const PlayerEditor = lazy(() => import('./PlayerEditor'));
const TeamEditor = lazy(() => import('./TeamEditor'));
const TemplateSelect = lazy(() => import('./TemplateSelect'));

type Tab = 'home' | 'myteam' | 'league' | 'trades' | 'draft' | 'news' | 'import' | 'editor' | 'teameditor';
type Screen = 'main-menu' | 'loading' | 'custom-setup' | 'save-picker' | 'team-select' | 'template-select' | 'setup' | 'meet-team' | 'game';

interface SetupStep  { label: string; done: boolean; }
type ImportStatus    = 'idle' | 'running' | 'done' | 'error';
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
];

function TabFallback() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontFamily: 'monospace', fontSize: 12 }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [screen, setScreen]             = useState<Screen>('main-menu');
  const [activeTab, setActiveTab]       = useState<Tab>('home');
  const [mountedTabs, setMountedTabs]   = useState<Set<Tab>>(new Set(['home']));
  const [setupSteps, setSetupSteps]     = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isNewGame, setIsNewGame]       = useState(false);
  const [dynastyName, setDynastyName]   = useState('');
  const [dynastyNameFocused, setDynastyNameFocused] = useState(false);
  const [importTeams,   setImportTeams]   = useState<ImportState>(IDLE);
  const [importPlayers, setImportPlayers] = useState<ImportState>(IDLE);
  const [dynastyMode, setDynastyMode] = useState<'franchise' | 'commissioner'>('franchise');

  const {
    currentSeason, setCurrentSeason,
    userTeam, setUserTeam,
    playoffsComplete, setPlayoffsComplete,
    difficulty, setDifficulty,
    advanceSeason,
    commissionerMode, setCommissionerMode,
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
    await window.api.applyDynastyTemplate();
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
    await window.api.setCommissionerMode(dynastyMode === 'commissioner');
    setCommissionerMode(dynastyMode === 'commissioner');
    await window.api.resetSave();
    if (mode === 'standard') {
      setScreen('template-select');
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
    const commMode = await window.api.getCommissionerMode();
    setCommissionerMode(commMode === true);
    await window.api.generateOwnerGoals();
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
    setIsNewGame(true);
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

  const tabs = [
    ...BASE_TABS,
    { id: 'draft' as Tab, label: playoffsComplete ? '⚡ Draft' : '📋 Draft' },
    ...(commissionerMode ? [
      { id: 'import' as Tab, label: 'Import' },
      { id: 'editor' as Tab, label: '✏ Editor' },
      { id: 'teameditor' as Tab, label: '🏟 Teams' },
    ] : []),
  ];

  const isMounted = (id: Tab) => mountedTabs.has(id);
  const tabStyle  = (id: Tab): React.CSSProperties => activeTab === id ? {} : { display: 'none' };

  // ── Main Menu ─────────────────────────────────────────────────────────────
  if (screen === 'main-menu') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: T.bgPage, fontFamily: 'monospace',
      }}>

        {/* Title */}
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 3, marginBottom: 8 }}>
          DYNASTY SIMULATOR
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 6, lineHeight: 1 }}>
          Sideline to Sideline
        </div>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#FF8740', letterSpacing: 6, marginBottom: 40 }}>
          Football
        </div>

        {/* Dynasty Name */}
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 2, marginBottom: 2 }}>DYNASTY NAME</div>
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
          <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>name your save file</div>
        </div>

        {/* Dynasty Mode */}
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: 2, marginBottom: 2 }}>DYNASTY MODE</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['franchise', 'commissioner'] as const).map(m => (
              <button
                key={m}
                onClick={() => setDynastyMode(m)}
                style={{
                  padding: '9px 18px', fontSize: 10, fontFamily: 'monospace',
                  fontWeight: dynastyMode === m ? 700 : 400, letterSpacing: 1,
                  background: dynastyMode === m
                    ? (m === 'commissioner' ? 'rgba(79,195,247,0.12)' : 'rgba(255,135,64,0.12)')
                    : 'transparent',
                  border: `1px solid ${dynastyMode === m
                    ? (m === 'commissioner' ? '#4FC3F7' : '#FF8740')
                    : T.borderFaint}`,
                  color: dynastyMode === m
                    ? (m === 'commissioner' ? '#4FC3F7' : '#FF8740')
                    : T.textDim,
                  borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {m === 'franchise' ? '🏈 FRANCHISE' : '🏟 COMMISSIONER'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>
            {dynastyMode === 'commissioner'
              ? 'Unlocks Player Editor + Team Editor tabs'
              : 'Standard single-team franchise experience'}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 300, height: 1, background: T.borderFaint, marginBottom: 24 }} />

        {/* Start Actions */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <MenuButton label="NEW DYNASTY" sub="standard setup" color="#FF8740" onClick={() => handleNewGame('standard')} />
          <MenuButton label="CUSTOM DYNASTY" sub="import csv data" color="#4FC3F7" onClick={() => handleNewGame('custom')} />
        </div>

        <button
          onClick={() => setScreen('save-picker')}
          style={{
            marginTop: 4, padding: '12px 28px', fontSize: 12, fontWeight: 'bold',
            letterSpacing: 2, background: 'transparent', color: T.textMuted,
            border: `1px solid ${T.borderFaint}`, borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          LOAD DYNASTY
        </button>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 6, letterSpacing: 1 }}>
          Continue a saved game
        </div>
      </div>
    );
  }

  if (screen === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.bgPage, fontFamily: 'monospace', color: T.textDim, fontSize: 13, letterSpacing: 2,
      }}>
        LOADING...
      </div>
    );
  }

  if (screen === 'custom-setup') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', background: T.bgPage, fontFamily: 'monospace', gap: 16, padding: 32,
      }}>
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 3 }}>CUSTOM DYNASTY SETUP</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 2 }}>
          {dynastyName.trim() || 'Dynasty'}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
          Optionally import custom teams and players before you pick your team.
          Both imports are optional — skip either to use the default generated content.
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <SetupImportCard
            step="1"
            title="Custom Teams"
            description="Import a CSV with your own team names, cities, and divisions."
            warning="This will reset all existing teams and players."
            state={importTeams}
            onImport={() => runImport(() => window.api.importCustomTeams(), setImportTeams)}
            onReset={() => setImportTeams(IDLE)}
          />
          <SetupImportCard
            step="2"
            title="Custom Players"
            description="Import a CSV with your own player roster."
            warning="This will replace all existing players."
            state={importPlayers}
            onImport={() => runImport(() => window.api.importCustomPlayers(), setImportPlayers)}
            onReset={() => setImportPlayers(IDLE)}
          />
        </div>
        <button
          onClick={() => setScreen('template-select')}
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
        <SavePicker onBack={() => setScreen('main-menu')} onSaveLoaded={handleSaveLoaded} />
      </Suspense>
    );
  }

  if (screen === 'template-select') {
    return (
      <Suspense fallback={<div style={{ color: '#555', padding: 40 }}>Loading...</div>}>
        <TemplateSelect
          onSelect={() => setScreen('team-select')}
          onBack={() => setScreen('custom-setup')}
        />
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
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', background: T.bgPage, fontFamily: 'monospace', gap: 16,
      }}>
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 3 }}>SIDELINE TO SIDELINE FOOTBALL</div>
        {userTeam && (
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: 2 }}>
            {userTeam.city} {userTeam.name}
          </div>
        )}
        <div style={{ fontSize: 12, color: T.textMuted, letterSpacing: 2, marginBottom: 8 }}>
          SETTING UP YOUR DYNASTY
        </div>
        {setupSteps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ color: step.done ? '#4caf50' : T.textDim }}>{step.done ? '✓' : '…'}</span>
            <span style={{ color: step.done ? '#4caf50' : T.textMuted }}>{step.label}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 16, letterSpacing: 2 }}>
          {setupComplete ? 'DYNASTY READY — LOADING...' : 'PLEASE WAIT'}
        </div>
      </div>
    );
  }

  if (screen === 'meet-team') {
    return (
      <Suspense fallback={<TabFallback />}>
        <MeetTheTeam
          team={userTeam as any}
          season={currentSeason}
          onStart={() => {
            setScreen('game');
            if (isNewGame && !hasTutorialBeenSeen()) {
              setShowTutorial(true);
              setIsNewGame(false);
            }
          }}
        />
      </Suspense>
    );
  }

  if (!userTeam) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.bgPage, fontFamily: 'monospace', color: T.textDim, fontSize: 13, letterSpacing: 2,
      }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', borderBottom: `1px solid ${T.borderFaint}`,
        background: T.bgCard, fontFamily: 'monospace', fontSize: 11,
      }}>
        <span style={{ color: '#FF8740', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>S2S</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ color: '#fff', fontWeight: 600, letterSpacing: 1 }}>
          {userTeam.city} {userTeam.name}
        </span>
        <div style={{ flex: 1 }} />
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
        <button
          onClick={() => setShowTutorial(true)}
          title="Open tutorial"
          style={{
            fontSize: 11, color: T.textMuted, background: 'none',
            border: `1px solid ${T.borderFaint}`, borderRadius: '50%',
            width: 22, height: 22, cursor: 'pointer', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ?
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
        <span style={{ fontSize: 12, color: T.textMuted, letterSpacing: 1, marginLeft: 4 }}>{currentSeason}</span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${T.borderFaint}`,
        background: T.bgCard, overflowX: 'auto',
      }}>
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
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <Suspense fallback={<TabFallback />}>
          {isMounted('home') && (
            <div style={tabStyle('home')}>
              <Home onSeasonAdvance={handleSeasonAdvance} onNavigate={handleTabChange} />
            </div>
          )}
          {isMounted('myteam') && (
            <div style={tabStyle('myteam')}>
              <MyTeam />
            </div>
          )}
          {isMounted('league') && (
            <div style={tabStyle('league')}>
              <League />
            </div>
          )}
          {isMounted('trades') && (
            <div style={tabStyle('trades')}>
              <Trades />
            </div>
          )}
          {isMounted('news') && (
            <div style={tabStyle('news')}>
              <NewsFeed />
            </div>
          )}
          {isMounted('draft') && (
            <div style={tabStyle('draft')}>
              <Suspense fallback={<TabFallback />}>
                <Draft onDraftComplete={() => handleTabChange('home')} />
              </Suspense>
            </div>
          )}
          {isMounted('teameditor') && (
            <div style={tabStyle('teameditor')}>
              <Suspense fallback={<TabFallback />}>
                <TeamEditor />
              </Suspense>
            </div>
          )}
          {isMounted('editor') && (
            <div style={tabStyle('editor')}>
              <PlayerEditor />
            </div>
          )}
          {isMounted('import') && (
            <div style={tabStyle('import')}>
              <Import />
            </div>
          )}
        </Suspense>
      </div>

      {showTutorial && (
        <TutorialModal onClose={() => setShowTutorial(false)} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MenuButton({ label, sub, color, onClick }: {
  label: string; sub: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 22px', background: 'transparent',
        border: `1px solid ${color}`, borderRadius: 4,
        cursor: 'pointer', fontFamily: 'monospace', textAlign: 'center', minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: T.textDim }}>{sub}</div>
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
      borderRadius: 6, padding: 20, width: 280, fontFamily: 'monospace',
    }}>
      <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 4 }}>STEP {step}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, lineHeight: 1.5 }}>{description}</div>
      <div style={{ fontSize: 10, color: '#e57373', marginBottom: 12 }}>⚠ {warning}</div>
      {state.status === 'idle' && (
        <button onClick={onImport} style={{
          padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1,
          background: '#FF8740', color: '#000', border: 'none', borderRadius: 4,
          cursor: 'pointer', fontFamily: 'monospace',
        }}>
          SELECT CSV
        </button>
      )}
      {state.status === 'running' && (
        <span style={{ fontSize: 11, color: T.textDim }}>IMPORTING...</span>
      )}
      {state.status === 'done' && (
        <div>
          <div style={{ fontSize: 11, color: '#4caf50', marginBottom: 6 }}>✓ {state.message}</div>
          <button onClick={onReset} style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace' }}>
            import again
          </button>
        </div>
      )}
      {state.status === 'error' && (
        <div>
          <div style={{ fontSize: 11, color: '#e57373', marginBottom: 6 }}>✗ {state.message}</div>
          <button onClick={onReset} style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace' }}>
            try again
          </button>
        </div>
      )}
    </div>
  );
}
