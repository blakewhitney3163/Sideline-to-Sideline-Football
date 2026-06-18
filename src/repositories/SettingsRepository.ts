const { db } = require('../database');
import { Team } from '../types';

class SettingsRepository {
  get(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  getUserTeamId(): number | null {
    const val = this.get('user_team_id');
    return val !== null ? parseInt(val) : null;
  }

  getUserTeam(): Team | null {
    const teamId = this.getUserTeamId();
    if (teamId === null) return null;
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team ?? null;
  }

  getCurrentSeason(): number {
    const val = this.get('current_season');
    return val ? parseInt(val) : 2025;
  }
}

export const settingsRepo = new SettingsRepository();
