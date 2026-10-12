import AsyncStorage from '@react-native-async-storage/async-storage';
import { Contact, normalizeAddress } from './lookalikeAddress';

const KEY = 'asklens.contacts.v1';

export async function loadContacts(): Promise<Contact[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    return [];
  }
}

export async function addContact(name: string, address: string): Promise<Contact[]> {
  const list = await loadContacts();
  const addr = address.trim();
  const rest = list.filter((c) => normalizeAddress(c.address) !== normalizeAddress(addr));
  const next = [{ id: `${Date.now()}`, name: name.trim(), address: addr, addedAt: Date.now() }, ...rest];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removeContact(id: string): Promise<Contact[]> {
  const next = (await loadContacts()).filter((c) => c.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
