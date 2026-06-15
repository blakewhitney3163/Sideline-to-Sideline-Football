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

declare const window: any;

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft';

interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'home',       label: 'Home' },
  { id: 'standings',  label: 'Standings' },
  { id: 'teams',      label: 'Teams' },
  { id: 'schedule',   label: 'Schedule' },
  { id: 'stats',      label: 'Stats' },
  { id: 'playoffs',   label: 'Playoffs' },
  { id: 'trades',     label: 'Trades' },
  { id: 'franchise',  label: 'Franchise' },
];

export default function App() {
  const [activeTab,     setActiveTab]     = useState<Tab>('home');
  const [currentSeason, setCurrentSeason] = useState<number>(2025);
  const [userTeam,      setUserTeam]      = useState<UserTeam | null | undefined>(undefined);
  const [playoffsComplete, setPlayoffsComplete] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.getCurrentSeason(),
      window.api.getUserTeam(),
      window.api.getOffseasonStatus(),
    ]).then(([season, team, offseason]: [number, UserTeam | null, any]) => {
      setCurrentSeason(season);
      setUserTeam(team);
      setPlayoffsComplete(offseason.playoffsComplete);
    });
  }, []);

  const handleSeasonAdvance = (nextSeason: number) => {
    setCurrentSeason(nextSeason);
    setPlayoffsComplete(false);
    setActiveTab('home');
  };

  const handleDraftComplete = () => {
    setActiveTab('home');
  };

  const tabs = playoffsComplete
    ? [...BASE_TABS, { id: 'draft' as Tab, label: '⚡ Draft' }]
    : BASE_TABS;

  if (userTeam === undefined) {
    return <div style={{ color: '#555', padding: 40, fontFamily: 'monospace' }}>Loading...</div>;
  }

  if (userTeam === null) {
    return <TeamSelection onSelect={(team: UserTeam) => setUserTeam(team)} />;
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', fontFamily: 'monospace' }}>
      {/* App Header */}
      <div style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#FF8740', letterSpacing: 2 }}>NFL SIMULATOR</span>
        <span style={{ color: '#2a2a2a' }}>|</span>
        <span style={{ fontSize: 13, color: '#ccc' }}>{userTeam.city} {userTeam.name}</span>
        <button onClick={() => setUserTeam(null)} style={{ fontSize: 10, color: '#333', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>change</button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#444' }}>{currentSeason} Season</span>
      </div>

      {/* Tab Bar */}
      <div style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', display: 'flex', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '11px 22px', background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === tab.id ? '#4FC3F7' : tab.id === 'draft' ? '#FF8740' : '#555',
            borderBottom: activeTab === tab.id ? '2px solid #4FC3F7' : '2px solid transparent',
            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            fontSize: 13, transition: 'color 0.2s', whiteSpace: 'nowrap',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1 }}>
        {activeTab === 'home' && (
          <Home
            currentSeason={currentSeason}
            onSeasonAdvance={handleSeasonAdvance}
            userTeam={userTeam}
            onNavigate={(tab: string) => setActiveTab(tab as Tab)}
            onPlayoffsComplete={() => setPlayoffsComplete(true)}
          />
        )}
        {activeTab === 'standings'  && <Standings currentSeason={currentSeason} />}
        {activeTab === 'teams'      && <Teams />}
        {activeTab === 'schedule'   && <Schedule currentSeason={currentSeason} />}
        {activeTab === 'stats'      && <Stats currentSeason={currentSeason} />}
        {activeTab === 'playoffs'   && <Playoffs currentSeason={currentSeason} />}
        {activeTab === 'trades'     && <Trades userTeam={userTeam} />}
        {activeTab === 'franchise'  && <Franchise userTeam={userTeam} currentSeason={currentSeason} />}
        {activeTab === 'draft'      && (
          <Draft
            userTeam={userTeam}
            currentSeason={currentSeason}
            onDraftComplete={handleDraftComplete}
          />
        )}
      </div>
    </div>
  );
}