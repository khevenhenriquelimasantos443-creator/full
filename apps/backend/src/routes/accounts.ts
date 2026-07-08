/**
 * Contas ML conectadas ao usuário (Módulo Multi-Conta, §4.3).
 * Também registra o push token do dispositivo e, quando aplicável, a sessão do
 * Módulo Beta (cookie) — que fica só no backend.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo } from "../db/repo";
import { requireAuth, type AuthVars } from "./middleware";

export const accountRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVars;
}>();

accountRoutes.use("*", requireAuth);

/** Lista as contas ML do usuário para o seletor de conta ativa. */
accountRoutes.get("/", async (c) => {
  const repo = new Repo(c.env);
  const accounts = await repo.listAccounts(c.get("userId"));
  return c.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      mlUserId: a.ml_user_id,
      nickname: a.nickname,
      siteId: a.site_id,
      status: a.status,
    })),
  });
});

/** Remove uma conta conectada. */
accountRoutes.delete("/:id", async (c) => {
  const repo = new Repo(c.env);
  await repo.removeAccount(c.get("userId"), c.req.param("id"));
  return c.json({ ok: true });
});

/** Registra o push token (Expo) do dispositivo. */
accountRoutes.post("/push-token", async (c) => {
  const body = await c.req.json<{ expoToken?: string; platform?: string }>();
  if (!body.expoToken) return c.json({ error: "expoToken é obrigatório" }, 400);
  const repo = new Repo(c.env);
  await repo.savePushToken(c.get("userId"), body.expoToken, body.platform);
  return c.json({ ok: true });
});

/**
 * Configura a sessão do Módulo Beta para uma conta (cookie de sessão web).
 * Recomenda-se um usuário Colaborador de menor privilégio (§7). O cookie é
 * cifrado em repouso e nunca devolvido ao app.
 */
accountRoutes.put("/:id/beta-session", async (c) => {
  const repo = new Repo(c.env);
  const account = await repo.getAccountOwned(c.get("userId"), c.req.param("id"));
  if (!account) return c.json({ error: "conta não encontrada" }, 404);

  const body = await c.req.json<{ cookie?: string; csrfToken?: string }>();
  if (!body.cookie) return c.json({ error: "cookie é obrigatório" }, 400);

  await repo.saveBetaSession({
    mlAccountId: account.id,
    cookie: body.cookie,
    csrfToken: body.csrfToken,
  });
  return c.json({ ok: true });
});
