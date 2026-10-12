import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { FREE_ALLOWANCE, HOLDER_ALLOWANCE } from '../lib/guard';
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  getWalletName,
  getReceipts,
  getSolBalance,
  getWalletProfile,
  requestAirdrop,
  getCluster,
  setCluster,
  friendlyError,
  getGuardTier,
  getProofStreak,
} from '../solana';
import type { GuardTier, Receipt, WalletProfile } from '../solana';

const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
const usd = (n?: number) => (n === undefined ? '' : n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

export default function WalletScreen() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [walletName, setWalletName] = useState('your wallet app');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tier, setTier] = useState<GuardTier | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [mainnet, setMainnet] = useState(getCluster() === 'mainnet-beta');

  const load = useCallback(async (addr: string | null) => {
    setReceipts(await getReceipts());
    getProofStreak().then(setStreak).catch(() => setStreak(0));
    if (!addr) return;
    getWalletName().then(setWalletName).catch(() => {});
    getSolBalance(addr).then(setBalance).catch(() => setBalance(null));
    getGuardTier(addr).then(setTier).catch(() => setTier(null));
    getWalletProfile(addr).then(setProfile).catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    getConnectedAddress().then((a) => {
      setAddress(a);
      load(a);
    });
  }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg('');
    try {
      await fn();
    } catch (e: any) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const onConnect = () =>
    run('connect', async () => {
      const { address: a } = await connectWallet();
      setAddress(a);
      await load(a);
    });

  const onDisconnect = () =>
    run('disconnect', async () => {
      await disconnectWallet();
      setAddress(null);
      setBalance(null);
      setProfile(null);
      setTier(null);
    });

  const onAirdrop = () =>
    run('airdrop', async () => {
      if (!address) return;
      await requestAirdrop(address, 1);
      setBalance(await getSolBalance(address));
      setMsg('Added 1 test SOL. It has no real value.');
    });

  const onSwitch = (v: boolean) => {
    setMainnet(v);
    setCluster(v ? 'mainnet-beta' : 'devnet');
    setAddress(null);
    setBalance(null);
    setMsg(v ? 'Real network on. Reconnect your wallet.' : 'Test network on. Reconnect your wallet.');
    getConnectedAddress().then((a) => {
      setAddress(a);
      load(a);
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(address)} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>Your wallet</Text>

      {!address ? (
        <View style={styles.card}>
          <Text style={styles.body}>Connect your Solana wallet to save proof of your checks and see your wallet profile.</Text>
          <Pressable style={styles.primary} onPress={onConnect} disabled={!!busy}>
            {busy === 'connect' ? <ActivityIndicator color="#04121D" /> : <Text style={styles.primaryText}>Connect wallet</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Connected with {walletName}</Text>
          <Text style={styles.addr} selectable>
            {short(address)}
          </Text>
          <Text style={styles.label}>Balance on {mainnet ? 'the real network' : 'the test network'}</Text>
          <Text style={styles.big}>{balance === null ? '...' : `${balance.toFixed(4)} SOL`}</Text>
          <Text style={styles.label}>SKR (real network)</Text>
          <Text style={styles.big}>
            {tier === null ? '...' : `${tier.skr.toLocaleString(undefined, { maximumFractionDigits: 2 })} SKR`}
          </Text>
          <View style={styles.row}>
            {!mainnet && (
              <Pressable style={styles.secondary} onPress={onAirdrop} disabled={!!busy}>
                {busy === 'airdrop' ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.secondaryText}>Get 1 test SOL</Text>}
              </Pressable>
            )}
            <Pressable style={styles.secondary} onPress={onDisconnect} disabled={!!busy}>
              <Text style={styles.secondaryText}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!!msg && <Text style={styles.msg}>{msg}</Text>}

      {address && (
        <View style={[styles.card, tier?.tier === 'holder' && { borderColor: colors.accent }]}>
          <Text style={styles.section}>{tier?.tier === 'holder' ? 'You are an SKR Holder' : 'SKR Holder perks'}</Text>
          <Text style={styles.body}>Hold 1 SKR or more in this wallet and you get:</Text>
          <Text style={styles.perk}>• {HOLDER_ALLOWANCE} checks a day instead of {FREE_ALLOWANCE}</Text>
          <Text style={styles.perk}>• A Holder mark on the card you share</Text>
          <Text style={[styles.dim, { marginTop: 8 }]}>Your SKR is read live from Solana. Nothing is staked, spent or sent.</Text>
        </View>
      )}

      {address && (
        <View style={styles.card}>
          <Text style={styles.section}>Wallet profile</Text>
          {!profile ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Stat k="Age" v={profile.ageDays === undefined ? 'unknown' : `${profile.ageDays} days`} />
              <Stat k="Transactions" v={profile.txCount === undefined ? 'unknown' : profile.txCount >= 1000 ? '1000+' : String(profile.txCount)} />
              <Stat k="Tokens held" v={profile.tokenCount === undefined ? 'unknown' : String(profile.tokenCount)} />
              <Stat k="Real network SOL" v={profile.solBalance === undefined ? 'unknown' : profile.solBalance.toFixed(4)} />
              {!!profile.topHoldings?.length && (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Biggest holdings</Text>
                  {profile.topHoldings.map((h, i) => (
                    <Stat key={i} k={h.symbol} v={usd(h.usd)} />
                  ))}
                </>
              )}
              {profile.flags.map((f, i) => (
                <Text key={i} style={styles.flag}>
                  ! {f}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.section}>Saved proofs</Text>
        {streak > 0 && <Text style={styles.body}>Proof streak: {streak} {streak === 1 ? 'day' : 'days'} in a row, read from your saved proofs.</Text>}
        {receipts.length === 0 ? (
          <Text style={styles.body}>Nothing saved yet. After a check, tap save proof.</Text>
        ) : (
          receipts.map((r) => (
            <Pressable key={r.signature} style={styles.receipt} onPress={() => Linking.openURL(r.explorerUrl)}>
              <Text style={styles.receiptTitle} numberOfLines={1}>
                {r.input}
              </Text>
              <Text style={styles.dim}>
                {r.verdict} · {new Date(r.savedAt).toLocaleString()} · {r.cluster === 'devnet' ? 'test network' : 'real network'}
              </Text>
              <Text style={styles.link}>View on Solana Explorer</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={[styles.card, styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.section}>Use the real network</Text>
          <Text style={styles.dim}>Off by default. The test network costs nothing.</Text>
        </View>
        <Switch value={mainnet} onValueChange={onSwitch} trackColor={{ true: colors.accent }} />
      </View>
    </ScrollView>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.dim}>{k}</Text>
      <Text style={styles.statV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, borderWidth: 1, borderColor: colors.line },
  body: { color: colors.dim, fontSize: 15, lineHeight: 21, marginBottom: 12 },
  label: { color: colors.dim, fontSize: 13, marginTop: 6 },
  addr: { color: colors.text, fontSize: 20, fontWeight: '600', marginBottom: 6 },
  big: { color: colors.text, fontSize: 30, fontWeight: '700', marginBottom: 12 },
  section: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#04121D', fontWeight: '700', fontSize: 16 },
  secondary: { borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { color: colors.accent, fontWeight: '600' },
  msg: { color: colors.caution, fontSize: 14 },
  stat: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statV: { color: colors.text, fontWeight: '600' },
  dim: { color: colors.dim, fontSize: 13 },
  flag: { color: colors.caution, marginTop: 8, fontSize: 14 },
  receipt: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  receiptTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  perk: { color: colors.text, fontSize: 15, lineHeight: 22 },
  badge: { borderColor: colors.accent, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  badgeText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  link: { color: colors.accent, marginTop: 4, fontSize: 13 },
});
