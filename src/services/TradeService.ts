import { db } from '../database';
import { playerRepo, contractRepo, pickRepo, gameRepo } from '../repositories';
import { TRADE_DEADLINE_WEEK } from '../constants';
import { TradeResult } from '../types';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { settingsRepo } from '../repositories';

export function calcPlayerTradeValue(ovr: number, age: number, position: string, devTrait = 'Normal'): number {
  const ageFactor = age <= 23 ? 1.4 : age <= 26 ? 1.25 : age <= 29 ? 1.0 : age <= 32 ? 0.75 : age <= 35 ? 0.5 : 0.3;
  const posFactor: Record<string, number> = {
    QB: 1.4, CB: 1.15, DL: 1.15, LB: 1.1, WR: 1.1, TE: 1.1, OL: 1.05, S: 1.0, RB: 0.85, K: 0.7,
  };
  const traitFactor: Record<string, number> = { Normal: 1.0, Star: 1.15, Superstar: 1.3, 'X-Factor': 1.5 };
  return Math.round(ovr * ageFactor * (posFactor[position] ?? 1.0) * (traitFactor[devTrait] ?? 1.0));
}

export function calcPickTradeValue(round: number, season: number): number {
  const roundValues: Record<number, number> = { 1: 100, 2: 65, 3: 40, 4: 22, 5: 13, 6: 8, 7: 4 };
  return Math.round((roundValues[round] ?? 4) * (season <= getCurrentSeason() ? 1.0 : 0.80));
}

export function getTeamNeeds(teamId: number): string[] {
  const TARGETS: Record<string, { min: number; ideal: number; topN: number; minOvr: number }> = {
    QB: { min: 2, ideal: 3, topN: 1, minOvr: 72 }, RB: { min: 3, ideal: 4, topN: 2, minOvr: 70 },
    WR: { min: 4, ideal: 5, topN: 3, minOvr: 70 }, TE: { min: 2, ideal: 3, topN: 1, minOvr: 68 },
    OL: { min: 6, ideal: 8, topN: 5, minOvr: 68 }, DL: { min: 4, ideal: 6, topN: 4, minOvr: 68 },
    LB: { min: 3, ideal: 5, topN: 3, minOvr: 68 }, CB: { min: 3, ideal: 5, topN: 2, minOvr: 68 },
    S: { min: 2, ideal: 3, topN: 2, minOvr: 68 }, K: { min: 1, ideal: 1, topN: 1, minOvr: 60 },
  };
  const roster = playerRepo.getByTeam(teamId, 'active');
  const needs: string[] = [];
  for (const [pos, t] of Object.entries(TARGETS)) {
    const posPlayers = roster.filter((p: any) => p.position === pos);
    if (posPlayers.length < t.min) { needs.push(pos); continue; }
    const topAvg = posPlayers.slice(0, t.topN).reduce((s: number, p: any) => s + p.overall_rating, 0) / t.topN;
    if (posPlayers.length < t.ideal || topAvg < t.minOvr) needs.push(pos);
  }
  return needs;
}

function getPlayerAvailabilityPremium(player: { age: number; position: string; dev_trait: string }): number {
  const trait = player.dev_trait ?? 'Normal';
  let premium = 0;
  if (player.position === 'QB' && player.age <= 26)
    premium += trait === 'X-Factor' ? 80 : trait === 'Superstar' ? 50 : trait === 'Star' ? 25 : 10;
  if (player.age <= 25 && (trait === 'X-Factor' || trait === 'Superstar'))
    premium += trait === 'X-Factor' ? 50 : 30;
  if (player.age <= 25 && trait === 'Star') premium += 15;
  return premium;
}

export const STATUS_META: Record<string, { description: string; acceptanceThreshold: number; color?: string; bg?: string }> = {
  Contender: { description: 'Competing for a title — demands full value in any deal.', acceptanceThreshold: -3, color: '#4caf50', bg: '#0a1a0a' },
  Buyer:     { description: 'Looking to add a piece for a playoff push.',             acceptanceThreshold: -8, color: '#4FC3F7', bg: '#0a1a2a' },
  Neutral:   { description: 'No strong inclination to buy or sell right now.',        acceptanceThreshold: -8, color: '#aaa',    bg: '#1a1a1a' },
  Seller:    { description: 'Moving veterans for future assets — open to dealing.',   acceptanceThreshold: -18, color: '#FF8740', bg: '#1a0e00' },
  Rebuilding:{ description: 'Tearing it down. Will move anyone for the right offer.',acceptanceThreshold: -22, color: '#e57373', bg: '#1a0808' },
};

