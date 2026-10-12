import 'react-native-get-random-values';
import { Buffer } from 'buffer';

const g = globalThis as any;
if (!g.Buffer) g.Buffer = Buffer;
