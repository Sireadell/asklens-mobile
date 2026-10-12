import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { adoptQr, claimCode, cleanCode, enablePush, feed, parsePairQr } from '../lib/pairing';
import { colors, radius } from '../theme';
import type { RootStackParamList } from '../../App';

// The camera is loaded only when needed, like on the Scan screen.
let Camera: any = null;
try {
  Camera = require('expo-camera');
} catch {
  Camera = null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Pair'>;

export default function PairScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = Camera?.useCameraPermissions ? Camera.useCameraPermissions() : [null, async () => {}];
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const done = useRef(false);

  const finish = async (p: { relay: string; pairId: string; secret: string }) => {
    // Ask about notifications now, after the link works, so the reason is clear.
    await enablePush(p);
    feed.start();
    navigation.replace('PcFeed');
  };

  const useCode = async () => {
    setError('');
    setBusy(true);
    try {
      await finish(await claimCode(code));
    } catch (e: any) {
      setError(e?.message ?? 'Could not link. Try again.');
      setBusy(false);
    }
  };

  const onScan = async ({ data }: { data: string }) => {
    if (done.current) return;
    if (!parsePairQr(data ?? '')) {
      setError('That QR code is not from the AskLens PC helper.');
      return;
    }
    done.current = true;
    setBusy(true);
    setScanning(false);
    try {
      await finish(await adoptQr(data));
    } catch (e: any) {
      done.current = false;
      setError(e?.message ?? 'Could not link. Try again.');
      setBusy(false);
    }
  };

  const startScan = async () => {
    setError('');
    if (perm && !perm.granted) {
      if (perm.canAskAgain) {
        const r = await requestPerm();
        if (!r?.granted) return;
      } else {
        Linking.openSettings();
        return;
      }
    }
    setScanning(true);
  };

  if (scanning && Camera?.CameraView) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera.CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={[styles.overlay, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.hint}>Point at the QR code on your PC</Text>
          <View style={styles.frame} />
          <Pressable style={styles.cancel} onPress={() => setScanning(false)}>
            <Text style={styles.cancelText}>Type the code instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 30 }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Link your PC</Text>
      <Text style={styles.sub}>
        Copy a link or wallet address on your computer and get the safety answer on this phone.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What gets sent</Text>
        <Text style={styles.cardText}>
          Only links and wallet addresses that you copy on your PC. Nothing else is read. The link service forgets
          everything after 10 minutes.
        </Text>
      </View>

      <Text style={styles.step}>1. On your PC, start the AskLens PC helper. It shows a QR code and an 8 character code.</Text>

      {Camera?.CameraView && (
        <Pressable style={styles.primary} onPress={startScan} disabled={busy}>
          <Text style={styles.primaryText}>Scan the QR code</Text>
        </Pressable>
      )}

      <Text style={styles.step}>2. Or type the code here.</Text>
      <TextInput
        style={styles.input}
        placeholder="ABCD2345"
        placeholderTextColor={colors.dim}
        value={code}
        onChangeText={(t) => setCode(cleanCode(t).slice(0, 8))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        editable={!busy}
      />
      <Pressable
        style={[styles.secondary, cleanCode(code).length !== 8 && { opacity: 0.5 }]}
        onPress={useCode}
        disabled={busy || cleanCode(code).length !== 8}
      >
        {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>Link with this code</Text>}
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 14 },
  sub: { color: colors.dim, fontSize: 16, lineHeight: 23, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16, marginTop: 20 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  cardText: { color: colors.dim, fontSize: 15, lineHeight: 22, marginTop: 6 },
  step: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 22 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radius,
    padding: 16,
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  primary: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 17, alignItems: 'center', marginTop: 12 },
  primaryText: { color: colors.bg, fontSize: 18, fontWeight: '800' },
  secondary: { backgroundColor: colors.cardHi, borderRadius: radius, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 21, marginTop: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 60 },
  hint: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  frame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: colors.accent },
  cancel: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius, paddingVertical: 14, paddingHorizontal: 24 },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