export function getTeamTradeProfile(teamId: number): {
  status: string; description: string; acceptanceThreshold: number;
  wins: number; losses: number; avgOverall: number; isOverridden: boolean;
} {
  const season = getCurrentSeason();
  const record = gameRepo.getTeamRecord(teamId, season);
  const { wins, losses } = record;
  const gamesPlayed = wins + losses + record.ties;
  const winPct = gamesPlayed >= 4 ? wins / gamesPlayed : 0.5;

  const roster = playerRepo.getByTeam(teamId, 'active');
  const avgOverall = roster.length ? Math.round(roster.reduce((s: number, p: any) => s + p.overall_rating, 0) / roster.length) : 75;
  const avgAge = roster.length ? roster.reduce((s: number, p: any) => s + p.age, 0) / roster.length : 26;
  const eliteCount = roster.filter((p: any) => p.overall_rating >= 85).length;
  const topQBAge = roster.find((p: any) => p.position === 'QB')?.age ?? 26;
  const hasXFactor = roster.some((p: any) => (p.dev_trait === 'X-Factor' || p.dev_trait === 'Superstar') && p.age >= 27);

  function autoDetect(): string {
    const winning = winPct >= 0.55;
    const losing = winPct < 0.40;
    const talented = avgOverall >= 78;
    const old = avgAge >= 27.5;
    const young = avgAge <= 25.5;
    const winNow = old || (hasXFactor && topQBAge >= 28);
    if (winning && talented && (winNow || eliteCount >= 4)) return 'Contender';
    if (winning || (talented && !young && winNow)) return 'Buyer';
    if (losing && talented && old) return 'Seller';
    if (losing || (young && !talented)) return 'Rebuilding';
    return 'Neutral';
  }

  const override = db.prepare('SELECT status FROM team_trade_overrides WHERE team_id = ?').get(teamId) as any;
  const resolvedStatus = override?.status ?? autoDetect();
  const meta = STATUS_META[resolvedStatus] ?? STATUS_META['Neutral'];
  return { status: resolvedStatus, description: meta.description, acceptanceThreshold: meta.acceptanceThreshold, wins, losses, avgOverall, isOverridden: !!override?.status };
}

