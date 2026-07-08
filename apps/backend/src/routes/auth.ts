/**
 * Broker OAuth2 do Mercado Livre (Authorization Code + PKCE).
 *
 * O app abre `/auth/ml/start` num in-app browser. O backend gera PKCE, guarda o
 * `code_verifier` num `state` CIFRADO (stateless — sem sessão de servidor) e
 * redireciona para o ML. No `/auth/callback`, decifra o state, troca o code por
 * tokens, cria/atualiza a conta e devolve o app session token via deep link.
 *
 * O `client_secret` e os tokens OAuth nunca saem do backend (§5).
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo } from "../db/repo";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { issueSession } from "../lib/session";
import { generateCodeVerifier, codeChallengeS256 } from "../lib/pkce";
import { ensureDemoData } from "../db/seed";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getMe,
} from "../services/mercadolibre";

interface OAuthState {
  v: string; // code_verifier
  email: string;
  ts: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const APP_DEEP_LINK = "coletafull://auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

/**
 * Modo demonstração: semeia dados de exemplo e devolve um session token, sem
 * Mercado Livre / OAuth / cookie. Só funciona com DEMO_MODE = "true".
 */
authRoutes.get("/demo", async (c) => {
  if (c.env.DEMO_MODE !== "true") {
    return c.json({ error: "modo demonstração desativado" }, 404);
  }
  const userId = await ensureDemoData(c.env);
  const session = await issueSession(userId, c.env.SESSION_JWT_SECRET);
  return c.json({ session, mode: "demo" });
});

/** Inicia o fluxo: gera PKCE + state e redireciona ao Mercado Livre. */
authRoutes.get("/ml/start", async (c) => {
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email é obrigatório" }, 400);

  const verifier = generateCodeVerifier();
  const challenge = await codeChallengeS256(verifier);
  const statePayload: OAuthState = { v: verifier, email, ts: Date.now() };
  const state = await encryptSecret(
    JSON.stringify(statePayload),
    c.env.TOKEN_ENC_KEY,
  );

  const url = buildAuthorizeUrl(c.env, state, challenge);
  return c.redirect(url, 302);
});

/** Callback do ML: troca o code, cria a conta, devolve o session token. */
authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const err = c.req.query("error");
  if (err) return c.json({ error: `Mercado Livre negou: ${err}` }, 400);
  if (!code || !state) {
    return c.json({ error: "code/state ausentes" }, 400);
  }

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(await decryptSecret(state, c.env.TOKEN_ENC_KEY));
  } catch {
    return c.json({ error: "state inválido" }, 400);
  }
  if (Date.now() - parsed.ts > STATE_TTL_MS) {
    return c.json({ error: "fluxo de login expirou, tente de novo" }, 400);
  }

  const token = await exchangeCodeForToken(c.env, code, parsed.v);
  const me = await getMe(c.env, token.access_token);

  const repo = new Repo(c.env);
  const userId = await repo.upsertUserByEmail(parsed.email);
  await repo.upsertMlAccount({
    userId,
    mlUserId: String(me.id),
    nickname: me.nickname,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    siteId: me.site_id ?? c.env.ML_SITE_ID,
  });

  const session = await issueSession(userId, c.env.SESSION_JWT_SECRET);

  // Redireciona de volta ao app com o token de sessão.
  const back = new URL(APP_DEEP_LINK);
  back.searchParams.set("session", session);
  return c.redirect(back.toString(), 302);
});
