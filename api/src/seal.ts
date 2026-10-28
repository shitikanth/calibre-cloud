import { fromBase64Url, toBase64Url } from './base64url.ts';

const ivLength = 12;

export async function importCookieKey(base64: string): Promise<CryptoKey | undefined> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64Url(base64.trim());
  } catch {
    return undefined;
  }
  if (bytes.length !== 32) return undefined;
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, purpose: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(purpose) }, key, plaintext),
  );
  const sealed = new Uint8Array(ivLength + ciphertext.length);
  sealed.set(iv);
  sealed.set(ciphertext, ivLength);
  return toBase64Url(sealed);
}

export async function unseal(key: CryptoKey, purpose: string, text: string): Promise<unknown> {
  try {
    const sealed = fromBase64Url(text);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, ivLength), additionalData: new TextEncoder().encode(purpose) },
      key,
      sealed.slice(ivLength),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return undefined;
  }
}