export function proposeTrade(params: {
  myTeamId: number; theirTeamId: number;
  myPlayerIds: number[]; theirPlayerIds: number[];
  myPickIds: number[]; theirPickIds: number[];
}): TradeResult {
  const { myTeamId, theirTeamId, myPlayerIds, theirPlayerIds, myPickIds, theirPickIds } = params;
  const season = getCurrentSeason();

  if (gameRepo.countBySeason(season) > 0) {
    const currentWeek = gameRepo.getCurrentWeek(season);
    if (!currentWeek || currentWeek > TRADE_DEADLINE_WEEK)
      return { accepted: false, reason: 'The trade deadline has passed (after Week 8). Trades reopen in the offseason.' };
  }

  const myPlayers = myPlayerIds.map(id => playerRepo.getById(id)).filter((p): p is NonNullable<typeof p> => p !== null && p.team_id === myTeamId);
  const theirPlayers = theirPlayerIds.map(id => playerRepo.getById(id)).filter((p): p is NonNullable<typeof p> => p !== null && p.team_id === theirTeamId);

  if (myPlayers.length === 0 && myPickIds.length === 0) return { accepted: false, reason: 'You must include at least one player or pick.' };
  if (theirPlayers.length === 0 && theirPickIds.length === 0) return { accepted: false, reason: 'Select at least one player or pick to receive.' };

  const myValue =
    myPlayers.reduce((s, p) => s + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0) +
    myPickIds.reduce((s, id) => { const pk = pickRepo.getById(id, myTeamId); return s + (pk ? calcPickTradeValue(pk.round, pk.season) : 0); }, 0);
  const theirValue =
    theirPlayers.reduce((s, p) => s + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0) +
    theirPickIds.reduce((s, id) => { const pk = pickRepo.getById(id, theirTeamId); return s + (pk ? calcPickTradeValue(pk.round, pk.season) : 0); }, 0);

  const valueDiff = myValue - theirValue;
  const randomFactor = Math.floor(Math.random() * 11) - 5;
  const profile = getTeamTradeProfile(theirTeamId);
  const availabilityPremium = theirPlayers.reduce((s, p) => s + getPlayerAvailabilityPremium(p), 0);
  const needBonus = myPlayers.filter(p => getTeamNeeds(theirTeamId).includes(p.position)).length * 8;
  const effectiveThreshold = profile.acceptanceThreshold + availabilityPremium - needBonus;
  const accepted = (valueDiff + randomFactor) >= effectiveThreshold;

  if (accepted) {
    db.transaction(() => {
      for (const p of myPlayers) { playerRepo.updateTeam(p.id, theirTeamId); contractRepo.updateTeam(p.id, theirTeamId); }
      for (const p of theirPlayers) { playerRepo.updateTeam(p.id, myTeamId); contractRepo.updateTeam(p.id, myTeamId); }
      for (const id of myPickIds) pickRepo.transfer(id, theirTeamId);
      for (const id of theirPickIds) pickRepo.transfer(id, myTeamId);
    })();
    return { accepted: true };
  }

  const gap = Math.max(0, Math.ceil((effectiveThreshold - valueDiff - randomFactor) / 5) * 5);
  return {
    accepted: false,
    reason: availabilityPremium > 40 ? 'That player is a cornerstone of our franchise — not available at any price.' :
      availabilityPremium > 0 ? 'We\'re very protective of that player. Sweeten the offer significantly.' :
      gap > 0 ? `Not enough value — add ~${gap} more trade value to make this work.` :
      'We\'re not interested at this time.',
  };
}

