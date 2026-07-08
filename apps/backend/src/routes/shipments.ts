/**
 * Envios Full do dia (o que o app consome na Home e no Detalhe).
 * Lê do cache local (populado pelo cron) e oferece "forçar atualização".
 * A NF-e vem da API oficial (embeddedInvoice).
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo, type MlAccountRow } from "../db/repo";
import { requireAuth, type AuthVars } from "./middleware";
import { collectAccount, todaySaoPaulo } from "../services/collector";
import { ensureAccessToken, TokenExpiredError } from "../services/token-manager";
import { getOrderInvoice } from "../services/mercadolibre";

export const shipmentRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVars;
}>();

shipmentRoutes.use("*", requireAuth);

/** Resolve a conta e confirma que pertence ao usuário logado (isolamento). */
async function ownedAccount(
  c: any,
  repo: Repo,
): Promise<MlAccountRow | null> {
  const accountId = c.req.query("accountId");
  if (!accountId) return null;
  return repo.getAccountOwned(c.get("userId"), accountId);
}

/** Lista os envios Full do dia (cache) para a conta ativa. */
shipmentRoutes.get("/", async (c) => {
  const repo = new Repo(c.env);
  const account = await ownedAccount(c, repo);
  if (!account) return c.json({ error: "accountId inválido" }, 400);

  const date = c.req.query("date") ?? todaySaoPaulo();
  const rows = await repo.shipmentsForDay(account.id, date);
  return c.json({
    date,
    accountId: account.id,
    shipments: rows.map((r) => ({
      inboundId: r.inbound_id,
      description: r.description,
      volumes: r.volumes,
      status: r.status,
      subStatus: r.sub_status,
      scheduledDate: r.data_coleta,
    })),
  });
});

/** Força uma atualização imediata (botão "forçar atualização" do app). */
shipmentRoutes.post("/refresh", async (c) => {
  const repo = new Repo(c.env);
  const account = await ownedAccount(c, repo);
  if (!account) return c.json({ error: "accountId inválido" }, 400);

  const result = await collectAccount(c.env, repo, account.id);
  return c.json(result);
});

/**
 * NF-e do pedido (API oficial). O app passa o `orderId` do envio.
 * Retorna o XML embutido para preview/compartilhamento.
 */
shipmentRoutes.get("/invoice", async (c) => {
  const repo = new Repo(c.env);
  const account = await ownedAccount(c, repo);
  if (!account) return c.json({ error: "accountId inválido" }, 400);

  const orderId = c.req.query("orderId");
  if (!orderId) return c.json({ error: "orderId é obrigatório" }, 400);

  let accessToken: string;
  try {
    accessToken = await ensureAccessToken(c.env, repo, account);
  } catch (e) {
    if (e instanceof TokenExpiredError) {
      return c.json({ error: "reconecte sua conta", code: "token_expired" }, 401);
    }
    throw e;
  }

  const invoice = await getOrderInvoice(c.env, accessToken, orderId);
  if (!invoice) return c.json({ error: "NF-e não disponível" }, 404);
  return c.json({ orderId, format: "xml", xml: invoice.xml });
});
