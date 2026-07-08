/**
 * Fotos de confirmação de fechamento da coleta.
 *
 * O binário vai para o bucket R2 (`PROOFS_BUCKET`); o D1 guarda os metadados.
 * O app envia a foto (multipart) e lista/exibe os comprovantes por envio.
 * Se o R2 não estiver configurado, responde 501 com orientação.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo, type MlAccountRow } from "../db/repo";
import { requireAuth, type AuthVars } from "./middleware";
import { uuid } from "../lib/crypto";

export const proofRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

proofRoutes.use("*", requireAuth);

async function resolveShipment(
  c: any,
  repo: Repo,
): Promise<{ account: MlAccountRow; shipmentId: string } | { error: string; status: number }> {
  const accountId = c.req.query("accountId");
  const inboundId = Number(c.req.query("inboundId"));
  if (!accountId || !Number.isFinite(inboundId)) {
    return { error: "accountId e inboundId são obrigatórios", status: 400 };
  }
  const account = await repo.getAccountOwned(c.get("userId"), accountId);
  if (!account) return { error: "conta não encontrada", status: 404 };
  const shipmentId = await repo.getShipmentIdByInbound(account.id, inboundId);
  if (!shipmentId) return { error: "envio não encontrado", status: 404 };
  return { account, shipmentId };
}

/** Envia uma foto de confirmação (multipart/form-data, campo `file`). */
proofRoutes.post("/", async (c) => {
  if (!c.env.PROOFS_BUCKET) {
    return c.json(
      { error: "armazenamento de fotos não configurado (configure o R2)", code: "no_storage" },
      501,
    );
  }
  const repo = new Repo(c.env);
  const resolved = await resolveShipment(c, repo);
  if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status as any);

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "campo `file` (imagem) é obrigatório" }, 400);
  }

  const inboundId = c.req.query("inboundId");
  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-60) || "foto.jpg";
  const key = `proofs/${resolved.account.id}/${inboundId}/${uuid()}-${safeName}`;

  await c.env.PROOFS_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const id = await repo.saveCollectionProof({
    shipmentId: resolved.shipmentId,
    mlAccountId: resolved.account.id,
    storageKey: key,
    contentType: file.type,
    observacao: typeof body["observacao"] === "string" ? body["observacao"] : undefined,
  });

  return c.json({ ok: true, id, key });
});

/** Lista os comprovantes de um envio (com URL para exibição). */
proofRoutes.get("/", async (c) => {
  const repo = new Repo(c.env);
  const resolved = await resolveShipment(c, repo);
  if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status as any);

  const rows = await repo.listCollectionProofs(resolved.shipmentId);
  return c.json({
    proofs: rows.map((r) => ({
      id: r.id,
      contentType: r.content_type,
      observacao: r.observacao,
      criadoEm: r.criado_em,
      url: `/proofs/file?accountId=${resolved.account.id}&key=${encodeURIComponent(r.storage_key)}`,
    })),
  });
});

/** Serve o binário da foto a partir do R2 (apenas do próprio dono). */
proofRoutes.get("/file", async (c) => {
  if (!c.env.PROOFS_BUCKET) return c.json({ error: "armazenamento não configurado" }, 501);
  const repo = new Repo(c.env);
  const accountId = c.req.query("accountId");
  const key = c.req.query("key");
  if (!accountId || !key) return c.json({ error: "accountId e key obrigatórios" }, 400);

  const account = await repo.getAccountOwned(c.get("userId"), accountId);
  // Impede acessar chave de outra conta (isolamento).
  if (!account || !key.startsWith(`proofs/${account.id}/`)) {
    return c.json({ error: "não autorizado" }, 403);
  }

  const obj = await c.env.PROOFS_BUCKET.get(key);
  if (!obj) return c.json({ error: "foto não encontrada" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
});
