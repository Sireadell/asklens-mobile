import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';
import { explorerTxUrl, friendlyError, getCluster, getReceipts, verifyProof } from '../solana';
import type { Cluster, ProofResult, Receipt } from '../solana';

const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

export default function VerifyProofScreen() {
  const [sig, setSig] = useState('');
  const [cluster, setClusterState] = useState<Cluster>(getCluster());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProofResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getReceipts().then(setReceipts);
  }, []);

  const check = async (signature: string, c: Cluster) => {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      setResult(await verifyProof(signature, c));
    } catch (e: any) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (r: Receipt) => {
    const c = r.cluster === 'devnet' ? 'devnet' : 'mainnet-beta';
    setSig(r.signature);
    setClusterState(c);
    check(r.signature, c);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Verify a proof</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Paste a transaction signature to see what it proves. The app reads it straight from Solana.</Text>
        <TextInput
          style={styles.input}
          value={sig}
          onChangeText={setSig}
          placeholder="Transaction signature"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <View style={styles.row}>
          {(['devnet', 'mainnet-beta'] as Cluster[]).map((c) => (
            <Pressable key={c} style={[styles.chip, cluster === c && styles.chipOn]} onPress={() => setClusterState(c)}>
              <Text style={[styles.chipText, cluster === c && { color: '#04121D' }]}>{c === 'devnet' ? 'Test network' : 'Real network'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.primary, !sig.trim() && { opacity: 0.5 }]} disabled={busy || !sig.trim()} onPress={() => check(sig, cluster)}>
          {busy ? <ActivityIndicator color="#04121D" /> : <Text style={styles.primaryText}>Verify</Text>}
        </Pressable>
      </View>

      {!!err && <Text style={styles.warn}>{err}</Text>}

      {result && result.ok && (
        <View style={[styles.card, { borderColor: colors.accent }]}>
          <Text style={styles.section}>Verified AskLens proof</Text>
          <Row k="Verdict" v={result.verdict} />
          <Row k="Checked" v={new Date(result.checkedAt * 1000).toLocaleString()} />
          {result.streak ? <Row k="Proof streak" v={`Day ${result.streak}`} /> : null}
          <Row k="Signed by" v={short(result.signer)} />
          <Row k="Input fingerprint" v={result.inputHash} />
          <Row k="Network" v={result.cluster === 'devnet' ? 'Test network' : 'Real network'} />
          <Pressable onPress={() => Linking.openURL(explorerTxUrl(result.signature, result.cluster))}>
            <Text style={styles.link}>View on Solana Explorer</Text>
          </Pressable>
        </View>
      )}
      {result && !result.ok && (
        <View style={styles.card}>
          <Text style={styles.section}>{result.reason === 'not_proof' ? 'Not an AskLens proof' : 'Could not verify'}</Text>
          <Text style={styles.body}>{result.message}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.section}>Your saved proofs</Text>
        {receipts.length === 0 ? (
          <Text style={styles.body}>Nothing saved yet.</Text>
        ) : (
          receipts.map((r) => (
            <Pressable key={r.signature} style={styles.receipt} onPress={() => pick(r)}>
              <Text style={styles.receiptTitle} numberOfLines={1}>
                {r.input}
              </Text>
              <Text style={styles.dim}>
                {r.verdict} · {new Date(r.savedAt).toLocaleString()} · tap to verify
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
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
  input: { color: colors.text, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 64, marginBottom: 12, fontSize: 14 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chip: { borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.accent, fontWeight: '600' },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#04121D', fontWeight: '700', fontSize: 16 },
  warn: { color: colors.caution, fontSize: 14 },
  section: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  stat: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statV: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  dim: { color: colors.dim, fontSize: 13 },
  receipt: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  receiptTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  link: { color: colors.accent, marginTop: 8, fontSize: 14 },
});
