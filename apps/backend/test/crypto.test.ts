import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, uuid } from "../src/lib/crypto";
import { issueSession, verifySession } from "../src/lib/session";

// chave base64 de 32 bytes
const KEY = Buffer.alloc(32, 7).toString("base64");

describe("criptografia de segredos em repouso (§7)", () => {
  it("faz round-trip de um token", async () => {
    const secret = "APP_USR-123456-refresh-token-abcdef";
    const enc = await encryptSecret(secret, KEY);
    expect(enc).not.toContain(secret);
    const dec = await decryptSecret(enc, KEY);
    expect(dec).toBe(secret);
  });

  it("gera IV distinto a cada cifragem (ciphertexts diferentes)", async () => {
    const a = await encryptSecret("mesmo-valor", KEY);
    const b = await encryptSecret("mesmo-valor", KEY);
    expect(a).not.toBe(b);
  });

  it("falha ao decifrar com chave errada", async () => {
    const enc = await encryptSecret("segredo", KEY);
    const outraChave = Buffer.alloc(32, 9).toString("base64");
    await expect(decryptSecret(enc, outraChave)).rejects.toBeTruthy();
  });

  it("rejeita chave com tamanho inválido", async () => {
    await expect(encryptSecret("x", "dGlueQ==")).rejects.toThrow(/32 bytes/);
  });
});

describe("token de sessão do app", () => {
  const SECRET = "segredo-de-sessao-bem-longo-para-hmac";

  it("emite e verifica um token", async () => {
    const token = await issueSession("user-1", SECRET);
    expect(await verifySession(token, SECRET)).toBe("user-1");
  });

  it("rejeita assinatura adulterada", async () => {
    const token = await issueSession("user-1", SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
    expect(await verifySession(tampered, SECRET)).toBeNull();
  });

  it("rejeita token expirado", async () => {
    const token = await issueSession("user-1", SECRET, -10);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejeita token com segredo diferente", async () => {
    const token = await issueSession("user-1", SECRET);
    expect(await verifySession(token, "outro-segredo")).toBeNull();
  });
});

describe("uuid", () => {
  it("gera identificadores únicos no formato v4", () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