export function getCpuTradeOffers(userTeamId: number): any[] {
  const season = getCurrentSeason();
  const currentWeek = gameRepo.getCurrentWeek(season);
    if (!currentWeek || currentWeek > 10) return [];
  if (currentWeek < 1) return [];

  // Season cap: max 3 offers delivered total this season
  const sentKey = `trade_offers_sent_${season}`;
  const sentCount = parseInt(settingsRepo.get(sentKey) ?? '0');
  if (sentCount >= 3) return [];

  // Base 18% chance per week; +15% deadline urgency bump in weeks 6-8 for contenders
  const baseChance = 0.18;
  const deadlineBump = currentWeek >= 6 && currentWeek <= 8 ? 0.15 : 0;
  if (Math.random() > baseChance + deadlineBump) return [];

  const cpuTeams = db.prepare(`SELECT id, city, name FROM teams WHERE id != ? ORDER BY RANDOM()`).all(userTeamId) as any[];

  const userPlayersAll = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary AS salary
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id AND c.team_id = p.team_id
    WHERE p.team_id = ? AND p.roster_status = 'active'
    ORDER BY p.overall_rating DESC
  `).all(userTeamId) as any[];

  const stmtCpuPlayers = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary AS salary
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id AND c.team_id = p.team_id
    WHERE p.team_id = ? AND p.roster_status = 'active'
    ORDER BY RANDOM()
  `);

  const stmtVeterans = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary AS salary
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id AND c.team_id = p.team_id
    WHERE p.team_id = ? AND p.roster_status = 'active'
      AND p.overall_rating >= 76 AND p.dev_trait != 'X-Factor'
      AND (p.age >= 28 OR p.dev_trait IN ('Star','Superstar'))
    ORDER BY p.overall_rating DESC
  `);

  const offers: any[] = [];
  const MAX_OFFERS = 3;
  const claimedUserPlayerIds = new Set<number>();

  for (const cpuTeam of cpuTeams.slice(0, 15)) {
    if (offers.length >= MAX_OFFERS) break;
    const { status } = getTeamTradeProfile(cpuTeam.id);

    if (status === 'Buyer' || status === 'Contender') {
      const cpuNeeds = getTeamNeeds(cpuTeam.id);
      if (cpuNeeds.length === 0) continue;

      const wanted = userPlayersAll.find((p: any) =>
        !claimedUserPlayerIds.has(p.id) &&
        cpuNeeds.includes(p.position) && p.overall_rating >= 72 && p.dev_trait !== 'X-Factor'
      );
      if (!wanted) continue;

      const requestedValue = calcPlayerTradeValue(wanted.overall_rating, wanted.age, wanted.position, wanted.dev_trait);
      const cpuPlayers = stmtCpuPlayers.all(cpuTeam.id) as any[];

      const offerPlayer = cpuPlayers.find((p: any) => {
        const v = calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait);
        return v >= requestedValue * 0.78 && v <= requestedValue * 1.15;
      });
      if (!offerPlayer) continue;

      const offerValue = calcPlayerTradeValue(offerPlayer.overall_rating, offerPlayer.age, offerPlayer.position, offerPlayer.dev_trait);
      const gap = requestedValue - offerValue;

      let offeredPick: any = null;
      if (gap > 12 && gap <= requestedValue * 0.30) {
        offeredPick = pickRepo.getByTeam(cpuTeam.id, season).find((pk: any) => {
          const pv = calcPickTradeValue(pk.round, pk.season);
          return pv >= gap * 0.65 && pv <= gap * 1.35;
        }) ?? null;
      }

      claimedUserPlayerIds.add(wanted.id);
      offers.push({
        fromTeamId: cpuTeam.id, fromTeamName: `${cpuTeam.city} ${cpuTeam.name}`,
        requestedPlayer: wanted, requestedValue,
        offeredPlayer: offerPlayer, offeredPick,
        offerValue: offerValue + (offeredPick ? calcPickTradeValue(offeredPick.round, offeredPick.season) : 0),
      });
      continue;
    }

    if (status === 'Seller' || status === 'Rebuilding') {
      const veterans = stmtVeterans.all(cpuTeam.id) as any[];
      if (veterans.length === 0) continue;

      const offering = veterans[Math.floor(Math.random() * Math.min(4, veterans.length))];
      const offerValue = calcPlayerTradeValue(offering.overall_rating, offering.age, offering.position, offering.dev_trait);

      const target = userPlayersAll.find((p: any) => {
        if (p.age > 26 || claimedUserPlayerIds.has(p.id)) return false;
        const v = calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait);
        return v >= offerValue * 0.70 && v <= offerValue * 0.95;
      });
      if (!target) continue;

      const targetValue = calcPlayerTradeValue(target.overall_rating, target.age, target.position, target.dev_trait);
      let bonusPick: any = null;
      if (offerValue < targetValue) {
        const gap = targetValue - offerValue;
        bonusPick = pickRepo.getByTeam(cpuTeam.id, season).find((pk: any) => {
          const pv = calcPickTradeValue(pk.round, pk.season);
          return pv >= gap * 0.5 && pv <= gap * 1.2;
        }) ?? null;
      }

      claimedUserPlayerIds.add(target.id);
      offers.push({
        fromTeamId: cpuTeam.id, fromTeamName: `${cpuTeam.city} ${cpuTeam.name}`,
        requestedPlayer: target, requestedValue: targetValue,
        offeredPlayer: offering, offeredPick: bonusPick,
        offerValue: offerValue + (bonusPick ? calcPickTradeValue(bonusPick.round, bonusPick.season) : 0),
      });
    }
  }
  if (offers.length > 0) {
    const sentKey = `trade_offers_sent_${season}`;
    const prev = parseInt(settingsRepo.get(sentKey) ?? '0');
    settingsRepo.set(sentKey, String(prev + offers.length));
  }
  
  return offers;
}

export function runCpuTrades(userTeamId: number): number {
  const season = getCurrentSeason();
  const currentWeek = gameRepo.getCurrentWeek(season);
  if (!currentWeek || currentWeek > TRADE_DEADLINE_WEEK) return 0;
  if (currentWeek < 2) return 0;

  const allTeams = db.prepare('SELECT id, city, name FROM teams WHERE id != ?').all(userTeamId) as any[];

  const buyers: any[] = [];
  const sellers: any[] = [];
  for (const team of allTeams) {
    const { status } = getTeamTradeProfile(team.id);
    if (status === 'Contender' || status === 'Buyer') buyers.push({ ...team, status });
    if (status === 'Seller' || status === 'Rebuilding') sellers.push({ ...team, status });
  }

  if (buyers.length === 0 || sellers.length === 0) return 0;

  buyers.sort(() => Math.random() - 0.5);
  sellers.sort(() => Math.random() - 0.5);

  const stmtCandidate = db.prepare(`
    SELECT id, first_name, last_name, position, overall_rating, age, dev_trait
    FROM players
    WHERE team_id = ? AND position = ? AND overall_rating >= 74
    AND age >= 26 AND dev_trait != 'X-Factor' AND roster_status = 'active'
    ORDER BY overall_rating DESC LIMIT 1
  `);
  const stmtBuyerPlayers = db.prepare(`
    SELECT id, first_name, last_name, position, overall_rating, age, dev_trait
    FROM players
    WHERE team_id = ? AND roster_status = 'active'
    AND dev_trait != 'X-Factor' AND overall_rating >= 68
    ORDER BY overall_rating DESC
  `);

  let tradesExecuted = 0;
  const MAX_TRADES = 2;

  for (const buyer of buyers) {
    if (tradesExecuted >= MAX_TRADES) break;
    const buyerNeeds = getTeamNeeds(buyer.id);
    if (buyerNeeds.length === 0) continue;
    const targetPos = buyerNeeds[0];

    for (const seller of sellers) {
      if (tradesExecuted >= MAX_TRADES) break;
      if (seller.id === buyer.id) continue;

      const candidate = stmtCandidate.get(seller.id, targetPos) as any;
      if (!candidate) continue;

      const targetValue = calcPlayerTradeValue(candidate.overall_rating, candidate.age, candidate.position, candidate.dev_trait);
      const buyerNeedSet = new Set(buyerNeeds);
      const offer = (stmtBuyerPlayers.all(buyer.id) as any[]).find((p: any) => !buyerNeedSet.has(p.position));
      if (!offer) continue;

      const offerValue = calcPlayerTradeValue(offer.overall_rating, offer.age, offer.position, offer.dev_trait);
      let totalOfferValue = offerValue;
      let picksOffered: any[] = [];

      const gap = targetValue - offerValue;
      if (gap > 8) {
        const sweetener = pickRepo.getByTeam(buyer.id, season).find((pk: any) => {
          const pv = calcPickTradeValue(pk.round, pk.season);
          return pv >= gap * 0.5 && pv <= gap * 1.8;
        });
        if (sweetener) {
          picksOffered.push(sweetener);
          totalOfferValue += calcPickTradeValue(sweetener.round, sweetener.season);
        }
      }

      const ratio = totalOfferValue / targetValue;
      if (ratio < 0.78 || ratio > 1.30) continue;

      const acceptThreshold = seller.status === 'Rebuilding' ? 0.60 : 0.72;
      if (Math.random() < acceptThreshold) continue;

      db.transaction(() => {
        playerRepo.updateTeam(offer.id, seller.id);
        contractRepo.updateTeam(offer.id, seller.id);
        playerRepo.updateTeam(candidate.id, buyer.id);
        contractRepo.updateTeam(candidate.id, buyer.id);
        for (const pk of picksOffered) pickRepo.transfer(pk.id, seller.id);
      })();

      const pickStr = picksOffered.length > 0
        ? ` + ${picksOffered.map((pk: any) => {
            const rounds: Record<number, string> = { 1:'1st', 2:'2nd', 3:'3rd', 4:'4th', 5:'5th', 6:'6th', 7:'7th' };
            return `${pk.season} ${rounds[pk.round] ?? pk.round + 'th'}-round pick`;
          }).join(', ')}`
        : '';

      logNewsEvent({
        eventType: 'trade',
        category: 'transactions',
        headline: `Trade: ${buyer.city} ${buyer.name} acquire ${candidate.first_name} ${candidate.last_name}`,
        detail: `${buyer.city} ${buyer.name} receive: ${candidate.first_name} ${candidate.last_name} (${candidate.position}, OVR ${candidate.overall_rating}) | ${seller.city} ${seller.name} receive: ${offer.first_name} ${offer.last_name} (${offer.position}, OVR ${offer.overall_rating})${pickStr}`,
        season,
      });

      tradesExecuted++;
      break;
    }
  }

  return tradesExecuted;
}
