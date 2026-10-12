import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CheckResult } from '../types';
import { countToday } from './guard';

const HISTORY_KEY = 'asklens.history.v1';
const STATS_KEY = 'asklens.stats.v1';
const MAX_HISTORY = 100;

export interface Stats {
  streak: number;
  best: number;
  lastDay: string; // YYYY-MM-DD, local time
  totalChecks: number;
  caught: number; // caution + danger
}

const emptyStats: Stats = { streak: 0, best: 0, lastDay: '', totalChecks: 0, caught: 0 };

function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export async function loadHistory(): Promise<CheckResult[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CheckResult[]) : [];
  } catch {
    return [];
  }
}

export async function loadStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    const s = raw ? { ...emptyStats, ...(JSON.parse(raw) as Stats) } : emptyStats;
    // A missed day ends the streak.
    if (s.lastDay && s.lastDay !== dayKey() && s.lastDay !== yesterdayKey()) s.streak = 0;
    return s;
  } catch {
    return emptyStats;
  }
}

/** Save a finished check and update the daily streak. Returns the new stats. */
export async function recordCheck(result: CheckResult): Promise<Stats> {
  if (result.verdict === 'unknown' && result.kind === 'unknown') return loadStats();
  const history = await loadHistory();
  const next = [result, ...history.filter((h) => !(h.input === result.input && h.checkedAt === result.checkedAt))].slice(
    0,
    MAX_HISTORY
  );
  const stats = await loadStats();
  const today = dayKey();
  if (stats.lastDay !== today) {
    stats.streak = stats.lastDay === yesterdayKey() ? stats.streak + 1 : 1;
    stats.lastDay = today;
  }
  stats.best = Math.max(stats.best, stats.streak);
  stats.totalChecks += 1;
  if (result.verdict === 'caution' || result.verdict === 'danger') stats.caught += 1;
  try {
    await AsyncStorage.multiSet([
      [HISTORY_KEY, JSON.stringify(next)],
      [STATS_KEY, JSON.stringify(stats)],
    ]);
  } catch {}
  await countToday();
  return stats;
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {}
}
