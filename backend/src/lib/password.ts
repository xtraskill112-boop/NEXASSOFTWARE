import bcrypt from 'bcrypt';
import { env } from '../config/env';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Pre-computed hash used to keep login timing constant when the email does not exist.
let dummyHash: string | null = null;
export async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await bcrypt.hash('stocksense-timing-equaliser', env.BCRYPT_ROUNDS);
  return dummyHash;
}
