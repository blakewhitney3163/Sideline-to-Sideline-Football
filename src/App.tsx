import React, { useState, useEffect } from 'react';
import Home from './Home';
import Standings from './Standings';
import Teams from './Teams';
import Schedule from './Schedule';
import Stats from './Stats';
import Playoffs from './Playoffs';
import TeamSelection from './TeamSelection';
import Trades from './Trades';
import Franchise from './Franchise';
import Draft from './Draft';
import DepthChart from './DepthChart';
import Records from './Records';
import { T } from './theme';

declare const window: any;

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft' | 'depth' | 'records';
type Screen = 'loading' | 'start' | 'team-select' | 'setup' | 'game';

interface UserTeam {
  id: number; city: string; name: string;
  abbreviation: string; conference: string; division: string;
}

interface SetupStep { label: string; done: boolean; }

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'Teams' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'stats', label: 'Stats' },
  { id: 'records', label: 'Records' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'trades', label: 'Trades' },
  { id: 'franchise', label: 'Franchise' },
  { id: 'depth', label: 'Depth Chart' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [currentSeason, setCurrentSeason] = useState(2025);
  const [userTeam, setUserTeam] = useState<UserTeam | null>(null);
  const [playoffsComplete, setPlayoffsComplete] = useState(false);
  const [playoffData, setPlayoffData] = useState<any>(null);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);

  const [hasSave, setHasSave] = useState(false);

useEffect(() => {
  Promise.all([
    window.api.getCurrentSeason(),
    window.api.getUserTeam(),
    window.api.getOffseasonStatus(),
  ]).then(([season, team, offseason]: [number, UserTeam | null, any]) => {
    setCurrentSeason(season);
    setPlayoffsComplete(offseason.playoffsComplete ?? false);
    if (!team) {
      setHasSave(false);
      setScreen('start');
    } else {
      setHasSave(true);
      window.api.checkSetupDone().then((done: boolean) => {
        setUserTeam(team);
        setScreen(done ? 'start' : 'setup');
        if (!done) runSetup();
      });
    }
  });
}, []);

  const markStep = (label: string, done: boolean) => {
    setSetupSteps(prev => {
      const existing = prev.find(s => s.label === label);
      if (existing) return prev.map(s => s.label === label ? { ...s, done } : s);
      return [...prev, { label, done }];
    });
  };

  const runSetup = async () => {
    markStep('Importing real NFL contracts from OTC...', false);
    await window.api.importOtcContracts();
    markStep('Importing real NFL contracts from OTC...', true);

    markStep('Building player career histories...', false);
    await window.api.importNflverseStats();
    markStep('Building player career histories...', true);

    markStep('Finalizing dynasty setup...', false);
    await new Promise(r => setTimeout(r, 600));
    markStep('Finalizing dynasty setup...', true);

    setSetupComplete(true);
    setTimeout(() => setScreen('game'), 1200);
  };

  const handleTeamSelect = async (team: UserTeam) => {
    setUserTeam(team);
    setScreen('setup');
    setSetupSteps([]);
    setSetupComplete(false);
    runSetup();
  };

  const tabs = playoffsComplete
    ? [...BASE_TABS, { id: 'draft' as Tab, label: '⚡ Draft' }]
    : BASE_TABS;

  // ── Start Screen ──────────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <div style={{
        minHeight: '100vh', background: '#060606',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: T.borderStrong, marginBottom: 12 }}>PRESENTED BY</div>
          <div style={{ fontSize: 48, fontWeight: 'bold', color: '#fff', letterSpacing: 4, marginBottom: 8 }}>
            NFL
          </div>
          <div style={{ fontSize: 20, color: '#4caf50', letterSpacing: 8, fontWeight: 'bold' }}>
            SIMULATOR
          </div>
          <div style={{ width: 80, height: 2, background: '#4caf50', margin: '20px auto' }} />
          <div style={{ fontSize: 11, color: T.borderStrong, letterSpacing: 2 }}>DYNASTY MODE</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
  <button
    onClick={() => setScreen('team-select')}
    style={{
      padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3,
      background: '#4caf50', color: '#000', border: 'none', borderRadius: 4,
      cursor: 'pointer', fontFamily: 'monospace',
    }}
  >
    NEW DYNASTY
  </button>
  <button
    disabled={!hasSave}
    onClick={() => { if (hasSave) setScreen('game'); }}
    style={{
      padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3,
      background: 'transparent',
      color: hasSave ? T.textMuted : T.borderFaint,
      border: `1px solid ${hasSave ? T.borderStrong : T.bgCard}`,
      borderRadius: 4, cursor: hasSave ? 'pointer' : 'default',
      fontFamily: 'monospace',
    }}
  >
    {hasSave ? 'CONTINUE' : 'NO SAVED DYNASTY'}
  </button>
