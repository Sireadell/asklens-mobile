import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { checkInput, detectKind, extractInput } from '../lib/asklens';
import { classifyAddress } from '../lib/classify';
import { checkCoin, MemeReport } from '../lib/meme';
import { MemeCard } from '../components/MemeCard';
import { CheckingSteps } from '../components/CheckingSteps';
import { loadStats, recordCheck } from '../lib/store';
import { saveProofOnSolana } from '../lib/solanaBridge';
import { allowanceNow, cachedTier, syncReminders } from '../lib/guard';
import { ShareCard, shortInput } from '../components/ShareCard';
import { colors, radius, verdictStyle } from '../theme';
import type { CheckResult } from '../types';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route, navigation }: Props) {
  const { text, saved } = route.params;
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<CheckResult | null>(saved ?? null);
  const [caught, setCaught] = useState(0);
  const [coinMint, setCoinMint] = useState<string | null>(null);
  const [coin, setCoin] = useState<MemeReport | null>(null);
  const [holder, setHolder] = useState(false);
  const [proof, setProof] = useState<string>('');
  const [explorer, setExplorer] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setHolder((await cachedTier()).holder);
      if (saved) {
        setCaught((await loadStats()).caught);
        return;
      }
      const a = await allowanceNow();
      if (a.used >= a.limit) {
        setResult({
          input: text,
          kind: 'unknown',
          verdict: 'unknown',
          reasons: [
            `You have used all ${a.limit} checks for today. They come back tomorrow.`,
            ...(a.holder ? [] : ['Holding 1 SKR in your connected wallet raises the daily limit to 30.']),
          ],
          source: 'AskLens Guard',
          checkedAt: Date.now(),
        });
        return;
      }
      // A Solana token gets the coin card, which fills in as facts arrive.
      const input = extractInput(text);
      let mint: string | null = null;
      if (detectKind(input) === 'solana-address') {
        try {
          const c = await classifyAddress(input);
          if (c.kind === 'token-mint') mint = input;
          else if (c.kind === 'token-account' && c.mint) mint = c.mint;
        } catch {}
      }
      let r: CheckResult;
      if (mint) {
        if (!alive) return;
        setCoinMint(mint);
        const rep = await checkCoin(mint, (u) => alive && setCoin(u));
        if (!alive) return;
        setCoin(rep);
        r = {
          input,
          kind: 'solana-address',
          verdict: rep.verdict,
          reasons: [rep.sentence, ...rep.reasons],
          source: 'Live coin data',
          checkedAt: Date.now(),
          label: 'Token',
        };
      } else {
        r = await checkInput(text);
      }
      if (!alive) return;
      const stats = await recordCheck(r);
      setCaught(stats.caught);
      setResult(r);
      syncReminders();
      Haptics.notificationAsync(
        r.verdict === 'safe'
          ? Haptics.NotificationFeedbackType.Success
          : r.verdict === 'danger'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [text, saved]);

  const kindNow = detectKind(extractInput(text));
  const steps =
    kindNow === 'link'
      ? ['Reading the link', 'Asking live checkers', 'Checking scam lists and site age']
      : kindNow === 'evm-address'
      ? ['Reading the address', 'Asking the live checker', 'Writing your answer']
      : kindNow === 'solana-address'
      ? ['Reading the address', 'Looking it up on Solana', 'Checking public sources']
      : ['Reading what you sent', 'Asking live checkers', 'Writing your answer'];

  if (!result && !coinMint) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <CheckingSteps steps={steps} input={shortInput(extractInput(text) || text, 40)} />
      </View>
    );
  }

  const v = verdictStyle[result ? result.verdict : 'unknown'];

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch {
      Alert.alert('Could not share', 'Try again in a moment.');
    }
  };

  const saveProof = async () => {
    if (!result) return;
    setSaving(true);
    const out = await saveProofOnSolana(result);
    setSaving(false);
    setExplorer(out.ok && out.explorerUrl ? out.explorerUrl : '');
    setProof(out.ok ? 'Proof saved on Solana.' : out.message);
    if (out.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const actions = result ? (
    <>
      <Pressable style={styles.primary} onPress={saveProof} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Save proof on Solana</Text>}
      </Pressable>
      {!!proof && <Text style={[styles.proof, explorer ? { color: colors.safe } : null]}>{proof}</Text>}
      {!!explorer && (
        <Pressable onPress={() => Linking.openURL(explorer)}>
          <Text style={styles.link}>View on Solana Explorer</Text>
        </Pressable>
      )}

      <View style={styles.row}>
        <Pressable style={styles.secondary} onPress={share}>
          <Text style={styles.secondaryText}>Share result</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => Clipboard.setStringAsync(result.input)}>
          <Text style={styles.secondaryText}>Copy</Text>
        </Pressable>
      </View>
      <Pressable style={styles.done} onPress={() => navigation.goBack()}>
        <Text style={styles.doneText}>Check another</Text>
      </Pressable>

      {/* Drawn off screen so it can be captured as the picture to share. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={cardRef} result={result} holder={holder} />
      </View>
    </>
  ) : null;

  // A Solana token: the coin card, filling in as facts arrive.
  if (coinMint) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
      >
        <MemeCard report={coin} mint={coinMint} />
        {actions}
      </ScrollView>
    );
  }

  if (!result) return null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View style={[styles.hero, { backgroundColor: v.color }]}>
        <Text style={styles.heroIcon}>{v.icon}</Text>
        <Text style={styles.heroTitle}>{v.title}</Text>
        <Text style={styles.heroSub}>{v.sub}</Text>
      </View>

      {!!result.label && (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{result.label}</Text>
        </View>
      )}
      <Text style={styles.input} selectable>
        {result.input}
      </Text>

      {!!result.contactMatch && (
        <View style={[styles.box, { borderWidth: 2, borderColor: result.contactMatch.kind === 'exact' ? colors.safe : colors.danger }]}>
          <Text style={[styles.boxHead, { color: result.contactMatch.kind === 'exact' ? colors.safe : colors.danger, marginBottom: 4 }]}>
            {result.contactMatch.kind === 'exact' ? 'Saved contact' : 'Possible address poisoning'}
          </Text>
          <Text style={styles.evText}>
            {result.contactMatch.kind === 'exact'
              ? `This is ${result.contactMatch.name}'s saved address.`
              : `Looks like ${result.contactMatch.name}'s address but is NOT the same. Do not send.`}
          </Text>
        </View>
      )}

      {!!result.evidence?.length && (
        <View style={styles.box}>
          <Text style={styles.boxHead}>Evidence</Text>
          {result.evidence.map((e, i) => (
            <View key={i} style={styles.evRow}>
              <View
                style={[
                  styles.evDot,
                  { backgroundColor: e.level === 'bad' ? colors.danger : e.level === 'warn' ? colors.caution : colors.unknown },
                ]}
              />
              <Text style={styles.evText}>{e.text}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.box}>
        <Text style={styles.boxHead}>Why</Text>
        {result.reasons.map((r, i) => (
          <Text key={i} style={styles.reason}>
            {r}
          </Text>
        ))}
        <Text style={styles.source}>Source: {result.source}</Text>
      </View>

      {actions}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  checking: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 18 },
  dim: { color: colors.dim, marginTop: 8, textAlign: 'center' },
  hero: { borderRadius: 28, alignItems: 'center', paddingVertical: 36 },
  heroIcon: { fontSize: 72, fontWeight: '800', color: colors.bg },
  heroTitle: { fontSize: 36, fontWeight: '800', color: colors.bg, marginTop: 4 },
  heroSub: { fontSize: 16, color: colors.bg, opacity: 0.8, marginTop: 4 },
  input: { color: colors.text, fontSize: 15, marginTop: 12, textAlign: 'center' },
  box: { backgroundColor: colors.card, borderRadius: radius, padding: 18, marginTop: 18 },
  boxHead: { color: colors.dim, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  reason: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  chip: { alignSelf: 'center', borderWidth: 1.5, borderColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 16 },
  chipText: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  evRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  evDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  evText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
  source: { color: colors.dim, fontSize: 13, marginTop: 4 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryText: { color: colors.bg, fontSize: 17, fontWeight: '800' },
  link: { color: colors.accent, textAlign: 'center', marginTop: 6, fontSize: 15, fontWeight: '700' },
  proof: { color: colors.dim, textAlign: 'center', marginTop: 10 },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  secondary: { flex: 1, backgroundColor: colors.cardHi, borderRadius: radius, paddingVertical: 15, alignItems: 'center' },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  done: { alignItems: 'center', paddingVertical: 18 },
  doneText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  offscreen: { position: 'absolute', left: -2000, top: 0 },
});
