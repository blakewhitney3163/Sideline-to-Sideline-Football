const { db } = require('../database');

export function balanceRosters(): void {
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const run = db.transaction(() => {
    for (const team of teams) {
      const players = db.prepare(`
        SELECT id FROM players
        WHERE team_id = ? AND roster_status IN ('active', 'practice_squad')
        ORDER BY overall_rating DESC
      `).all(team.id) as any[];
      players.forEach((p: any, i: number) => {
        if (i < 53) {
          db.prepare(`UPDATE players SET roster_status = 'active' WHERE id = ?`).run(p.id);
        } else if (i < 69) {
          db.prepare(`UPDATE players SET roster_status = 'practice_squad' WHERE id = ?`).run(p.id);
        } else {
          db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?`).run(p.id);
          db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
        }
      });
    }
  });
  run();
}
