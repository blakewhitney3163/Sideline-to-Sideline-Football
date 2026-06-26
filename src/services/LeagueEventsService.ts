import { db } from '../database';
import { logNewsEvent } from '../helpers/logNewsEvent';

interface EventDef {
  id: string;
  headline: string;
  detail: string;
  effect: (season: number) => void;
}

const LEAGUE_EVENTS: EventDef[] = [
  {
    id: 'fa_frenzy',
    headline: 'Free Agent Frenzy Declared',
    detail: 'Record offseason spending — top free agents see enhanced demand and raised contract expectations.',
    effect: (_season) => {
      db.prepare(`UPDATE players SET overall_rating = MIN(99, overall_rating + 1)
        WHERE is_free_agent = 1 AND overall_rating >= 80`).run();
    },
  },
  {
    id: 'talent_drought',
    headline: 'Historic Draft Talent Drought',
    detail: 'Scouts report this incoming class is one of the weakest in decades. Top prospects grade out lower than usual.',
    effect: (season) => {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(`draft_talent_drought_${season}`, '1');
    },
  },
  {
    id: 'strong_class',
    headline: 'Elite Draft Class Expected',
    detail: 'An unusually deep class of college prospects is set to enter the league. Multiple franchise-caliber players available.',
    effect: (season) => {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(`draft_strong_class_${season}`, '1');
    },
  },
  {
    id: 'stadium_expansion',
    headline: 'Stadium Expansion Wave',
    detail: 'Multiple franchises announce major venue upgrades. Fan interest and attendance projections surge.',
    effect: (_season) => {
      const teams = db.prepare('SELECT team_id FROM team_finances ORDER BY RANDOM() LIMIT 5').all() as any[];
      for (const t of teams)
        db.prepare('UPDATE team_finances SET stadium_capacity = MIN(stadium_capacity + 4000, 100000) WHERE team_id = ?').run(t.team_id);
    },
  },
  {
    id: 'injury_plague',
    headline: 'League-Wide Soft-Tissue Injury Spike',
    detail: 'Medical researchers cite compacted schedules and rule changes as driving factors in an unusual wave of non-contact injuries.',
    effect: (season) => {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(`injury_plague_season`, String(season));
    },
  },
  {
    id: 'primetime_boom',
    headline: 'Record Broadcast Deal Signed',
    detail: 'The league\'s new media rights package pushes revenue to all-time highs. Winning franchises benefit most.',
    effect: (season) => {
      const rows = db.prepare(`
        SELECT t.id,
          COALESCE(SUM(CASE WHEN (g.home_team_id=t.id AND g.home_score>g.away_score)
                            OR (g.away_team_id=t.id AND g.away_score>g.home_score) THEN 1 ELSE 0 END),0) as wins,
          COUNT(g.id) as played
        FROM teams t
        LEFT JOIN games g ON (g.home_team_id=t.id OR g.away_team_id=t.id)
          AND g.season=? AND g.is_simulated=1 AND g.is_playoff=0
        GROUP BY t.id
      `).all(season - 1) as any[];
      const upd = db.prepare('UPDATE team_finances SET season_revenue = season_revenue + ? WHERE team_id = ?');
      for (const row of rows) {
        const winPct = row.played >= 4 ? row.wins / row.played : 0.5;
        const bonus = Math.round((8 + winPct * 18) * 10) / 10;
        upd.run(bonus, row.id);
      }
    },
  },
  {
    id: 'cba_extension',
    headline: 'CBA Extended Through the Decade',
    detail: 'Owners and players reach a landmark agreement. Labor peace is secured, bringing stability to the entire league.',
    effect: (_season) => { /* narrative only */ },
  },
  {
    id: 'expansion_fever',
    headline: 'Expansion Fever Sweeps Ownership',
    detail: 'Multiple city ownership groups lobby hard for franchises. The expansion vote threshold is lowered this offseason.',
    effect: (season) => {
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(`expansion_fever_${season}`, '1');
    },
  },
  {
    id: 'parity_push',
    headline: 'Competitive Balance Initiative Announced',
    detail: 'The league office introduces rule tweaks designed to promote parity. Small-market teams see a modest revenue share boost.',
    effect: (_season) => {
      const small = db.prepare("SELECT team_id FROM team_finances WHERE market_size = 'small'").all() as any[];
      for (const t of small)
        db.prepare('UPDATE team_finances SET season_revenue = season_revenue + 12 WHERE team_id = ?').run(t.team_id);
    },
  },
  {
    id: 'player_empowerment',
    headline: 'Player Empowerment Era Intensifies',
    detail: 'High-profile trade demands and holdouts are on the rise. Elite players across the league leverage their leverage.',
    effect: (_season) => {
      // Slightly lower morale for players on expiring deals with high OVR
      db.prepare(`
        UPDATE players SET morale = MAX(40, morale - 8)
        WHERE overall_rating >= 84
          AND id IN (SELECT player_id FROM contracts WHERE years_remaining = 1)
      `).run();
    },
  },
];

export function checkLeagueEvents(season: number): void {
  const alreadyKey = `league_event_${season}`;
  const already = db.prepare('SELECT value FROM settings WHERE key = ?').get(alreadyKey) as any;
  if (already) return;

  if (Math.random() > 0.45) return;

  const event = LEAGUE_EVENTS[Math.floor(Math.random() * LEAGUE_EVENTS.length)];
  try { event.effect(season); } catch (err) { console.error('League event effect error:', err); }

  logNewsEvent({
    eventType: 'league_event',
    category: 'league_event',
    headline: event.headline,
    detail: event.detail,
    season,
  });

  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(alreadyKey, event.id);
  console.log(`League event triggered (${season}): ${event.headline}`);
}

export function getRecentLeagueEvents(limit = 10): any[] {
  return db.prepare(`
    SELECT season, headline, detail, created_at
    FROM news_events
    WHERE category = 'league_event'
    ORDER BY season DESC, id DESC
    LIMIT ?
  `).all(limit) as any[];
}
