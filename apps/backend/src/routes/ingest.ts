/**
 * Ingestão dos dados do Módulo Beta vindos da EXTENSÃO de navegador.
 *
 * Em vez de o backend manter uma sessão de cookie e raspar o site (frágil e
 * arriscado), a extensão lê os dados na sessão logada do próprio usuário e os
 * envia para cá. O backend só recebe, valida a conta e grava — o app lê depois.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { Repo } from "../db/repo";
import { requireAuth, type AuthVars } from "./middleware";

interface IngestShipment {
  inboundId: number;
  name?: string | null;
  status?: string | null;
  subStatus?: string | null;
  scheduledDate?: string | null;
  volumes?: number | null;
  transportadora?: string | null;
  motorista?: string | null;
  placa?: string | null;
  horarioDe?: string | null;
  horarioAte?: string | null;
  handshakeToken?: string | null;
}

interface IngestBody {
  accountId: string;
  dateRef?: string;
  code?: string | null;
  shipments: IngestShipment[];
}

export const ingestRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

ingestRoutes.use("*", requireAuth);

/** Recebe os envios do dia + código coletados pela extensão. */
ingestRoutes.post("/beta", async (c) => {
  const repo = new Repo(c.env);
  const body = await c.req.json<IngestBody>().catch(() => null);
  if (!body || !body.accountId || !Array.isArray(body.shipments)) {
    return c.json({ error: "payload inválido" }, 400);
  }

  const account = await repo.getAccountOwned(c.get("userId"), body.accountId);
  if (!account) return c.json({ error: "conta não encontrada" }, 404);

  const dateRef = body.dateRef ?? new Date().toISOString().slice(0, 10);
  let saved = 0;
  let codeFromShipments: string | null = body.code ?? null;

  for (const s of body.shipments) {
    if (!Number.isFinite(s.inboundId)) continue;

    const shipmentId = await repo.upsertShipment({
      mlAccountId: account.id,
      inboundId: s.inboundId,
      description: s.name ?? null,
      volumes: s.volumes ?? null,
      status: s.status ?? null,
      subStatus: s.subStatus ?? null,
      dataColeta: s.scheduledDate ?? null,
    });

    await repo.saveCollectionDetail({
      shipmentId,
      horarioDe: s.horarioDe ?? null,
      horarioAte: s.horarioAte ?? null,
      motorista: s.motorista ?? null,
      placa: s.placa ?? null,
      transportadora: s.transportadora ?? null,
      pickupStatus: null,
      confiabilidade: "fresh",
    });

    if (!codeFromShipments && s.handshakeToken) {
      codeFromShipments = s.handshakeToken;
    }
    saved++;
  }

  if (codeFromShipments) {
    await repo.saveDailyAuthCode({
      mlAccountId: account.id,
      codigo: codeFromShipments,
      dataRef: dateRef,
    });
  }

  return c.json({
    ok: true,
    enviosSalvos: saved,
    codigo: codeFromShipments ?? null,
    dateRef,
  });
});
