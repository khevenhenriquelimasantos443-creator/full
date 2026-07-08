/**
 * Coleta os envios Full do dia de uma conta e atualiza o cache local.
 * Usado pelo cron (§5, scheduler) e pelo "forçar atualização" do app.
 *
 * Combina os dois módulos:
 *   - Core: base de envios (quando a API oficial de fulfillment estiver ligada).
 *   - Beta: enriquece com motorista/placa/transportadora e captura o
 *     handshakeToken (código de autorização) do dia.
 *
 * Falhas do Beta NÃO derrubam a coleta: o Core segue, o Beta fica marcado como
 * indisponível para aquele envio (fallback no app).
 */

import type { Env, NordicShipmentView } from "../types";
import { Repo } from "../db/repo";
import {
  listInbounds,
  getInboundDetail,
  BetaUnavailableError,
  type BetaSession,
} from "./beta";
import { NordicParseError } from "../lib/nordic";

export interface CollectResult {
  accountId: string;
  betaDisponivel: boolean;
  enviosProcessados: number;
  codigoDoDia?: string;
  erro?: string;
}

/** Data de hoje em America/Sao_Paulo, formato YYYY-MM-DD. */
export function todaySaoPaulo(now = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function volumesFrom(view: NordicShipmentView): number {
  return view.items.reduce((sum, it) => sum + (it.declaredQuantity || 0), 0);
}

/** Coleta e persiste os dados do dia para uma conta. */
export async function collectAccount(
  env: Env,
  repo: Repo,
  accountId: string,
): Promise<CollectResult> {
  const dataRef = todaySaoPaulo();

  const session = await repo.getBetaSession(accountId);
  if (!session) {
    return {
      accountId,
      betaDisponivel: false,
      enviosProcessados: 0,
      erro: "sessão do Módulo Beta não configurada",
    };
  }

  const betaSession: BetaSession = session;
  let inbounds;
  try {
    inbounds = await listInbounds(env, betaSession);
  } catch (e) {
    if (e instanceof BetaUnavailableError && e.kind === "sessao_invalida") {
      await repo.markBetaSessionInvalid(accountId);
    }
    return {
      accountId,
      betaDisponivel: false,
      enviosProcessados: 0,
      erro: describeError(e),
    };
  }

  let codigoDoDia: string | undefined;
  let processados = 0;

  for (const inbound of inbounds) {
    if (!Number.isFinite(inbound.inboundId)) continue;

    let view: NordicShipmentView;
    try {
      view = await getInboundDetail(env, betaSession, inbound.inboundId);
    } catch (e) {
      // Detalhe individual falhou: registra o básico e segue.
      await repo.upsertShipment({
        mlAccountId: accountId,
        inboundId: inbound.inboundId,
        description: inbound.name ?? null,
        status: inbound.status ?? null,
      });
      if (e instanceof BetaUnavailableError && e.kind === "sessao_invalida") {
        await repo.markBetaSessionInvalid(accountId);
        break;
      }
      // NordicParseError ⇒ layout mudou para esse envio; continua.
      if (!(e instanceof NordicParseError)) throw e;
      continue;
    }

    const shipmentId = await repo.upsertShipment({
      mlAccountId: accountId,
      inboundId: view.inboundId ?? inbound.inboundId,
      description: view.name ?? inbound.name ?? null,
      volumes: volumesFrom(view),
      status: view.status ?? null,
      subStatus: view.subStatus ?? null,
      dataColeta: view.scheduledDate ?? null,
    });

    await repo.saveCollectionDetail({
      shipmentId,
      horarioDe: view.collection.horarioDe ?? null,
      horarioAte: view.collection.horarioAte ?? null,
      motorista: view.collection.motorista ?? null,
      placa: view.collection.placa ?? null,
      transportadora: view.collection.transportadora ?? null,
      localColeta: view.collection.localColeta ?? null,
      pickupStatus: view.collection.pickupStatus ?? null,
      confiabilidade: "fresh",
    });

    const token = view.collection.handshakeToken;
    if (token && !codigoDoDia) {
      codigoDoDia = token;
      await repo.saveDailyAuthCode({
        mlAccountId: accountId,
        shipmentId,
        codigo: token,
        dataRef,
      });
    }

    processados++;
  }

  return {
    accountId,
    betaDisponivel: true,
    enviosProcessados: processados,
    codigoDoDia,
  };
}

function describeError(e: unknown): string {
  if (e instanceof BetaUnavailableError) return `${e.kind}: ${e.message}`;
  if (e instanceof NordicParseError) return `parse: ${e.reason}`;
  return e instanceof Error ? e.message : String(e);
}
