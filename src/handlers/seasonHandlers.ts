import { ipcMain } from 'electron';
import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { AdvanceSeasonResult } from '../types';
import { advanceSeason, openFreeAgency } from '../services/SeasonService';
import { settingsRepo } from '../repositories';
import { getRecentLeagueEvents } from '../services/LeagueEventsService';

export function registerSeasonHandlers(): void {

  ipcMain.handle('get-current-season', () => getCurrentSeason());

  ipcMain.handle('get-seasons', () => {
    const rows = db.prepare('SELECT DISTINCT season FROM games ORDER BY season DESC').all() as any[];
    return rows.map(r => r.season);
  });

  ipcMain.handle('get-standings', (_event: any, season: number) =>
    db.prepare(`
      SELECT t.id, t.city, t.name, t.abbreviation, t.conference, t.division,
        COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                          OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
                          OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END), 0) as losses,
        COALESCE(SUM(CASE WHEN (g.home_team_id = t.id OR g.away_team_id = t.id)
                          AND g.home_score = g.away_score THEN 1 ELSE 0 END), 0) as ties
      FROM teams t
      LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
        AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY t.id
      ORDER BY wins DESC, losses ASC
    `).all(season));

    ipcMain.handle('get-dashboard', (_event: any, season: number) => {
    const userTeamId = settingsRepo.getUserTeamId();
    if (!userTeamId) return null;
    const team = db.prepare('SELECT id, city, name, abbreviation, conference, division FROM teams WHERE id = ?').get(userTeamId) as any;
    const record = db.prepare(`
      SELECT
        SUM(CASE WHEN (g.home_team_id = ? AND g.home_score > g.away_score)
                   OR (g.away_team_id = ? AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN (g.home_team_id = ? AND g.home_score < g.away_score)
                   OR (g.away_team_id = ? AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN (g.home_team_id = ? OR g.away_team_id = ?)
                  AND g.home_score = g.away_score THEN 1 ELSE 0 END) as ties
      FROM games g
      WHERE (g.home_team_id = ? OR g.away_team_id = ?)
        AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    `).get(userTeamId, userTeamId, userTeamId, userTeamId, userTeamId, userTeamId, userTeamId, userTeamId, season) as any;
    const recentNews = db.prepare(
      "SELECT headline, detail, event_type, category, season, week FROM news_events ORDER BY id DESC LIMIT 8"
    ).all() as any[];

    const allStandings = db.prepare(`
      SELECT t.id, t.city, t.name, t.abbreviation, t.conference,
        (t.city || ' ' || t.name) as team_name,
        COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                          OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
                          OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END), 0) as losses
      FROM teams t
      LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
        AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY t.id
      ORDER BY wins DESC, losses ASC
    `).all(season) as any[];

    const topAFC = allStandings.filter((t: any) => t.conference === 'AFC').slice(0, 3);
    const topNFC = allStandings.filter((t: any) => t.conference === 'NFC').slice(0, 3);

    return { team, record, recentNews, topAFC, topNFC };
  });

  ipcMain.handle('get-schedule', (_event: any, season: number) =>
    db.prepare(`
      SELECT g.id, g.week, g.home_team_id, g.away_team_id,
        g.home_score, g.away_score, g.is_simulated, g.is_playoff, g.weather,
        ht.city as home_city, ht.name as home_name, ht.abbreviation as home_abbr,
        at.city as away_city, at.name as away_name, at.abbreviation as away_abbr,
        ht.city || ' ' || ht.name AS home_team,
        at.city || ' ' || at.name AS away_team
      FROM games g
      JOIN teams ht ON ht.id = g.home_team_id
      JOIN teams at ON at.id = g.away_team_id
      WHERE g.season = ?
      ORDER BY g.week, g.id
    `).all(season));

  ipcMain.handle('get-announcing-retirements', () =>
    db.prepare(`
      SELECT id, first_name, last_name, position, age, overall_rating, team_id
      FROM players WHERE roster_status = 'announcing_retirement'
    `).all());

  ipcMain.handle('make-retention-offer', (_event: any, playerId: number) => {
    const { makeRetentionOffer } = require('../services/ContractService');
    if (makeRetentionOffer) return makeRetentionOffer(playerId);
    db.prepare("UPDATE players SET roster_status = 'active', morale = MIN(100, morale + 15) WHERE id = ?").run(playerId);
    return { success: true };
  });

  ipcMain.handle('dismiss-retirement', (_event: any, playerId: number) => {
    db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(playerId);
    const { contractRepo: cr } = require('../repositories');
    cr.delete(playerId);
    return { success: true };
  });

  ipcMain.handle('get-champions', () =>
    db.prepare(`
      SELECT ch.season, ch.team_id, t.city, t.name, t.abbreviation
      FROM champions ch JOIN teams t ON t.id = ch.team_id
      ORDER BY ch.season DESC
    `).all());

  ipcMain.handle('advance-season', async (): Promise<AdvanceSeasonResult> =>
    advanceSeason() as any);

  ipcMain.handle('open-free-agency', () =>
    openFreeAgency(settingsRepo.getUserTeamId() ?? -1));

  ipcMain.handle('get-owner-goals', (_event: any, season: number) => {
    const { getOwnerGoalsForSeason } = require('../services/OwnerGoalsService');
    return getOwnerGoalsForSeason(season);
  });

  ipcMain.handle('get-team-finances', (_event: any, teamId: number) => {
    let row = db.prepare('SELECT * FROM team_finances WHERE team_id = ?').get(teamId) as any;
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO team_finances (team_id) VALUES (?)').run(teamId);
      row = db.prepare('SELECT * FROM team_finances WHERE team_id = ?').get(teamId);
    }
    return row ?? null;
  });

  ipcMain.handle('get-all-team-finances', () =>
    db.prepare(`
      SELECT tf.*, t.city, t.name
      FROM team_finances tf JOIN teams t ON t.id = tf.team_id
      ORDER BY tf.season_revenue DESC
    `).all());

  ipcMain.handle('get-owner-patience', () => {
    const { getOwnerPatience } = require('../services/OwnerGoalsService');
    return getOwnerPatience();
  });

  ipcMain.handle('generate-owner-goals', () => {
    const { generateOwnerGoals } = require('../services/OwnerGoalsService');
    const season = getCurrentSeason();
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    if (userTeamId > 0) generateOwnerGoals(season, userTeamId);
    return { success: true };
  });

  ipcMain.handle('get-league-office-data', () => {
    const { getSalaryCap } = require('../helpers/getSalaryCap');
    const currentSeason = getCurrentSeason();
    const capHistory: { season: number; cap: number }[] = [];
    for (let s = currentSeason - 4; s <= currentSeason; s++) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`cap_history_${s}`) as any;
      if (row) capHistory.push({ season: s, cap: parseFloat(row.value) });
    }
    const userVoteRow = db.prepare("SELECT value FROM settings WHERE key = 'user_expansion_vote'").get() as any;
    const userVote = userVoteRow ? userVoteRow.value : null;
    let recentExpansions: any[] = [];
    let recentRelocations: any[] = [];
    try {
      recentExpansions = db.prepare('SELECT * FROM expansion_history WHERE passed = 1 ORDER BY season DESC LIMIT 5').all() as any[];
    } catch {}
    try {
      recentRelocations = db.prepare("SELECT headline, detail, season FROM news_events WHERE event_type = 'league' AND headline LIKE '%Relocate%' ORDER BY season DESC LIMIT 5").all() as any[];
    } catch {}
    return {
      salaryCap: getSalaryCap(),
      capHistory,
      pendingVote: !userVote,
      userVote,
      recentExpansions,
      recentRelocations,
    };
  });

  ipcMain.handle('cast-expansion-vote', (_event: any, vote: 'for' | 'against') => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('user_expansion_vote', vote);
    return { success: true };
  });

  ipcMain.handle('get-relocation-cities', () => {
    const existingCities = new Set((db.prepare('SELECT city FROM teams').all() as any[]).map((t: any) => t.city));
    const CITY_POOL = [
      { city: 'Portland',       name: 'Pioneers',   abbreviation: 'POR', marketSize: 'medium' },
      { city: 'San Antonio',    name: 'Stallions',  abbreviation: 'SAS', marketSize: 'medium' },
      { city: 'Sacramento',     name: 'Surge',      abbreviation: 'SAC', marketSize: 'small'  },
      { city: 'Salt Lake City', name: 'Sentinels',  abbreviation: 'SLC', marketSize: 'small'  },
      { city: 'Austin',         name: 'Armadillos', abbreviation: 'AUS', marketSize: 'medium' },
      { city: 'Memphis',        name: 'Grizzlies',  abbreviation: 'MEM', marketSize: 'small'  },
      { city: 'Oklahoma City',  name: 'Thunder',    abbreviation: 'OKC', marketSize: 'small'  },
      { city: 'St. Louis',      name: 'Blues',      abbreviation: 'STL', marketSize: 'medium' },
      { city: 'San Diego',      name: 'Surge',      abbreviation: 'SDG', marketSize: 'medium' },
      { city: 'Raleigh',        name: 'Ravens',     abbreviation: 'RAL', marketSize: 'small'  },
      { city: 'Columbus',       name: 'Charge',     abbreviation: 'COL', marketSize: 'small'  },
      { city: 'Louisville',     name: 'Lightning',  abbreviation: 'LOU', marketSize: 'small'  },
      { city: 'Birmingham',     name: 'Bulls',      abbreviation: 'BHM', marketSize: 'small'  },
      { city: 'Hartford',       name: 'Hawks',      abbreviation: 'HFD', marketSize: 'small'  },
      { city: 'San Jose',       name: 'Sharks',     abbreviation: 'SJO', marketSize: 'medium' },
    ];
    return CITY_POOL.filter(c => !existingCities.has(c.city));
  });

  ipcMain.handle('request-user-relocation', (_event: any, payload: { city: string; name: string; abbreviation: string; marketSize: string }) => {
    const season = getCurrentSeason();
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    if (userTeamId < 0) return { success: false, reason: 'No team selected.' };
    const cooldownRow = db.prepare("SELECT value FROM settings WHERE key = 'user_relocated_season'").get() as any;
    const lastReloc = cooldownRow ? parseInt(cooldownRow.value, 10) : 0;
    if (lastReloc > 0 && season - lastReloc < 10)
      return { success: false, reason: `You can relocate again in ${10 - (season - lastReloc)} season(s).` };
    const team = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(userTeamId) as any;
    if (!team) return { success: false, reason: 'Team not found.' };
    const oldCity = team.city;
    db.prepare('UPDATE teams SET city = ?, abbreviation = ?, relocated_from = ? WHERE id = ?').run(payload.city, payload.abbreviation, oldCity, userTeamId);
    db.prepare('UPDATE team_finances SET market_size = ? WHERE team_id = ?').run(payload.marketSize, userTeamId);
    const currentPatience = parseInt((db.prepare("SELECT value FROM settings WHERE key = 'owner_patience'").get() as any)?.value ?? '75', 10);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('owner_patience', ?)").run(String(Math.max(0, currentPatience - 10)));
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('user_relocated_season', ?)").run(String(season));
    const { logNewsEvent } = require('../helpers/logNewsEvent');
    logNewsEvent({
      eventType: 'league', category: 'season',
      headline: `${oldCity} ${team.name} Relocate to ${payload.city}`,
      detail: `The franchise moves from ${oldCity} to ${payload.city}, becoming the ${payload.city} ${team.name}.`,
      season,
    });
    return { success: true };
  });

  ipcMain.handle('get-recent-league-events', () => getRecentLeagueEvents(10));

  ipcMain.handle('get-all-gm-personalities', () =>
    db.prepare(`
      SELECT t.id, t.city, t.name, t.gm_personality
      FROM teams t ORDER BY t.city
    `).all());
}
