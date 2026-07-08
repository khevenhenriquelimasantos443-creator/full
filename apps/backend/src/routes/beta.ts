/**
 * Módulo Beta — código de autorização do dia e detalhe de coleta.
 * Tudo aqui é sinalizado como não-oficial e sempre acompanha um `fallbackUrl`
 * para o app abrir a página oficial no navegador se a extração falhar (§4.2).
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo } from "../db/repo";
import { requireAuth, type AuthVars } from "./middleware";
import { collectAccount, todaySaoPaulo } from "../services/collector";

export const betaRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVars;
}>();

betaRoutes.use("*", requireAuth);

const AVISO_BETA =
  "Dados obtidos de forma não-oficial da interface do Mercado Livre. " +
  "Podem atrasar ou falhar se a plataforma mudar o layout.";

/**
 * Código de autorização do dia (handshakeToken) — o card em destaque da Home.
 * Lê do cache; se não houver e `refresh=1`, dispara uma coleta na hora.
 */
betaRoutes.get("/auth-code", async (c) => {
  const repo = new Repo(c.env);
  const accountId = c.req.query("accountId");
  if (!accountId) return c.json({ error: "accountId é obrigatório" }, 400);

  const account = await repo.getAccountOwned(c.get("userId"), accountId);
  if (!account) return c.json({ error: "conta não encontrada" }, 404);

  const date = c.req.query("date") ?? todaySaoPaulo();
  let code = await repo.getDailyAuthCode(account.id, date);

  if (!code && c.req.query("refresh") === "1") {
    const result = await collectAccount(c.env, repo, account.id);
    if (result.codigoDoDia) {
      code = { codigo: result.codigoDoDia, obtido_em: new Date().toISOString() };
    }
  }

  return c.json({
    accountId: account.id,
    date,
    code: code?.codigo ?? null,
    obtidoEm: code?.obtido_em ?? null,
    // Validade declarada de 24h (§1.3 — confirmar empiricamente).
    validadeHoras: 24,
    aviso: AVISO_BETA,
    fallbackUrl: `${c.env.ML_WEB_BASE}/shipping/inbounds`,
  });
});
