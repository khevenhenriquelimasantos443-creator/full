/**
 * Worker do Coleta Full — ponto de entrada.
 *
 * `fetch`:     API REST que o app mobile consome.
 * `scheduled`: cron que puxa os envios do dia de todas as contas ativas e
 *              captura o código de autorização assim que ele aparece (§4.4).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { Repo } from "./db/repo";
import { collectAccount } from "./services/collector";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/accounts";
import { shipmentRoutes } from "./routes/shipments";
import { betaRoutes } from "./routes/beta";
import { proofRoutes } from "./routes/proofs";
import { ingestRoutes } from "./routes/ingest";
import type { AuthVars } from "./routes/middleware";

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "coleta-full-backend" }));

app.route("/auth", authRoutes);
app.route("/accounts", accountRoutes);
app.route("/shipments", shipmentRoutes);
app.route("/beta", betaRoutes);
app.route("/proofs", proofRoutes);
app.route("/ingest", ingestRoutes);

app.onError((err, c) => {
  // Nunca logar tokens/cookies — apenas a mensagem do erro.
  console.error("erro:", err.name, err.message);
  return c.json({ error: "erro interno" }, 500);
});

app.notFound((c) => c.json({ error: "rota não encontrada" }, 404));

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const repo = new Repo(env);
    const accountIds = await repo.allActiveAccountIds();
    ctx.waitUntil(
      (async () => {
        for (const accountId of accountIds) {
          try {
            const result = await collectAccount(env, repo, accountId);
            console.log(
              `coleta ${accountId}: ${result.enviosProcessados} envios,` +
                ` beta=${result.betaDisponivel}` +
                (result.codigoDoDia ? ", código capturado" : ""),
            );
          } catch (e) {
            console.error(
              `coleta ${accountId} falhou:`,
              (e as Error).message,
            );
          }
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
