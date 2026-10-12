import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius } from '../theme';
import {
  computeGuardScore,
  connectWallet,
  friendlyError,
  getConnectedAddress,
  getHoldings,
  getWalletProfile,
  knownDelegate,
  revokeApproval,
  scanRiskyTokens,
  SCORE_FORMULA,
} from '../solana';
import type { Approval, Holdings, RiskyToken } from '../solana';

const LAST_KEY = 'asklens.checkup.last';
const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Ring({ score, color }: { score: number; color: string }) {
  const size = 150;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ color: colors.text, fontSize: 40, fontWeight: '800' }}>{score}</Text>
      <Text style={{ color: colors.dim, fontSize: 12 }}>out of 100</Text>
    </View>
  );
}

export default function CheckupScreen() {
  const [address, setAddress] = useState<string | null>(null);
  const [data, setData] = useState<Holdings | null>(null);
  const [ageDays, setAgeDays] = useState<number | undefined>();
  const [risky, setRisky] = useState<RiskyToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [last, setLast] = useState<{ score: number; at: number } | null>(null);

  const scan = useCallback(async (addr: string) => {
    setLoading(true);
    setMsg('');
    try {
      const [h, p] = await Promise.all([getHoldings(addr), getWalletProfile(addr).catch(() => null)]);
      setData(h);
      setAgeDays(p?.ageDays);
      setRisky(null);
      scanRiskyTokens(h.mints).then((r) => setRisky(r.risky)).catch(() => setRisky([]));
    } catch (e: any) {
      setMsg(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LAST_KEY).then((v) => v && setLast(JSON.parse(v))).catch(() => {});
    getConnectedAddress().then((a) => {
      setAddress(a);
      if (a) scan(a);
    });
  }, [scan]);

  const result = data ? computeGuardScore({ approvals: data.approvals.length, risky: risky?.length ?? 0, ageDays }) : null;

  useEffect(() => {
    if (result) AsyncStorage.setItem(LAST_KEY, JSON.stringify({ score: result.score, at: Date.now() })).catch(() => {});
  }, [result?.score]);

  const onConnect = async () => {
    setBusy('connect');
    setMsg('');
    try {
      const { address: a } = await connectWallet();
      setAddress(a);
      scan(a);
    } catch (e: any) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const doRevoke = async (a: Approval) => {
    if (!address) return;
    setBusy(a.tokenAccount);
    setMsg('');
    try {
      const out = await revokeApproval(a.tokenAccount, a.programId, address);
      setData((d) => (d ? { ...d, approvals: d.approvals.filter((x) => x.tokenAccount !== a.tokenAccount) } : d));
      setMsg('Access removed. View it on Solana Explorer below.');
      Linking.openURL(out.explorerUrl).catch(() => {});
      setTimeout(() => scan(address), 3000);
    } catch (e: any) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = (a: Approval) =>
    Alert.alert(
      'Remove this access?',
      'This sends a real transaction on the real Solana network and costs about 0.000005 SOL. Your wallet will ask you to approve it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove access', style: 'destructive', onPress: () => doRevoke(a) },
      ],
    );

  const color = !result ? colors.accent : result.score >= 85 ? colors.safe : result.score >= 60 ? colors.caution : colors.danger;
  const delta = last && result ? result.score - last.score : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => address && scan(address)} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Wallet checkup</Text>

      {!address ? (
        <View style={styles.card}>
          <Text style={styles.body}>Connect your wallet and AskLens checks which apps can still move your tokens. It only reads. Nothing is sent.</Text>
          <Pressable style={styles.primary} onPress={onConnect} disabled={!!busy}>
            {busy === 'connect' ? <ActivityIndicator color="#04121D" /> : <Text style={styles.primaryText}>Connect wallet</Text>}
          </Pressable>
        </View>
      ) : loading || !data || !result ? (
        <View style={[styles.card, { alignItems: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.dim, { marginTop: 8 }]}>Checking {short(address)} on the real network</Text>
        </View>
      ) : (
        <>
          <View style={[styles.card, { alignItems: 'center' }]}>
            <Ring score={result.score} color={color} />
            <Text style={[styles.band, { color }]}>{result.band}</Text>
            {last && delta !== 0 && <Text style={styles.dim}>{delta > 0 ? `Up ${delta}` : `Down ${-delta}`} since last time</Text>}
            <Text style={[styles.dim, { marginTop: 8, textAlign: 'center' }]}>{SCORE_FORMULA}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Apps that can move your tokens</Text>
            {data.approvals.length === 0 ? (
              <Text style={styles.body}>
                {data.tokenAccounts === 0 ? 'Nothing to check yet. This wallet holds no tokens.' : 'None. No app has standing access to your tokens.'}
              </Text>
            ) : (
              data.approvals.map((a) => {
                const name = knownDelegate(a.delegate);
                return (
                  <View key={a.tokenAccount} style={styles.row}>
                    <Text style={[styles.rowText, { color: a.unlimited ? colors.danger : colors.caution }]}>
                      {name ?? `Unknown app ${short(a.delegate)}`} can move {a.unlimited ? 'all' : 'up to'} {fmt(a.amount)} of token {short(a.mint)} from your wallet.
                    </Text>
                    <Pressable style={styles.revoke} onPress={() => onRevoke(a)} disabled={!!busy}>
                      {busy === a.tokenAccount ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.revokeText}>Remove access</Text>}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Risky tokens</Text>
            {risky === null ? (
              <ActivityIndicator color={colors.accent} />
            ) : risky.length === 0 ? (
              <Text style={styles.body}>None found among the {Math.min(data.mints.length, 15)} biggest holdings we checked.</Text>
            ) : (
              risky.map((t) => (
                <View key={t.mint} style={styles.row}>
                  <Text style={[styles.rowText, { color: t.level === 'danger' ? colors.danger : colors.caution }]}>
                    {t.symbol ?? short(t.mint)}: {t.reason}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Basics</Text>
            <Text style={styles.body}>
              Checked {data.accountsChecked} token accounts{data.capped ? ' (the first 300 only)' : ''}. Wallet age: {ageDays === undefined ? 'unknown' : `${ageDays} days`}.
            </Text>
          </View>
        </>
      )}

      {!!msg && <Text style={styles.msg}>{msg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, borderWidth: 1, borderColor: colors.line },
  body: { color: colors.dim, fontSize: 15, lineHeight: 21 },
  dim: { color: colors.dim, fontSize: 13 },
  section: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  band: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#04121D', fontWeight: '700', fontSize: 16 },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 8 },
  rowText: { fontSize: 15, lineHeight: 21 },
  revoke: { alignSelf: 'flex-start', borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  revokeText: { color: colors.accent, fontWeight: '600' },
  msg: { color: colors.caution, fontSize: 14 },
});
