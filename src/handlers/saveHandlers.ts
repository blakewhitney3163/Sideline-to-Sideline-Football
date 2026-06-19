import { ipcMain, app } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDatabase } from '../database';

const SAVES_DIR = path.join(app.getPath('userData'), 'saves');

function ensureSavesDir(): void {
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
}

function savePath(name: string): string {
  return path.join(SAVES_DIR, `${name}.db`);
}

export interface SaveMeta {
  name: string;
  teamName: string | null;
  season: number | null;
  lastPlayed: string | null;
}

function readSaveMeta(name: string): SaveMeta {
  const filePath = savePath(name);
  let teamName: string | null = null;
  let season: number | null = null;
  let lastPlayed: string | null = null;
  try {
    const stat = fs.statSync(filePath);
    lastPlayed = stat.mtime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const peekDb = new Database(filePath, { readonly: true });
    const teamRow = peekDb.prepare(`
      SELECT t.city, t.name FROM settings s
      JOIN teams t ON t.id = CAST(s.value AS INTEGER)
      WHERE s.key = 'user_team_id' LIMIT 1
    `).get() as any;
    if (teamRow) teamName = `${teamRow.city} ${teamRow.name}`;
    const seasonRow = peekDb.prepare("SELECT value FROM settings WHERE key = 'current_season'").get() as any;
    if (seasonRow) season = parseInt(seasonRow.value, 10);
    peekDb.close();
  } catch { /* new or unreadable save */ }
  return { name, teamName, season, lastPlayed };
}

export function registerSaveHandlers(bootstrapDatabase: (isNew: boolean) => void): void {
  ensureSavesDir();

  ipcMain.handle('list-saves', (): SaveMeta[] => {
    ensureSavesDir();
    return fs.readdirSync(SAVES_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => readSaveMeta(f.replace(/\.db$/, '')))
      .sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''));
  });

  ipcMain.handle('open-save', (_event, name: string): { ok: boolean; meta: SaveMeta } => {
    const p = savePath(name);
    const isNew = !fs.existsSync(p);
    initDatabase(p);
    bootstrapDatabase(isNew);
    return { ok: true, meta: readSaveMeta(name) };
  });

  ipcMain.handle('delete-save', (_event, name: string): { ok: boolean } => {
    const p = savePath(name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  });

  ipcMain.handle('get-active-save', (): string | null => {
    // Returns the name of the currently loaded save by inspecting the active db path
    return _activeSaveName;
  });
}

// Track the active save name so get-active-save can return it
let _activeSaveName: string | null = null;

export function setActiveSaveName(name: string): void {
  _activeSaveName = name;
}
