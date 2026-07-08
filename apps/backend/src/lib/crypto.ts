/**
 * Criptografia de segredos em repouso (§7).
 *
 * Tokens OAuth e o cookie de sessão do Módulo Beta são armazenados
 * criptografados com AES-256-GCM. A chave (`TOKEN_ENC_KEY`) é um segredo do
 * Worker, base64, com 32 bytes. Cada valor cifrado carrega seu próprio IV
 * aleatório de 12 bytes, prefixado ao ciphertext:  base64(iv | ciphertext+tag).
 *
 * Nunca logar valores em claro (nem em logs de erro / observabilidade).
 */

const IV_BYTES = 12;

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyB64);
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENC_KEY deve ter 32 bytes (base64 de 32 bytes).");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Cifra um texto claro. Retorna base64(iv | ciphertext+tag). */
export async function encryptSecret(
  plaintext: string,
  keyB64: string,
): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const packed = new Uint8Array(iv.byteLength + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.byteLength);
  return toBase64(packed);
}

/** Decifra um valor produzido por {@link encryptSecret}. */
export async function decryptSecret(
  packedB64: string,
  keyB64: string,
): Promise<string> {
  const key = await importKey(keyB64);
  const packed = fromBase64(packedB64);
  const iv = packed.slice(0, IV_BYTES);
  const ct = packed.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Gera um UUID v4 (usado como PK das tabelas). */
export function uuid(): string {
  return crypto.randomUUID();
}
