import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getConnectedAddressSafe, tierFor } from './solanaBridge';

// Everything for the daily pledge: the goal, the days strip, the reminder
// and the holder allowance. All of it is stored on the phone.

const SETTINGS_KEY = 'asklens.guard.v1';
const DAYS_KEY = 'asklens.days.v1';
const TIER_KEY = 'asklens.tier.v1';

export interface GuardSettings {
  pledged: boolean;
  goal: number; // checks per day: 1, 3 or 5
  remindOn: boolean;
  remindHour: number; // 0 to 23, local time
}

export const defaultSettings: GuardSettings = { pledged: false, goal: 3, remindOn: true, remindHour: 21 };

export const FREE_ALLOWANCE = 10;
export const HOLDER_ALLOWANCE = 30;

export function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function loadSettings(): Promise<GuardSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(patch: Partial<GuardSettings>): Promise<GuardSettings> {
  const next = { ...(await loadSettings()), ...patch };
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

async function loadDays(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(DAYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Count one check for today. Keeps only the last 30 days. */
export async function countToday(): Promise<number> {
  const days = await loadDays();
  const k = dayKey();
  days[k] = (days[k] ?? 0) + 1;
  const keep = Object.keys(days).sort().slice(-30);
  const trimmed: Record<string, number> = {};
  for (const key of keep) trimmed[key] = days[key];
  try {
    await AsyncStorage.setItem(DAYS_KEY, JSON.stringify(trimmed));
  } catch {}
  return days[k];
}

export async function todayCount(): Promise<number> {
  return (await loadDays())[dayKey()] ?? 0;
}

export interface DayCell {
  key: string;
  label: string; // M T W T F S S
  count: number;
  isToday: boolean;
}

/** The last 7 days, oldest first, ending today. */
export async function lastSevenDays(): Promise<DayCell[]> {
  const days = await loadDays();
  const out: DayCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({ key, label: 'SMTWTFS'[d.getDay()], count: days[key] ?? 0, isToday: i === 0 });
  }
  return out;
}

// ---- Holder tier -------------------------------------------------------

export interface TierInfo {
  holder: boolean;
  skr: number;
}

/** Last known tier, read from the phone. Fast, never touches the network. */
export async function cachedTier(): Promise<TierInfo> {
  try {
    const raw = await AsyncStorage.getItem(TIER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { holder: false, skr: 0 };
}

/** Ask the network once for the connected wallet's tier and remember it. */
let lastTierRead = 0;

export async function refreshTier(force = false): Promise<TierInfo> {
  // Once per 10 minutes at most, so opening Home does not hit the network each time.
  if (!force && Date.now() - lastTierRead < 10 * 60 * 1000) return cachedTier();
  lastTierRead = Date.now();
  const address = await getConnectedAddressSafe();
  if (!address) {
    try {
      await AsyncStorage.removeItem(TIER_KEY);
    } catch {}
    return { holder: false, skr: 0 };
  }
  const t = await tierFor(address);
  if (!t) return cachedTier();
  const info = { holder: t.tier === 'holder', skr: t.skr };
  try {
    await AsyncStorage.setItem(TIER_KEY, JSON.stringify(info));
  } catch {}
  return info;
}

export async function allowanceNow(): Promise<{ used: number; limit: number; holder: boolean }> {
  const tier = await cachedTier();
  return { used: await todayCount(), limit: tier.holder ? HOLDER_ALLOWANCE : FREE_ALLOWANCE, holder: tier.holder };
}

// ---- Daily reminder ----------------------------------------------------

const LINES = [
  'One quick check keeps your wallet safe. Got a link to look at?',
  'Before you tap anything today, share it here first.',
  'Your streak is waiting. Check one link or wallet.',
  'Seen a strange link today? Paste it in and find out.',
  'Takes five seconds: check before you send.',
  'Scammers do not take days off. A quick check does the job.',
  'Almost the end of the day. Keep your streak going.',
];

const CHANNEL = 'daily-guard';
const DAYS_AHEAD = 10;

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {}

export async function askNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Daily reminder',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Lines up the next days of reminders, each with a different line. Today is
 * skipped once the goal is met or the time has passed. Safe to call often.
 */
export async function syncReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const s = await loadSettings();
    if (!s.pledged || !s.remindOn) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const doneToday = (await todayCount()) >= s.goal;
    const now = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, s.remindHour, 0, 0);
      if (when.getTime() <= now.getTime() + 60000) continue;
      if (i === 0 && doneToday) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'AskLens Guard', body: LINES[(when.getDate() + i) % LINES.length] },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  } catch {}
}

export function hourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}
