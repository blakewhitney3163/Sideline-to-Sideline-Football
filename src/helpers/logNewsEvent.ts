import { db } from '../database';
import { getCurrentSeason } from './getCurrentSeason';

export type NewsCategory =
  | 'transactions'
  | 'injuries'
  | 'injury'
  | 'draft'
  | 'season'
  | 'milestones'
  | 'game'
  | 'trade';

export function logNewsEvent(params: {
  eventType?: string;
  category: NewsCategory;
  headline?: string;
  title?: string;
  detail?: string;
  body?: string;
  teamId?: number | null;
  playerId?: number | null;
  season?: number;
  week?: number;
}): void {
  try {
    const season = params.season ?? getCurrentSeason();
    const headline = params.headline ?? params.title ?? '';
    const detail = params.detail ?? params.body ?? null;
    db.prepare(`
      INSERT INTO news_events (season, week, event_type, category, headline, detail, team_id, player_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      season,
      params.week ?? 0,
      params.eventType ?? params.category,
      params.category,
      headline,
      detail,
      params.teamId ?? null,
      params.playerId ?? null,
    );
  } catch (_) {}
}
