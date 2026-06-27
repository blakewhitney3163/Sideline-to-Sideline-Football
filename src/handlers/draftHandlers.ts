import { ipcMain } from 'electron';
import { db } from '../database';
import fs from 'fs';
import pathModule from 'path';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { playerRepo, contractRepo, pickRepo, draftRepo, settingsRepo } from '../repositories';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { scoutRepo } from '../repositories';
import { calcPickTradeValue, calcPlayerTradeValue } from '../services/TradeService';

function generateCombine(position: string, ovr: number): {
  forty_time: number; bench_press: number; vertical_jump: number;
  broad_jump: number; cone_time: number;
} {
  const noise = (range: number) => (Math.random() - 0.5) * range;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const f = (ovr - 50) / 50;
  const speedPos = ['WR', 'CB', 'RB', 'S'];
  const bigPos = ['OL'];
  const bigDef = ['DL'];
  let forty = 5.10 - f * 0.65 + noise(0.28);
  if (speedPos.includes(position)) forty -= 0.18;
  if (bigPos.includes(position)) forty += 0.30;
  if (bigDef.includes(position)) forty += 0.18;
  const forty_time = Math.round(clamp(forty, 4.22, 5.40) * 100) / 100;
  let bench = 16 + f * 12 + noise(9);
  if (bigPos.includes(position) || bigDef.includes(position)) bench += 7;
  if (['WR', 'QB', 'K'].includes(position)) bench -= 5;
  const bench_press = Math.round(clamp(bench, 5, 35));
  let vert = 32 + f * 10 + noise(7);
  if (['WR', 'CB', 'S', 'RB'].includes(position)) vert += 3;
  if (bigPos.includes(position)) vert -= 5;
  const vertical_jump = Math.round(clamp(vert, 24, 45) * 10) / 10;
  let broad = 114 + f * 20 + noise(14);
  if (['WR', 'CB', 'RB'].includes(position)) broad += 5;
  if (bigPos.includes(position)) broad -= 10;
  const broad_jump = Math.round(clamp(broad, 96, 142));
  let cone = 7.90 - f * 0.90 + noise(0.45);
  if (['CB', 'LB', 'WR', 'RB'].includes(position)) cone -= 0.22;
  if (bigPos.includes(position)) cone += 0.35;
  const cone_time = Math.round(clamp(cone, 6.50, 8.20) * 100) / 100;
  return { forty_time, bench_press, vertical_jump, broad_jump, cone_time };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getTeamName(teamId: number): string {
  const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
  return t ? `${t.city} ${t.name}` : 'Unknown Team';
}

function getDraftOrderTeamSlots(season: number): any[] {
  return db.prepare(`
    SELECT t.id as team_id,
    COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
    OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END), 0) as wins,
    COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
    OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END), 0) as losses
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    GROUP BY t.id
    ORDER BY wins ASC, losses DESC, t.id ASC
  `).all(season) as any[];
}

function getSlottedRookieSalary(round: number, pickInRound: number): number {
  if (round === 1) {
    if (pickInRound <= 5)  return Math.round((22 - (pickInRound - 1) * 2.0) * 10) / 10;
    if (pickInRound <= 16) return Math.round((12 - (pickInRound - 6) * 0.64) * 10) / 10;
    return Math.round(Math.max(2.5, 5 - (pickInRound - 17) * 0.15) * 10) / 10;
  }
  if (round === 2) return Math.round(Math.max(1.2, 2.5 - (pickInRound - 1) * 0.04) * 10) / 10;
  if (round === 3) return 1.3;
  if (round === 4) return 1.1;
  return 0.9;
}

function generateClassStrength(season: number, isDrought: boolean, isStrong: boolean): Record<string, string> {
  const POSITIONS = ['QB','RB','WR','TE','OL','DL','LB','CB','S','K'];
  const GRADES = ['elite','strong','average','weak','barren'];
  const weights = isDrought
    ? [0.02, 0.12, 0.36, 0.35, 0.15]
    : isStrong
    ? [0.15, 0.35, 0.36, 0.12, 0.02]
    : [0.06, 0.24, 0.40, 0.24, 0.06];
  const strength: Record<string, string> = {};
  for (const pos of POSITIONS) {
    const r = Math.random();
    let cumul = 0;
    for (let i = 0; i < GRADES.length; i++) {
      cumul += weights[i];
      if (r <= cumul) { strength[pos] = GRADES[i]; break; }
    }
    strength[pos] = strength[pos] ?? 'average';
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").run(`class_strength_${season}_${pos}`, strength[pos]);
  }
  return strength;
}

export function registerDraftHandlers(): void {

  ipcMain.handle('generate-draft-class', () => {
    const season = getCurrentSeason();
    const existing = draftRepo.countBySeason(season);
    if (existing > 0) return { already: true, count: existing };

    const isDrought = !!(db.prepare("SELECT value FROM settings WHERE key=?").get(`draft_talent_drought_${season}`) as any);
    const isStrong  = !!(db.prepare("SELECT value FROM settings WHERE key=?").get(`draft_strong_class_${season}`) as any);
    generateClassStrength(season, isDrought, isStrong);

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

    const ovrMod = isDrought ? -4 : isStrong ? 3 : 0;

    const prospects: any[] = [];
    for (let i = 0; i < 280; i++) {
      let ovr: number;
      if (i < 10)        ovr = Math.floor(Math.random() * 7) + 76 + ovrMod;
      else if (i < 32)   ovr = Math.floor(Math.random() * 7) + 71 + ovrMod;
      else if (i < 64)   ovr = Math.floor(Math.random() * 6) + 67 + ovrMod;
      else if (i < 96)   ovr = Math.floor(Math.random() * 6) + 64 + ovrMod;
      else if (i < 128)  ovr = Math.floor(Math.random() * 5) + 61;
      else if (i < 160)  ovr = Math.floor(Math.random() * 5) + 59;
      else if (i < 224)  ovr = Math.floor(Math.random() * 5) + 57;
      else               ovr = Math.floor(Math.random() * 6) + 52;
      ovr = Math.max(50, Math.min(99, ovr));
      const position = POS_POOL[Math.floor(Math.random() * POS_POOL.length)];
      const combine = generateCombine(position, ovr);
      prospects.push({
        season,
        first_name: FIRST[Math.floor(Math.random() * FIRST.length)],
        last_name: LAST[Math.floor(Math.random() * LAST.length)],
        position, overall_rating: ovr,
        dev_trait: getDevTrait(ovr),
        age: Math.random() < 0.6 ? 21 : Math.random() < 0.6 ? 22 : 23,
        ...combine,
      });
    }

    draftRepo.insertClass(prospects);
    return { generated: prospects.length };
  });

  ipcMain.handle('get-draft-class', () => draftRepo.getClass(getCurrentSeason()));

  ipcMain.handle('get-draft-class-strength', () => {
    const season = getCurrentSeason();
    const POSITIONS = ['QB','RB','WR','TE','OL','DL','LB','CB','S','K'];
    const result: Record<string, string> = {};
    for (const pos of POSITIONS) {
      const row = db.prepare("SELECT value FROM settings WHERE key=?").get(`class_strength_${season}_${pos}`) as any;
      result[pos] = row?.value ?? 'average';
    }
    return result;
  });

  ipcMain.handle('get-draft-order', () => {
    const season = getCurrentSeason();
    return db.prepare(`
      SELECT t.id, t.city, t.name, t.abbreviation,
      COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
      OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END), 0) as wins,
      COALESCE(SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
      OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END), 0) as losses
      FROM teams t
      LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY t.id
      ORDER BY wins ASC, losses DESC, t.id ASC
    `).all(season);
  });

  ipcMain.handle('get-round-pick-order', (_event: any, { round }: { round: number }) => {
    const season = getCurrentSeason();
    const teamSlots = getDraftOrderTeamSlots(season);
    const picks = db.prepare(`
      SELECT pa.id, pa.owner_team_id, pa.original_team_id, pa.is_used,
      ow.city as owner_city, ow.name as owner_name
      FROM pick_assets pa JOIN teams ow ON ow.id = pa.owner_team_id
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

    const pickInRound = pick - (round - 1) * 32;
    const sal = getSlottedRookieSalary(round, pickInRound);
    const playerId = rookie.lastInsertRowid as number;
    contractRepo.create(playerId, teamId, 4, sal, Math.round(sal * 4 * 0.5 * 10) / 10, 50);

    db.prepare('UPDATE contracts SET is_rookie_deal = 1 WHERE player_id = ?').run(playerId);
    if (round === 1) {
      db.prepare('UPDATE contracts SET fifth_year_option_eligible = 1 WHERE player_id = ?').run(playerId);
    }

    const usedPick = pickRepo.findUnusedForRound(teamId, round, getCurrentSeason());
    if (usedPick) pickRepo.markUsed(usedPick.id);

    const teamName = getTeamName(teamId);
    const devBadge = prospect.dev_trait !== 'Normal' ? ` [${prospect.dev_trait}]` : '';
    logNewsEvent({
      season: getCurrentSeason(),
      eventType: 'draft',
      category: 'draft',
      headline: `${teamName} select ${prospect.first_name} ${prospect.last_name} — ${ordinal(pick)} overall`,
      detail: `${prospect.position} | OVR ${prospect.overall_rating}${devBadge} | Round ${round}, Pick ${pickInRound} | 4-yr rookie deal ($${sal}M/yr)`,
    });

    return { success: true };
  });

  ipcMain.handle('scout-prospect', (_event: any, prospectId: number) => {
    const season = getCurrentSeason();
    const prospect = draftRepo.getById(prospectId);
    if (!prospect) return { success: false, reason: 'Prospect not found.' };
    if ((prospect.scouted ?? 0) >= 2) return { success: false, reason: 'Already fully scouted.' };
    const used = draftRepo.countScouted(season);
    const rawBudget = parseInt(settingsRepo.get(`scouting_budget_${season}`) ?? '25');
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    const myScouts = userTeamId > 0 ? (scoutRepo.getByTeam(userTeamId) as any[]) : [];
    const hasCollegeScout = myScouts.some((s: any) => s.specialty === 'College');
    const effectiveBudget = hasCollegeScout ? Math.floor(rawBudget / 0.7) : rawBudget;
    if (used >= effectiveBudget) return { success: false, reason: 'No scouting budget remaining.' };
    draftRepo.markScouted(prospectId);
    const newLevel = (prospect.scouted ?? 0) + 1;
    return { success: true, level: newLevel };
  });

  ipcMain.handle('get-scout-count', () => {
    const season = getCurrentSeason();
    const used = draftRepo.countScouted(season);
    const rawBudget = parseInt(settingsRepo.get(`scouting_budget_${season}`) ?? '25');
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    const myScouts = userTeamId > 0 ? (scoutRepo.getByTeam(userTeamId) as any[]) : [];
    const hasCollegeScout = myScouts.some((s: any) => s.specialty === 'College');
    const effectiveBudget = hasCollegeScout ? Math.floor(rawBudget / 0.7) : rawBudget;
    return { used, budget: effectiveBudget, hasCollegeScout };
  });

  ipcMain.handle('run-cpu-round', (_event: any, { round, userTeamId }: { round: number; userTeamId: number }) => {
    const season = getCurrentSeason();
    const teamSlots = getDraftOrderTeamSlots(season);
    const roundPicks = db.prepare(`
      SELECT pa.id, pa.owner_team_id, pa.original_team_id
      FROM pick_assets pa WHERE pa.season = ? AND pa.round = ? AND pa.is_used = 0
    `).all(season, round) as any[];
    const teamIds = teamSlots.map((ts: any) => ts.team_id);

    const ph = teamIds.map(() => '?').join(',');
    const posRows = db.prepare(`
      SELECT team_id, position, COUNT(*) as cnt FROM players
      WHERE team_id IN (${ph}) AND roster_status = 'active'
      GROUP BY team_id, position
    `).all(...teamIds) as any[];
    const posByTeam = new Map<number, Record<string, number>>();
    for (const row of posRows) {
      if (!posByTeam.has(row.team_id)) posByTeam.set(row.team_id, {});
      posByTeam.get(row.team_id)![row.position] = row.cnt;
    }
    const THRESHOLDS: Record<string, number> = { QB: 2, RB: 3, WR: 5, TE: 2, OL: 5, DL: 4, LB: 4, CB: 4, S: 2, K: 1 };
    const results: any[] = [];
    const runPicks = db.transaction(() => {
      for (let i = 0; i < teamSlots.length; i++) {
        const original = teamSlots[i];
        const pickAsset = roundPicks.find((p: any) => p.original_team_id === original.team_id);
        const ownerTeamId = pickAsset?.owner_team_id ?? original.team_id;
        if (ownerTeamId === userTeamId) continue;
        if (pickAsset?.is_used) continue;
        const byPos = posByTeam.get(ownerTeamId) ?? {};
        const needs = Object.keys(THRESHOLDS).filter(pos => (byPos[pos] ?? 0) < THRESHOLDS[pos]);
        let prospect: any = null;
        if (needs.length > 0) {
          const needsPh = needs.map(() => '?').join(',');
          prospect = db.prepare(`SELECT * FROM draft_prospects WHERE season = ? AND is_drafted = 0 AND position IN (${needsPh}) ORDER BY overall_rating DESC LIMIT 1`).get(season, ...needs);
        }
        if (!prospect) prospect = db.prepare('SELECT * FROM draft_prospects WHERE season = ? AND is_drafted = 0 ORDER BY overall_rating DESC LIMIT 1').get(season);
        if (!prospect) continue;
        const overallPick = (round - 1) * 32 + (i + 1);
        const pickInRound = i + 1;
        draftRepo.markDrafted(prospect.id, round, overallPick, ownerTeamId);
        const r = db.prepare(`
          INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent, dev_trait, roster_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active')
        `).run(
          prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
          Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
          ownerTeamId, prospect.dev_trait
        ) as any;
        const sal = getSlottedRookieSalary(round, pickInRound);
        const rookiePlayerId = r.lastInsertRowid as number;
        contractRepo.create(rookiePlayerId, ownerTeamId, 4, sal, Math.round(sal * 4 * 0.5 * 10) / 10, 50);
        db.prepare('UPDATE contracts SET is_rookie_deal = 1 WHERE player_id = ?').run(rookiePlayerId);
        if (round === 1) db.prepare('UPDATE contracts SET fifth_year_option_eligible = 1 WHERE player_id = ?').run(rookiePlayerId);
        if (pickAsset) pickRepo.markUsed(pickAsset.id);
        const teamPos = posByTeam.get(ownerTeamId) ?? {};
        teamPos[prospect.position] = (teamPos[prospect.position] ?? 0) + 1;
        posByTeam.set(ownerTeamId, teamPos);
        const isNotable = round === 1 || ['Star', 'Superstar', 'X-Factor'].includes(prospect.dev_trait);
        if (isNotable) {
          const teamName = getTeamName(ownerTeamId);
          const devBadge = prospect.dev_trait !== 'Normal' ? ` [${prospect.dev_trait}]` : '';
          logNewsEvent({
            season,
            eventType: 'draft',
            category: 'draft',
            headline: `${teamName} select ${prospect.first_name} ${prospect.last_name} — ${ordinal(overallPick)} overall`,
            detail: `${prospect.position} | OVR ${prospect.overall_rating}${devBadge} | Round ${round}, Pick ${pickInRound} | 4-yr deal ($${sal}M/yr)`,
          });
        }
        results.push({ round, pickInRound, teamId: ownerTeamId, prospect });
      }
    });
    runPicks();
    return results;
  });

  ipcMain.handle('complete-draft', () => {
    const season = getCurrentSeason();
    const undrafted = draftRepo.getUndrafted(season);
    db.transaction(() => {
      for (const p of undrafted) {
        db.prepare(`
          INSERT INTO players (first_name, last_name, position, age, overall_rating, speed, strength, awareness, team_id, is_free_agent, dev_trait, roster_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, 'free_agent')
        `).run(
          p.first_name, p.last_name, p.position, p.age, p.overall_rating,
          Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
          p.dev_trait
        );
        db.prepare('UPDATE draft_prospects SET is_drafted = 1 WHERE id = ?').run(p.id);
      }
    })();
    logNewsEvent({
      season,
      eventType: 'draft',
      category: 'draft',
      headline: `${season} Draft Complete`,
      detail: `${undrafted.length} undrafted prospects have entered free agency.`,
    });
    return { undrafted: undrafted.length };
  });

  ipcMain.handle('propose-draft-trade', (_event: any, payload: {
    userTeamId: number;
    myPickId: number;
    theirTeamId: number;
    theirPickId: number;
  }) => {
    const { userTeamId, myPickId, theirTeamId, theirPickId } = payload;
    const season = getCurrentSeason();

    const myPick    = db.prepare('SELECT * FROM pick_assets WHERE id = ? AND owner_team_id = ? AND is_used = 0').get(myPickId, userTeamId) as any;
    const theirPick = db.prepare('SELECT * FROM pick_assets WHERE id = ? AND owner_team_id = ? AND is_used = 0').get(theirPickId, theirTeamId) as any;

    if (!myPick)    return { accepted: false, reason: 'Your pick is not available.' };
    if (!theirPick) return { accepted: false, reason: 'Their pick is not available.' };

    const myVal    = calcPickTradeValue(myPick.round, myPick.season);
    const theirVal = calcPickTradeValue(theirPick.round, theirPick.season);
    const diff = myVal - theirVal;

    const noise = Math.floor(Math.random() * 12) - 4;
    if (diff + noise < -5) {
      return { accepted: false, reason: `Not enough value. Your pick (Round ${myPick.round}) grades below their pick (Round ${theirPick.round}).` };
    }

    db.transaction(() => {
      pickRepo.transfer(myPickId, theirTeamId);
      pickRepo.transfer(theirPickId, userTeamId);
    })();

    logNewsEvent({
      eventType: 'trade', category: 'transactions',
      headline: `In-Draft Trade: Pick Swap`,
      detail: `User trades Round ${myPick.round} pick to ${getTeamName(theirTeamId)} for Round ${theirPick.round} pick.`,
      season,
    });

    return { accepted: true };
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
    const normalize = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
    const allActivePlayers = db.prepare(`
      SELECT p.id, p.first_name, p.last_name FROM players p
      JOIN contracts c ON c.player_id = p.id
      WHERE p.is_free_agent = 0 AND p.roster_status = 'active'
    `).all() as any[];
    const exactMap = new Map<string, any>();
    const lastInitialMap = new Map<string, any>();
    for (const p of allActivePlayers) {
      const fn = normalize(p.first_name); const ln = normalize(p.last_name);
      exactMap.set(`${fn}:${ln}`, p);
      const initKey = `${fn.charAt(0)}:${ln}`;
      if (!lastInitialMap.has(initKey)) lastInitialMap.set(initKey, p);
    }
    let matched = 0;
    const updateContract = db.transaction(() => {
      for (const row of rows) {
        const nameParts = row.name.trim().split(/\s+/);
        if (nameParts.length < 2) continue;
        const first = normalize(nameParts[0]);
        const last = normalize(nameParts[nameParts.length - 1]);
        const player = exactMap.get(`${first}:${last}`) ?? lastInitialMap.get(`${first.charAt(0)}:${last}`);
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
