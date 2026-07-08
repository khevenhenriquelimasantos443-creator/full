/**
 * Token de sessão do app (JWT HS256 minimalista).
 *
 * O app se autentica no backend com este token (não com credenciais do ML).
 * Assim o `client_secret` e os tokens OAuth nunca saem do backend (§5).
 */

interface SessionClaims {
  sub: string; // user_id
  iat: number;
  exp: number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeStr(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}

function b64urlDecodeStr(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Emite um token de sessão válido por `ttlSeconds` (padrão 30 dias). */
export async function issueSession(
  userId: string,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims: SessionClaims = { sub: userId, iat: now, exp: now + ttlSeconds };
  const head = b64urlEncodeStr(JSON.stringify(header));
  const body = b64urlEncodeStr(JSON.stringify(claims));
  const signingInput = `${head}.${body}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verifica assinatura e expiração; retorna o `user_id` ou `null`. */
export async function verifySession(
  token: string,
  secret: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const key = await hmacKey(secret);
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  const expectedB64 = b64urlEncode(new Uint8Array(expected));
  if (!timingSafeEqual(expectedB64, sig)) return null;

  try {
    const claims = JSON.parse(b64urlDecodeStr(body)) as SessionClaims;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
