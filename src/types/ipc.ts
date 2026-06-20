import type { IpcMainInvokeEvent } from 'electron';

// Convenience alias — use instead of `any` for the first param of ipcMain.handle callbacks
export type IpcEvent = IpcMainInvokeEvent;

// ─── Common Inline DB Row Types ───────────────────────────────────────────────
// Used wherever db.prepare().get() / .all() returns a partial row in handler files.

export interface TeamNameRow   { city: string; name: string; }
export interface TeamIdRow     { id: number; }

export interface PlayerNameRow         { first_name: string; last_name: string; }
export interface PlayerWithPositionRow { first_name: string; last_name: string; position: string; }
export interface PlayerWithTeamRow     { first_name: string; last_name: string; position: string; team_id: number; }

export interface RatingRow    { overall_rating: number; }
export interface CoverageRow  { coverage: number | null; }
export interface PassRushRow  { pass_rush: number | null; }
export interface CountRow     { count: number; }
export interface CntRow       { cnt: number; }

export interface QbStatsRow   { throw_accuracy: number | null; speed?: number | null; }
export interface SchemeDbRow  { offense_scheme: string; defense_scheme: string; }