</div>
      </div>
    );
  }

  // ── Team Selection ────────────────────────────────────────────────────────
  if (screen === 'team-select') {
    return <TeamSelection onSelect={handleTeamSelect} />;
  }

  // ── Setup Screen ──────────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div style={{
        minHeight: '100vh', background: '#060606',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 4, marginBottom: 8 }}>
            NFL SIMULATOR
          </div>
          {userTeam && (
            <div style={{ fontSize: 13, color: '#4caf50', letterSpacing: 2 }}>
              {userTeam.city} {userTeam.name}
            </div>
          )}
        </div>

        <div style={{ width: 360, marginBottom: 40 }}>
          <div style={{ fontSize: 10, color: T.borderStrong, letterSpacing: 3, marginBottom: 20 }}>
            SETTING UP YOUR DYNASTY
          </div>
          {setupSteps.map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0', borderBottom: '1px solid #0f0f0f',
              color: step.done ? '#4caf50' : T.textMuted,
            }}>
              <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>
                {step.done ? '✓' : '…'}
              </span>
              <span style={{ fontSize: 12 }}>{step.label}</span>
            </div>
          ))}
        </div>

        {setupComplete && (
          <div style={{ fontSize: 13, color: '#4caf50', letterSpacing: 3, animation: 'none' }}>
            DYNASTY READY — LOADING...
          </div>
        )}

        {!setupComplete && (
          <div style={{ fontSize: 10, color: T.borderFaint, letterSpacing: 2 }}>
            PLEASE WAIT
          </div>
        )}
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (screen === 'loading' || !userTeam) {
    return (
      <div style={{
        minHeight: '100vh', background: '#060606', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', color: T.borderStrong, fontSize: 11, letterSpacing: 3,
      }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: T.textPrimary, fontFamily: 'monospace' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px',
        borderBottom: '1px solid #111', background: '#060606',
      }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#4caf50', letterSpacing: 2 }}>
          NFL SIMULATOR
        </span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ fontSize: 12, color: T.textSecondary }}>
          {userTeam.city} {userTeam.name}
        </span>
        <button
  onClick={async () => {
    if (window.confirm('Start a new dynasty? This will wipe all current progress.')) {
      await window.api.resetSave();
      setUserTeam(null);
      setHasSave(false);
      setSetupSteps([]);
      setSetupComplete(false);
      setScreen('start');
    }
  }}
  style={{ fontSize: 10, color: T.borderStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
>
  new dynasty
</button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textDim }}>
          {currentSeason} Season
        </span>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #111', background: '#060606', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
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

      <div style={{ padding: 20 }}>
  {activeTab === 'home' && (
    <Home
      userTeam={userTeam} currentSeason={currentSeason}
      onNavigate={tab => setActiveTab(tab as Tab)}
      onSeasonAdvance={handleSeasonAdvance}
      onPlayoffsComplete={() => setPlayoffsComplete(true)}
    />
  )}
  {activeTab === 'standings' && <Standings currentSeason={currentSeason} />}
  {activeTab === 'teams' && <Teams />}
  {activeTab === 'schedule' && <Schedule currentSeason={currentSeason} />}
  {activeTab === 'stats' && <Stats currentSeason={currentSeason} />}
  {activeTab === 'records' && <Records />}
  {activeTab === 'playoffs' && (
    <Playoffs
      currentSeason={currentSeason}
      data={playoffData}
      setData={setPlayoffData}
    />
  )}
  {activeTab === 'trades' && <Trades userTeam={userTeam} />}
  {activeTab === 'franchise' && (
    <Franchise userTeam={userTeam} currentSeason={currentSeason} />
  )}
  {activeTab === 'depth' && <DepthChart userTeam={userTeam} />}
  {activeTab === 'draft' && (
    <Draft
      userTeam={userTeam} currentSeason={currentSeason}
      onDraftComplete={() => setActiveTab('home')}
    />
  )}
</div>
    
    </div>
  );

  function handleSeasonAdvance(nextSeason: number) {
    setCurrentSeason(nextSeason);
    setPlayoffsComplete(false);
    setPlayoffData(null);
    setActiveTab('home');
  }
}