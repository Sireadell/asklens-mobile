import React, { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { extractInput } from '../lib/asklens';
import { colors, radius } from '../theme';
import type { RootStackParamList } from '../../App';

// The camera is loaded only when this screen opens. If this build does not
// include it yet, the screen says so instead of crashing the app.
let Camera: any = null;
try {
  Camera = require('expo-camera');
} catch {
  Camera = null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export default function ScanScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = Camera?.useCameraPermissions ? Camera.useCameraPermissions() : [null, async () => {}];
  const done = useRef(false);
  const [note, setNote] = useState('');

  const onScan = ({ data }: { data: string }) => {
    if (done.current) return;
    const text = (data ?? '').trim();
    // Solana Pay codes look like solana:ADDRESS?amount=1
    const pay = text.match(/^solana:([1-9A-HJ-NP-Za-km-z]{32,44})/);
    const input = pay ? pay[1] : extractInput(text);
    if (!input) {
      setNote('That code does not hold a link or address.');
      return;
    }
    done.current = true;
    if (route.params?.forContact) navigation.popTo('Contacts', { scanned: input });
    else navigation.replace('Result', { text: input });
  };

  if (!Camera?.CameraView) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Scanning is not in this version</Text>
        <Text style={styles.sub}>Install the newest version of the app to scan QR codes.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!perm) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!perm.granted) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Allow the camera</Text>
        <Text style={styles.sub}>The camera is used only to read a QR code. Nothing is saved or sent.</Text>
        {perm.canAskAgain ? (
          <Pressable style={styles.btn} onPress={requestPerm}>
            <Text style={styles.btnText}>Allow camera</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btn} onPress={() => Linking.openSettings()}>
            <Text style={styles.btnText}>Open phone settings</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera.CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScan}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.hint}>Point at a QR code</Text>
        <View style={styles.frame} />
        <Text style={styles.sub2}>{note || 'The code is only checked, never opened.'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.dim, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10 },
  btn: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 16, paddingHorizontal: 32, marginTop: 28 },
  btnText: { color: colors.bg, fontSize: 17, fontWeight: '800' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 60 },
  hint: { color: '#fff', fontSize: 20, fontWeight: '800' },
  frame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: colors.accent },
  sub2: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
