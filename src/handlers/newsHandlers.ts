import { ipcMain } from 'electron';
import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';

const LEAGUE_TYPES = ['cpu_signing', 'release', 'trade', 'signing', 'resign'];

export function registerNewsHandlers(): void {
  ipcMain.handle('get-news-feed', (_event: any, opts?: { season?: number; category?: string; limit?: number }) => {
    const season = opts?.season ?? getCurrentSeason();
    const limit  = opts?.limit ?? 75;
    const params: any[] = [season];

    let query = `
      SELECT n.id, n.season, n.week, n.event_type, n.category,
             n.headline, n.detail, n.player_id, n.created_at,
             t.city || ' ' || t.name AS team_name
      FROM news_events n
      LEFT JOIN teams t ON n.team_id = t.id
      WHERE n.season = ?
    `;

    if (opts?.category && opts.category !== 'all') {
      if (opts.category === 'league') {
        const ph = LEAGUE_TYPES.map(() => '?').join(',');
        query += ` AND n.event_type IN (${ph})`;
        params.push(...LEAGUE_TYPES);
      } else {
        query += ` AND n.category = ?`;
        params.push(opts.category);
      }
    }

    query += ` ORDER BY n.id DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params);
  });

  ipcMain.handle('get-news-seasons', () =>
    (db.prepare(`SELECT DISTINCT season FROM news_events ORDER BY season DESC`).all() as any[])
      .map((r: any) => r.season)
  );

  ipcMain.handle('get-news-unseen-count', (_event: any, season: number) => {
    const key = `news_last_seen_${season}`;
    const lastId = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any ?? '{ "value": "0" }', 10) || 0;
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM news_events WHERE season = ? AND id > ? AND event_type IN (${LEAGUE_TYPES.map(() => '?').join(',')})`).get(season, lastId, ...LEAGUE_TYPES) as any;
    return row?.cnt ?? 0;
  });

  ipcMain.handle('mark-news-seen', (_event: any, season: number) => {
    const maxRow = db.prepare('SELECT MAX(id) as maxId FROM news_events WHERE season = ?').get(season) as any;
    const key = `news_last_seen_${season}`;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(maxRow?.maxId ?? 0));
  });
}
