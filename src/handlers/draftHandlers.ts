import { ipcMain } from 'electron';
import { db } from '../database';
const fs = require('fs');
const pathModule = require('path');
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { playerRepo, contractRepo, pickRepo, draftRepo } from '../repositories';

export function registerDraftHandlers(): void {

  ipcMain.handle('generate-draft-class', () => {
    const season = getCurrentSeason();
    const existing = draftRepo.countBySeason(season);
    if (existing > 0) return { already: true, count: existing };

    const FIRST = ['James','John','Robert','Michael','David','William','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Justin','Scott','Brandon','Benjamin','Samuel','Nathan','Zachary','Peter','Kyle','Noah','Ethan','Jeremy','Austin','Sean','Dylan','Jordan','Jesse','Bryan','Gabriel','Logan','Marcus','Malik','Darius','Terrell','Jamal','Xavier','Darnell','Lamar','Kendall','Jaylen','Jalen','Devonte','Trey','Kameron','Zion','Isaiah','Damien','Dominic','Julian','Elijah','Tyrese','DeAndre','Rashad','Corey','Marquise','Deon','Alonzo','Deshawn','Marquez','Keanu','Trevon','Devin','Javon','Treylon','Brock','Bryce','Drake','Garrett','Caleb','Quinton','Jaylon','Dontae','Tariq','Amon','Romeo','Tyjae'];
    const LAST = ['Smith','Johnson','Williams','Jones','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia','Robinson','Clark','Lewis','Lee','Walker','Hall','Allen','Young','King','Wright','Hill','Scott','Green','Adams','Baker','Nelson','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy','Bailey','Cooper','Richardson','Cox','Howard','Ward','Peterson','Gray','James','Watson','Brooks','Kelly','Sanders','Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins','Perry','Powell','Long','Patterson','Hughes','Washington','Butler','Simmons','Foster','Bryant','Alexander','Russell','Griffin','Hayes','Ford','Hamilton','Graham','Sullivan','Wallace','Woods','Cole','West','Jordan','Owens','Reynolds','Fisher','Harrison','Gibson','McDonald','Marshall','Murray','Freeman','Wells','Tucker','Porter','Hunter','Hicks','Henry','Boyd','Mason','Kennedy','Warren','Burns','Gordon','Shaw','Holmes','Rice','Robertson','Hunt','Daniels','Palmer','Nichols','Grant','Knight','Ferguson','Stone','Hawkins','Perkins','Hudson','Spencer','Gardner','Payne','Pierce','Berry','Matthews','Willis','Ray','Watkins','Carroll','Duncan','Hart','Cunningham','Bradley','Andrews','Harper','Fox','Riley','Armstrong','Greene','Lawrence','Elliott','Sims','Morrow','Ingram','Bates','Flowers','Moss','Lamb'];
    const POS_POOL = ['QB','RB','WR','WR','WR','TE','OL','OL','OL','DL','DL','DL','LB','LB','CB','CB','S','K'];

    const getDevTrait = (ovr: number): string => {
      const r = Math.random();
      if (ovr >= 78) return r < 0.02 ? 'X-Factor' : r < 0.08 ? 'Superstar' : r < 0.40 ? 'Star' : 'Normal';
      if (ovr >= 74) return r < 0.01 ? 'X-Factor' : r < 0.05 ? 'Superstar' : r < 0.25 ? 'Star' : 'Normal';
      if (ovr >= 70) return r < 0.005 ? 'Superstar' : r < 0.12 ? 'Star' : 'Normal';
      return r < 0.05 ? 'Star' : 'Normal';
    };

    const prospects: any[] = [];
    for (let i = 0; i < 280; i++) {
      let ovr: number;
      if (i < 10) ovr = Math.floor(Math.random() * 7) + 76;
      else if (i < 32) ovr = Math.floor(Math.random() * 7) + 71;
      else if (i < 64) ovr = Math.floor(Math.random() * 6) + 67;
      else if (i < 96) ovr = Math.floor(Math.random() * 6) + 64;
      else if (i < 128) ovr = Math.floor(Math.random() * 5) + 61;
      else if (i < 160) ovr = Math.floor(Math.random() * 5) + 59;
      else if (i < 224) ovr = Math.floor(Math.random() * 5) + 57;
      else ovr = Math.floor(Math.random() * 6) + 52;

      prospects.push({
        season,
        first_name: FIRST[Math.floor(Math.random() * FIRST.length)],
        last_name: LAST[Math.floor(Math.random() * LAST.length)],
        position: POS_POOL[Math.floor(Math.random() * POS_POOL.length)],
        overall_rating: ovr,
        dev_trait: getDevTrait(ovr),
        age: Math.random() < 0.6 ? 21 : Math.random() < 0.6 ? 22 : 23,
      });
    }

    draftRepo.insertClass(prospects);
    return { generated: prospects.length };
  });

  ipcMain.handle('get-draft-class', () => {
    return draftRepo.getClass(getCurrentSeason());
  });

  ipcMain.handle('get-draft-order', () => {
    const season = getCurrentSeason();
    return db.prepare(`
      SELECT t.id, t.city, t.name, t.abbreviation,
        COALESCE((
          SELECT COUNT(*) FROM games g
          WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND ((g.home_team_id = t.id AND g.home_score > g.away_score)
          OR (g.away_team_id = t.id AND g.away_score > g.home_score))
        ), 0) as wins,
        COALESCE((
          SELECT COUNT(*) FROM games g
          WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND (g.home_team_id = t.id OR g.away_team_id = t.id)
        ), 0) as losses
      FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
    `).all(season, season);
  });

  ipcMain.handle('get-round-pick-order', (_event: any, { round }: { round: number }) => {
    const season = getCurrentSeason();
    const teamSlots = db.prepare(`
      SELECT t.id as team_id,
        COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND ((g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score))), 0) as wins,
        COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND (g.home_team_id = t.id OR g.away_team_id = t.id)), 0) as losses
      FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
    `).all(season, season) as any[];

    const picks = db.prepare(`
      SELECT pa.id, pa.owner_team_id, pa.original_team_id, pa.is_used,
        ow.city as owner_city, ow.name as owner_name
      FROM pick_assets pa
      JOIN teams ow ON ow.id = pa.owner_team_id
      WHERE pa.season = ? AND pa.round = ?
    `).all(season, round) as any[];

    return teamSlots.map((ts: any, idx: number) => {
      const pick = picks.find((p: any) => p.original_team_id === ts.team_id);
      return {
        slot: idx + 1,
        originalTeamId: ts.team_id,
        ownerTeamId: pick?.owner_team_id ?? ts.team_id,
        ownerCity: pick?.owner_city ?? '',
        ownerName: pick?.owner_name ?? '',
        pickAssetId: pick?.id ?? null,
        isUsed: pick?.is_used === 1,
        isTraded: pick ? pick.owner_team_id !== pick.original_team_id : false,
      };
    });
  });

  ipcMain.handle('make-draft-pick', (_event: any, { prospectId, teamId, round, pick }: {
    prospectId: number; teamId: number; round: number; pick: number;
  }) => {
    const prospect = draftRepo.getById(prospectId);
    if (!prospect || prospect.is_drafted) return { success: false, reason: 'Not available.' };

    draftRepo.markDrafted(prospectId, round, pick, teamId);

    const rookie = db.prepare(`
      INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent, dev_trait, roster_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active')
    `).run(
      prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
      Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
      teamId, prospect.dev_trait
    ) as any;

    const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
    contractRepo.create(rookie.lastInsertRowid, teamId, 4, sal, sal * 4 * 0.5, 50);

    const usedPick = pickRepo.findUnusedForRound(teamId, round, getCurrentSeason());
    if (usedPick) pickRepo.markUsed(usedPick.id);

    return { success: true };
  });

  ipcMain.handle('scout-prospect', (_event: any, prospectId: number) => {
    const season = getCurrentSeason();
    if (draftRepo.countScouted(season) >= 25) return { success: false, reason: 'No scouts remaining.' };
    draftRepo.markScouted(prospectId);
    return { success: true };
  });

  ipcMain.handle('get-scout-count', () => {
    return draftRepo.countScouted(getCurrentSeason());
  });

  ipcMain.handle('run-cpu-round', (_event: any, { round, userTeamId }: { round: number; userTeamId: number }) => {
    const season = getCurrentSeason();
    const teamSlots = db.prepare(`
      SELECT t.id as team_id,
        COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND ((g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score))), 0) as wins,
        COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND (g.home_team_id = t.id OR g.away_team_id = t.id)), 0) as losses
      FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
    `).all(season, season) as any[];

    const roundPicks = db.prepare(`
      SELECT pa.id, pa.owner_team_id, pa.original_team_id
      FROM pick_assets pa
      WHERE pa.season = ? AND pa.round = ? AND pa.is_used = 0
    `).all(season, round) as any[];

    const THRESHOLDS: Record<string, number> = { QB: 2, RB: 3, WR: 5, TE: 2, OL: 5, DL: 4, LB: 4, CB: 4, S: 2, K: 1 };
    const results: any[] = [];

    const runPicks = db.transaction(() => {
      for (let i = 0; i < teamSlots.length; i++) {
        const original = teamSlots[i];
        const pickAsset = roundPicks.find((p: any) => p.original_team_id === original.team_id);
        const ownerTeamId = pickAsset?.owner_team_id ?? original.team_id;

        if (ownerTeamId === userTeamId) continue;
        if (pickAsset?.is_used) continue;

        const counts = db.prepare(`SELECT position, COUNT(*) as cnt FROM players WHERE team_id = ? GROUP BY position`).all(ownerTeamId) as any[];
        const byPos: Record<string, number> = {};
        for (const r of counts) byPos[r.position] = r.cnt;
        const needs = Object.keys(THRESHOLDS).filter(pos => (byPos[pos] ?? 0) < THRESHOLDS[pos]);

        let prospect: any = null;
        if (needs.length > 0) {
          const ph = needs.map(() => '?').join(',');
          prospect = db.prepare(`SELECT * FROM draft_prospects WHERE season = ? AND is_drafted = 0 AND position IN (${ph}) ORDER BY overall_rating DESC LIMIT 1`).get(season, ...needs);
        }
        if (!prospect) prospect = db.prepare('SELECT * FROM draft_prospects WHERE season = ? AND is_drafted = 0 ORDER BY overall_rating DESC LIMIT 1').get(season);
        if (!prospect) continue;

        const overallPick = (round - 1) * 32 + (i + 1);
        draftRepo.markDrafted(prospect.id, round, overallPick, ownerTeamId);

        const r = db.prepare(`INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent, dev_trait, roster_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active')`).run(
          prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
          Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
          ownerTeamId, prospect.dev_trait
        ) as any;

        const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
        contractRepo.create(r.lastInsertRowid, ownerTeamId, 4, sal, sal * 4 * 0.5, 50);

        if (pickAsset) pickRepo.markUsed(pickAsset.id);
        results.push({ round, pickInRound: i + 1, teamId: ownerTeamId, prospect });
      }
    });
    runPicks();
    return results;
  });

  ipcMain.handle('complete-draft', () => {
    const season = getCurrentSeason();
    const undrafted = draftRepo.getUndrafted(season);
    const run = db.transaction(() => {
      for (const p of undrafted) {
        db.prepare(`INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent, dev_trait, roster_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, 'free_agent')`).run(
          p.first_name, p.last_name, p.position, p.age, p.overall_rating,
          Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
          p.dev_trait
        );
        db.prepare('UPDATE draft_prospects SET is_drafted = 1 WHERE id = ?').run(p.id);
      }
    });
    run();
    return { undrafted: undrafted.length };
  });

  ipcMain.handle('import-otc-contracts', (_event: any, filePath?: string) => {
    let otcPath = filePath;
    if (!otcPath) {
      const candidates = ['otc-contracts.html', 'otc-contracts.htm', 'otc-contracts.md', 'Contracts_Over_the_Cap.htm', 'Contracts_Over_the_Cap.html'];
      for (const name of candidates) {
        const p = pathModule.join(process.cwd(), name);
        if (fs.existsSync(p)) { otcPath = p; break; }
      }
    }
    if (!otcPath || !fs.existsSync(otcPath)) {
      return { success: false, reason: 'OTC file not found. Pass the full path or place the file in the project root.' };
    }

    const content: string = fs.readFileSync(otcPath, 'utf8');
    const parseMoney = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;
    const isHtml = content.trimStart().startsWith('<');

    interface OtcRow { name: string; position: string; aav: number; years: number; guaranteed: number; }
    const rows: OtcRow[] = [];

    if (isHtml) {
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(content)) !== null) {
        const cells: string[] = [];
        let cellMatch: RegExpExecArray | null;
        const cellReCopy = new RegExp(cellRe.source, 'gi');
        while ((cellMatch = cellReCopy.exec(rowMatch[1])) !== null) cells.push(stripTags(cellMatch[1]));
        if (cells.length < 5) continue;
        const cell2AsYears = parseInt(cells[2]);
        const isFormatA = cell2AsYears >= 1 && cell2AsYears <= 15 && parseMoney(cells[3]) > 0;
        let name: string, position: string, aav: number, years: number, gtd: number;
        name = cells[0]; position = cells[1] ?? '';
        if (isFormatA) {
          years = cell2AsYears; aav = parseMoney(cells[3]); gtd = parseMoney(cells[4]);
        } else {
          const totalValue = parseMoney(cells[3]);
          aav = parseMoney(cells[4]); gtd = parseMoney(cells[5] ?? '0');
          years = aav > 0 ? Math.round(totalValue / aav) : 0;
          if (years < 1 || years > 15) years = 0;
        }
        if (aav > 0 && years > 0) rows.push({ name, position, aav: aav / 1_000_000, years, guaranteed: gtd / 1_000_000 });
      }
    } else {
      for (const line of content.split('\n')) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const aav = parseMoney(parts[3]);
          const years = parseInt(parts[2]) || 0;
          if (aav > 0 && years > 0) rows.push({ name: parts[0].trim(), position: parts[1]?.trim() ?? '', aav: aav / 1_000_000, years, guaranteed: parseMoney(parts[4] ?? '0') / 1_000_000 });
        }
      }
    }

    let matched = 0;
    const normalize = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

    const updateContract = db.transaction(() => {
      for (const row of rows) {
        const nameParts = row.name.trim().split(/\s+/);
        if (nameParts.length < 2) continue;
        const first = normalize(nameParts[0]);
        const last = normalize(nameParts[nameParts.length - 1]);

        const players = db.prepare(`
          SELECT p.id, p.first_name, p.last_name FROM players p
          JOIN contracts c ON c.player_id = p.id
          WHERE p.is_free_agent = 0 AND p.roster_status = 'active'
        `).all() as any[];

        let player = players.find((p: any) => normalize(p.first_name) === first && normalize(p.last_name) === last);
        if (!player) {
          const firstInitial = first.charAt(0);
          player = players.find((p: any) => normalize(p.last_name) === last && normalize(p.first_name).charAt(0) === firstInitial);
        }
        if (!player) continue;

        const gtdPct = row.guaranteed > 0 && row.aav > 0
          ? Math.min(100, Math.round((row.guaranteed / (row.aav * row.years)) * 100))
          : 30;

        contractRepo.update(player.id, row.years, row.aav, row.guaranteed || Math.round(row.aav * row.years * 0.3 * 10) / 10, gtdPct);
        matched++;
      }
    });
    updateContract();

    return { success: true, total: rows.length, matched };
  });
}
