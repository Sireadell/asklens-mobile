import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDemoBadLink } from '../lib/asklens';
import { loadPairing } from '../lib/pairing';
import { loadStats, Stats } from '../lib/store';
import {
  allowanceNow,
  askNotificationPermission,
  DayCell,
  defaultSettings,
  GuardSettings,
  hourLabel,
  lastSevenDays,
  loadSettings,
  refreshTier,
  saveSettings,
  syncReminders,
  todayCount,
} from '../lib/guard';
import { ProgressRing } from '../components/ProgressRing';
import { WeekStrip } from '../components/WeekStrip';
import { colors, radius } from '../theme';

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [first, setFirst] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<GuardSettings>(defaultSettings);
  const [goalPick, setGoalPick] = useState(3);
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState<DayCell[]>([]);
  const [pcLinked, setPcLinked] = useState(false);
  const [allow, setAllow] = useState({ used: 0, limit: 10, holder: false });

  React.useEffect(() => {
    (async () => {
      try {
        setFirst(!(await AsyncStorage.getItem('asklens.seen.v1')));
      } catch {}
      setSettings(await loadSettings());
      setLoaded(true);
    })();
  }, []);

  const start = () => {
    setFirst(false);
    AsyncStorage.setItem('asklens.seen.v1', '1').catch(() => {});
  };

  const refresh = useCallback(async () => {
    setStats(await loadStats());
    setToday(await todayCount());
    setWeek(await lastSevenDays());
    setPcLinked(!!(await loadPairing()));
    setAllow(await allowanceNow());
    setSettings(await loadSettings());
    syncReminders();
    // Holder status is read from the network in the background, then shown.
    refreshTier().then(async () => setAllow(await allowanceNow()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const go = (t: string) => {
    const v = t.trim();
    if (!v) return;
    nav.navigate('Result', { text: v });
    setText('');
  };

  const demo = async () => go(await getDemoBadLink());

  const paste = async () => {
    const t = await Clipboard.getStringAsync();
    if (t) go(t);
  };

  const pledge = async () => {
    const next = await saveSettings({ pledged: true, goal: goalPick });
    setSettings(next);
    if (await askNotificationPermission()) {
      await syncReminders();
    } else {
      setSettings(await saveSettings({ remindOn: false }));
    }
  };

  const toggleReminder = async (on: boolean) => {
    if (on && !(await askNotificationPermission())) {
      Alert.alert('Reminders are off', 'Allow notifications for AskLens Guard in your phone settings to get a daily reminder.');
      return;
    }
    setSettings(await saveSettings({ remindOn: on }));
    syncReminders();
  };

  const shiftHour = async (by: number) => {
    setSettings(await saveSettings({ remindHour: (settings.remindHour + by + 24) % 24 }));
    syncReminders();
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (first) {
    return (
      <View style={[styles.welcome, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.brand}>AskLens Guard</Text>
        <Text style={styles.big}>Is this link or wallet safe?</Text>
        <Text style={styles.sub}>
          Share it to this app and get a clear green, amber or red answer in seconds. Nothing is opened for you.
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.primary} onPress={start}>
          <Text style={styles.primaryText}>Get started</Text>
        </Pressable>
        <View style={{ height: insets.bottom + 24 }} />
      </View>
    );
  }

  if (!settings.pledged) {
    return (
      <View style={[styles.welcome, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.brand}>Daily Guard Pledge</Text>
        <Text style={styles.big}>Make a small promise to yourself.</Text>
        <Text style={styles.sub}>Pick how many things you will check each day. Most scams work because people rush.</Text>
        <View style={styles.goalRow}>
          {[1, 3, 5].map((g) => (
            <Pressable key={g} style={[styles.goal, goalPick === g && styles.goalOn]} onPress={() => setGoalPick(g)}>
              <Text style={[styles.goalNum, goalPick === g && { color: colors.bg }]}>{g}</Text>
              <Text style={[styles.goalLabel, goalPick === g && { color: colors.bg }]}>
                {g === 1 ? 'check a day' : 'checks a day'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.small}>
          We will remind you once a day at 9 PM. You can change the time or turn it off any time.
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.primary} onPress={pledge}>
          <Text style={styles.primaryText}>I will check before I tap or send</Text>
        </Pressable>
        <View style={{ height: insets.bottom + 24 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.brand}>AskLens Guard</Text>
      <Text style={styles.headline}>Check before you tap.</Text>
      <Text style={styles.sub}>
        Share a link or wallet address to this app from Telegram, X or your browser. You get an answer in seconds.
      </Text>

      <View style={styles.guardCard}>
        <View style={styles.guardTop}>
          <ProgressRing done={today} goal={settings.goal} />
          <View style={styles.guardStats}>
            <Text style={styles.statNum}>{stats?.streak ?? 0}</Text>
            <Text style={styles.statLabel}>day streak</Text>
            <Text style={[styles.statNum, { color: colors.danger, marginTop: 10 }]}>{stats?.caught ?? 0}</Text>
            <Text style={styles.statLabel}>risky things caught</Text>
            <Text style={[styles.statNum, { fontSize: 22, marginTop: 10 }]}>{stats?.totalChecks ?? 0}</Text>
            <Text style={styles.statLabel}>checks in total</Text>
          </View>
        </View>
        <WeekStrip days={week} goal={settings.goal} />
      </View>

      <TextInput
        style={styles.input}
        placeholder="Paste a link or wallet address"
        placeholderTextColor={colors.dim}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        returnKeyType="go"
        blurOnSubmit
        onSubmitEditing={() => go(text)}
      />
      <Pressable style={styles.primary} onPress={() => go(text)}>
        <Text style={styles.primaryText}>Check it</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={paste}>
        <Text style={styles.secondaryText}>Check what I copied</Text>
      </Pressable>
      <Pressable style={[styles.secondary, pcLinked && { borderWidth: 1, borderColor: colors.safe }]} onPress={() => nav.navigate(pcLinked ? 'PcFeed' : 'Pair')}>
        <Text style={styles.secondaryText}>{pcLinked ? 'PC linked, live' : 'Link your PC'}</Text>
        {!pcLinked && <Text style={{ color: colors.dim, fontSize: 12, marginTop: 2 }}>Copy a link on your PC, get the answer here</Text>}
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => nav.navigate('Scan')}>
        <Text style={styles.secondaryText}>Scan a QR code</Text>
      </Pressable>

      <View style={styles.remind}>
        <View style={{ flex: 1 }}>
          <Text style={styles.remindTitle}>Daily reminder</Text>
          <Text style={styles.remindSub}>
            {settings.remindOn ? `Every day at ${hourLabel(settings.remindHour)}` : 'Off'}
          </Text>
        </View>
        {settings.remindOn && (
          <View style={styles.stepper}>
            <Pressable style={styles.step} onPress={() => shiftHour(-1)} hitSlop={8}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Pressable style={styles.step} onPress={() => shiftHour(1)} hitSlop={8}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        )}
        <Switch
          value={settings.remindOn}
          onValueChange={toggleReminder}
          trackColor={{ true: colors.accent, false: colors.line }}
        />
      </View>
      <Text style={styles.allow}>
        {allow.holder ? 'Holder: ' : ''}
        {Math.max(0, allow.limit - allow.used)} of {allow.limit} checks left today
        {allow.holder ? '' : '. Holders of 1 SKR get more.'}
      </Text>

      <Pressable style={styles.demo} onPress={demo}>
        <Text style={styles.demoText}>Try a known-bad link</Text>
        <Text style={styles.demoSub}>Takes one tap. The link is only checked, never opened.</Text>
      </Pressable>

      <Text style={styles.tip}>Tip: in Telegram or X, tap Share on any message and pick AskLens Guard.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: { color: colors.accent, fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' },
  headline: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 8 },
  sub: { color: colors.dim, fontSize: 16, lineHeight: 23, marginTop: 8 },
  guardCard: { backgroundColor: colors.card, borderRadius: radius, padding: 18, marginTop: 22 },
  guardTop: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  guardStats: { flex: 1, paddingLeft: 6 },
  statNum: { color: colors.text, fontSize: 30, fontWeight: '800' },
  statLabel: { color: colors.dim, fontSize: 12, marginTop: 2 },
  goalRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  goal: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.line,
  },
  goalOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  goalNum: { color: colors.text, fontSize: 38, fontWeight: '800' },
  goalLabel: { color: colors.dim, fontSize: 12, fontWeight: '700', marginTop: 2 },
  small: { color: colors.dim, fontSize: 14, lineHeight: 20, marginTop: 18 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius,
    padding: 16,
    fontSize: 16,
    minHeight: 76,
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.line,
    textAlignVertical: 'top',
  },
  primary: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 17, alignItems: 'center', marginTop: 14 },
  primaryText: { color: colors.bg, fontSize: 18, fontWeight: '800' },
  secondary: { backgroundColor: colors.cardHi, borderRadius: radius, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  remind: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 14,
    marginTop: 18,
    gap: 10,
  },
  remindTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  remindSub: { color: colors.dim, fontSize: 13, marginTop: 2 },
  stepper: { flexDirection: 'row', gap: 8 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 22, fontWeight: '800' },
  allow: { color: colors.dim, fontSize: 13, textAlign: 'center', marginTop: 10 },
  welcome: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  big: { color: colors.text, fontSize: 40, fontWeight: '800', marginTop: 12, lineHeight: 46 },
  demo: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  demoText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  demoSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  tip: { color: colors.dim, fontSize: 14, textAlign: 'center', marginTop: 24, lineHeight: 20 },
});
