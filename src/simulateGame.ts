import { loadTeamData, computeTeamRatings } from './sim/ratings';
import {
  getWeather, weatherMultipliers,
  generateScoringEvents, simulateOvertime, distributeToQuarters,
} from './sim/scoring';
import { generatePlayerStats, generateDefensiveStats, generateKickerStats } from './sim/stats';

export type { GamePlayerStat, SimResult } from './sim/types';

export interface GamePlanOptions {
  offense?: string;
  defense?: string;
}

const OFFENSE_MODS: Record<string, { offRating: number; defRating: number }> = {
  balanced:     { offRating: 0,  defRating: 0  },
  run_heavy:    { offRating: -1, defRating: 1  },
  pass_attack:  { offRating: 3,  defRating: -2 },
  ball_control: { offRating: -2, defRating: 3  },
  bombs_away:   { offRating: 5,  defRating: -4 },
};

const DEFENSE_MODS: Record<string, { offRating: number; defRating: number }> = {
  base:         { offRating: 0,  defRating: 0  },
  blitz:        { offRating: -2, defRating: 5  },
  zone:         { offRating: 0,  defRating: 3  },
  press_man:    { offRating: -1, defRating: 2  },
  run_stop:     { offRating: -1, defRating: 4  },
};

export function simulateGame(
  homeTeamId: number,
  awayTeamId: number,
  week: number = 9,
  userTeamId: number = -1,
  difficultyFactor: number = 0
): import('./sim/types').SimResult {
  const homeData = loadTeamData(homeTeamId);
  const awayData = loadTeamData(awayTeamId);

  const homeRatings = computeTeamRatings(homeData);
  const awayRatings = computeTeamRatings(awayData);

  if (difficultyFactor !== 0) {
    if (homeTeamId === userTeamId) {
      homeRatings.offenseRating = Math.max(1, homeRatings.offenseRating + difficultyFactor);
      homeRatings.defenseRating = Math.max(1, homeRatings.defenseRating + difficultyFactor);
    }
    if (awayTeamId === userTeamId) {
      awayRatings.offenseRating = Math.max(1, awayRatings.offenseRating + difficultyFactor);
      awayRatings.defenseRating = Math.max(1, awayRatings.defenseRating + difficultyFactor);
    }
  }

  const weather = getWeather(week);
  const wx = weatherMultipliers(weather);

  const homeEvents = generateScoringEvents(homeRatings.offenseRating, awayRatings.defenseRating, wx, true);
  const awayEvents = generateScoringEvents(awayRatings.offenseRating, homeRatings.defenseRating, wx, false);

  let homeScore = homeEvents.tds * 7 + homeEvents.fgs * 3;
  let awayScore = awayEvents.tds * 7 + awayEvents.fgs * 3;

  const scoreDiff = homeScore - awayScore;
  const homeOffStats = generatePlayerStats(homeData, homeEvents, homeRatings.offenseRating, wx, true, scoreDiff);
  const awayOffStats = generatePlayerStats(awayData, awayEvents, awayRatings.offenseRating, wx, false, -scoreDiff);

  const homeQBInts = homeOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;
  const awayQBInts = awayOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;

  const homeDefStats = generateDefensiveStats(homeData, awayQBInts, homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayData, homeQBInts, awayRatings.defenseRating);

  const homeDefTDs = homeDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  const awayDefTDs = awayDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  homeScore += homeDefTDs * 6;
  awayScore += awayDefTDs * 6;

  if (homeScore === awayScore) {
    const ot = simulateOvertime(homeRatings, awayRatings, wx);
    homeScore += ot.homeOTScore;
    awayScore += ot.awayOTScore;
  }

  if (homeScore === awayScore) {
    if (Math.random() > 0.5) homeScore += 3;
    else awayScore += 3;
  }

  const homeKickerStat = generateKickerStats(homeData, homeEvents, homeEvents.tds);
  const awayKickerStat = generateKickerStats(awayData, awayEvents, awayEvents.tds);

  return {
    homeScore, awayScore,
    homeQuarters: distributeToQuarters(homeScore),
    awayQuarters: distributeToQuarters(awayScore),
    weather,
    homePlayerStats: [...homeOffStats, ...homeDefStats, ...(homeKickerStat ? [homeKickerStat] : [])],
    awayPlayerStats: [...awayOffStats, ...awayDefStats, ...(awayKickerStat ? [awayKickerStat] : [])],
  };
}
