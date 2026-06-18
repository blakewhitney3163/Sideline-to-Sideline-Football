import { db } from '../database';
import { playerRepo, contractRepo } from '../repositories';
import { MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD, POSITION_TO_GROUP, WAIVER_POS_MAX, SOFT_CAP_M } from '../constants';
import { InjuredPlayer, Callup } from '../types';
import { getCurrentSeason } from '../helpers/getCurrentSeason';

const INJURY_TYPES = ['Hamstring', 'Ankle', 'Knee', 'Shoulder', 'Concussion', 'Rib', 'Back', 'Quad', 'Calf', 'Hand'];
const POS_INJURY_RISK: Record<string, number> = {
  QB: 0.025, RB: 0.055, WR: 0.035, TE: 0.035,
  OL: 0.020, DL: 0.025, LB: 0.035, CB: 0.035, S: 0.025, K: 0.008,
};

function getPosGroup(pos: string): string[] {
  if (['RB','HB','FB'].includes(pos)) return ['RB','HB','FB'];
  if (['OL','LT','LG','C','RG','RT'].includes(pos)) return ['OL','LT','LG','C','RG','RT'];
  if (['DL','DE','DT','LE','RE','IDL'].includes(pos)) return ['DL','DE','DT','LE','RE','IDL'];
  if (['LB','MLB','OLB','LOLB','ROLB','ILB','WILL','MIKE'].includes(pos)) return ['LB','MLB','OLB','LOLB','ROLB','ILB','WILL','MIKE'];
  if (['S','FS','SS'].includes(pos)) return ['S','FS','SS'];
  return [pos];
}

export function rollInjuries(playerStats: any[]): InjuredPlayer[] {
  const newlyInjured: InjuredPlayer[] = [];
  for (const stat of playerStats) {
    const player = playerRepo.getById(stat.player_id);
    if (!player || player.injury_status !== 'healthy') continue;
    if (Math.random() > (POS_INJURY_RISK[player.position] ?? 0.03)) continue;

    const rand = Math.random();
    let status: string, weeksOut: number;
    if (rand < 0.40)      { status = 'questionable'; weeksOut = 1; }
    else if (rand < 0.72) { status = 'out';          weeksOut = Math.floor(Math.random() * 2) + 2; }
    else if (rand < 0.92) { status = 'out';          weeksOut = Math.floor(Math.random() * 3) + 3; }
    else                  { status = 'ir';            weeksOut = Math.floor(Math.random() * 5) + 4; }

    const injuryType = INJURY_TYPES[Math.floor(Math.random() * INJURY_TYPES.length)]; // ← extract before push

    playerRepo.updateInjury(stat.player_id, status, weeksOut, injuryType);
    newlyInjured.push({
      player_id:      stat.player_id,
      team_id:        player.team_id!,
      position:       player.position,
      injury_status:  status,
      first_name:     player.first_name,     // ← add
      last_name:      player.last_name,      // ← add
      overall_rating: player.overall_rating, // ← add
      injury_type:    injuryType,            // ← add
      weeks_out:      weeksOut,              // ← add
    });
  }
  return newlyInjured;
}

export function processWaivers(userTeamId: number, week: number): void {
  const season = getCurrentSeason();
  const waiverPlayers = db.prepare(`
    SELECT p.id, p.waived_by_team_id, p.position, COALESCE(c.annual_salary, 1.0) as annual_salary
    FROM players p LEFT JOIN contracts c ON c.player_id = p.id
    WHERE p.roster_status = 'waivers' AND p.waiver_placed_week < ?
    ORDER BY p.overall_rating DESC
  `).all(week) as any[];
  if (waiverPlayers.length === 0) return;

  const cpuTeams = db.prepare(`
    SELECT t.id,
      COUNT(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                 OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 END) as wins
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    WHERE t.id != ? GROUP BY t.id ORDER BY wins ASC
  `).all(season, userTeamId) as any[];

  const remaining = [...waiverPlayers];
  for (const team of cpuTeams) {
    if (remaining.length === 0) break;
    if (playerRepo.getActiveCount(team.id) >= MAX_ACTIVE_ROSTER) continue;

    const teamSalary = (db.prepare(`SELECT COALESCE(SUM(c.annual_salary), 0) as total FROM contracts c JOIN players p ON c.player_id = p.id WHERE p.team_id = ?`).get(team.id) as any).total;

    let claimedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      if (p.waived_by_team_id === team.id || teamSalary + p.annual_salary > SOFT_CAP_M) continue;
      const groupPositions = getPosGroup(p.position);
      const maxAtPos = WAIVER_POS_MAX[POSITION_TO_GROUP[p.position] ?? p.position] ?? 5;
      const groupCount = (db.prepare(`SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active' AND position IN (${groupPositions.map(() => '?').join(',')})`).get(team.id, ...groupPositions) as any).count;
      if (groupCount >= maxAtPos) continue;
      claimedIdx = i;
      break;
    }
    if (claimedIdx === -1) continue;

    const claimed = remaining.splice(claimedIdx, 1)[0];
    db.prepare("UPDATE players SET team_id = ?, roster_status = 'active', is_free_agent = 0, waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?").run(team.id, claimed.id);
    const existing = contractRepo.getByPlayer(claimed.id);
    if (existing) contractRepo.updateTeam(claimed.id, team.id);
    else contractRepo.create(claimed.id, team.id, 1, claimed.annual_salary, 0, 0);
  }

  for (const p of remaining) { contractRepo.delete(p.id); playerRepo.releaseToFA(p.id); }
}

export function processRosterAdjustments(newlyInjured: InjuredPlayer[], userTeamId: number): { callups: Callup[]; userPSOpenSpots: number } {
  const callups: Callup[] = [];

  for (const injured of newlyInjured.filter(p => p.injury_status === 'out' || p.injury_status === 'ir')) {
    const group = getPosGroup(injured.position);
    const psPlayer = db.prepare(`SELECT id, first_name, last_name, position FROM players WHERE team_id = ? AND roster_status = 'practice_squad' AND position IN (${group.map(() => '?').join(', ')}) ORDER BY overall_rating DESC LIMIT 1`).get(injured.team_id, ...group) as any;

    if (psPlayer && playerRepo.getActiveCount(injured.team_id) < MAX_ACTIVE_ROSTER) {
      playerRepo.updateRosterStatus(psPlayer.id, 'active');
      const teamRow = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(injured.team_id) as any;
      callups.push({ name: `${psPlayer.first_name} ${psPlayer.last_name}`, position: psPlayer.position, teamName: teamRow ? `${teamRow.city} ${teamRow.name}` : 'Unknown', isUserTeam: injured.team_id === userTeamId });
    }
  }

  for (const team of db.prepare('SELECT id FROM teams').all() as any[]) {
    if (team.id === userTeamId) continue;
    const openSpots = MAX_PRACTICE_SQUAD - playerRepo.getPSCount(team.id);
    if (openSpots <= 0) continue;
    for (const fa of db.prepare("SELECT id FROM players WHERE team_id IS NULL ORDER BY overall_rating DESC LIMIT ?").all(openSpots) as any[]) {
      playerRepo.assignToPS(fa.id, team.id);
      contractRepo.createPS(fa.id, team.id);
    }
  }

  return { callups, userPSOpenSpots: Math.max(0, MAX_PRACTICE_SQUAD - playerRepo.getPSCount(userTeamId)) };
}
