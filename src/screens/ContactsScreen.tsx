import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { detectKind, extractInput } from '../lib/asklens';
import { addContact, loadContacts, removeContact } from '../lib/contacts';
import { Contact, SAMPLE_CONTACT_ADDRESS, SAMPLE_CONTACT_NAME, makeLookalike, normalizeAddress } from '../lib/lookalikeAddress';
import { colors, radius } from '../theme';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>;

const isAddress = (a: string) => {
  const k = detectKind(a);
  return k === 'solana-address' || k === 'evm-address';
};

export default function ContactsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [clip, setClip] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const readClip = useCallback(async () => {
    try {
      const t = extractInput((await Clipboard.getStringAsync()).trim());
      setClip(t && isAddress(t) ? t : null);
    } catch {
      setClip(null);
    }
  }, []);

  useEffect(() => {
    loadContacts().then(setList);
    readClip();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && readClip());
    return () => sub.remove();
  }, [readClip]);

  // Back from the scanner with an address.
  useEffect(() => {
    const s = route.params?.scanned;
    if (s) setAddress(s);
  }, [route.params?.scanned]);

  const save = async () => {
    const addr = extractInput(address);
    if (!name.trim()) return setNote('Type a name first.');
    if (!isAddress(addr)) return setNote('That does not look like a Solana or 0x address.');
    setList(await addContact(name, addr));
    setName('');
    setAddress('');
    setNote('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const askDelete = (c: Contact) =>
    Alert.alert(`Delete ${c.name}?`, 'This only removes it from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => setList(await removeContact(c.id)) },
    ]);

  // Shows the trick: a sample contact plus a copy that only differs in the middle.
  const demo = async () => {
    const have = list.find((c) => normalizeAddress(c.address) === SAMPLE_CONTACT_ADDRESS);
    if (!have) setList(await addContact(SAMPLE_CONTACT_NAME, SAMPLE_CONTACT_ADDRESS));
    const base = have ? have.address : SAMPLE_CONTACT_ADDRESS;
    navigation.navigate('Result', { text: makeLookalike(base) });
  };

  const short = (a: string) => (a.length > 16 ? `${a.slice(0, 6)}...${a.slice(-6)}` : a);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
    >
      <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Trusted contacts</Text>
      <Text style={styles.sub}>
        Save the addresses of people you pay. When any address you check looks almost like one of these but is not the
        same, AskLens Guard warns you. That is how address poisoning works.
      </Text>

      {!!clip && !address && (
        <Pressable style={styles.clipBar} onPress={() => setAddress(clip)}>
          <Text style={styles.clipTitle}>Use the address you copied</Text>
          <Text style={styles.clipSub}>{short(clip)}</Text>
        </Pressable>
      )}

      <View style={styles.box}>
        <TextInput style={styles.input} placeholder="Name, for example Mum" placeholderTextColor={colors.dim} value={name} onChangeText={setName} />
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder="Solana or 0x address"
          placeholderTextColor={colors.dim}
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Pressable
            style={styles.small}
            onPress={async () => {
              const t = extractInput(await Clipboard.getStringAsync());
              if (t) setAddress(t);
            }}
          >
            <Text style={styles.smallText}>Paste</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={() => navigation.navigate('Scan', { forContact: true })}>
            <Text style={styles.smallText}>Scan QR</Text>
          </Pressable>
        </View>
        {!!note && <Text style={styles.note}>{note}</Text>}
        <Pressable style={styles.primary} onPress={save}>
          <Text style={styles.primaryText}>Save contact</Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <Text style={styles.empty}>No contacts yet.</Text>
      ) : (
        list.map((c) => (
          <View key={c.id} style={styles.item}>
            <Pressable style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(c.address)} onLongPress={() => askDelete(c)}>
              <Text style={styles.itemName}>{c.name}</Text>
              <Text style={styles.itemAddr}>{short(c.address)} (tap to copy)</Text>
            </Pressable>
            <Pressable onPress={() => askDelete(c)} hitSlop={12}>
              <Text style={styles.del}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable style={styles.demo} onPress={demo}>
        <Text style={styles.demoText}>Try the poisoning demo</Text>
        <Text style={styles.demoSub}>Makes a look-alike of a sample contact and checks it. Nothing is sent.</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 12 },
  sub: { color: colors.dim, fontSize: 15, lineHeight: 22, marginTop: 8 },
  clipBar: { backgroundColor: colors.accent, borderRadius: radius, padding: 14, marginTop: 18 },
  clipTitle: { color: colors.bg, fontSize: 17, fontWeight: '800' },
  clipSub: { color: colors.bg, opacity: 0.75, fontSize: 13, marginTop: 2 },
  box: { backgroundColor: colors.card, borderRadius: radius, padding: 16, marginTop: 18 },
  input: { backgroundColor: colors.cardHi, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  small: { flex: 1, backgroundColor: colors.cardHi, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  smallText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  note: { color: colors.caution, marginTop: 10, fontSize: 14 },
  primary: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  primaryText: { color: colors.bg, fontSize: 17, fontWeight: '800' },
  empty: { color: colors.dim, textAlign: 'center', marginTop: 22 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius, padding: 16, marginTop: 12 },
  itemName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  itemAddr: { color: colors.dim, fontSize: 13, marginTop: 3 },
  del: { color: colors.danger, fontSize: 14, fontWeight: '700', paddingLeft: 12 },
  demo: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius, padding: 16, marginTop: 26 },
  demoText: { color: colors.danger, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  demoSub: { color: colors.dim, fontSize: 13, textAlign: 'center', marginTop: 4 },
});
