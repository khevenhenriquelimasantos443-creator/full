/**
 * Dados de demonstração (modo demo). Popula um usuário com duas contas ML
 * fictícias e envios do dia, incluindo o código de autorização — para o app
 * rodar de ponta a ponta sem Mercado Livre, OAuth ou cookie.
 *
 * Idempotente: pode ser chamado toda vez que alguém entra em modo demo.
 */

import type { Env } from "../types";
import { Repo } from "./repo";
import { todaySaoPaulo } from "../services/collector";

const DEMO_EMAIL = "demo@coleta-full.app";

/** ISO de hoje (America/Sao_Paulo) num horário fixo. */
function todayAt(hhmm: string): string {
  return `${todaySaoPaulo()}T${hhmm}:00-03:00`;
}

interface DemoShipment {
  inboundId: number;
  description: string;
  volumes: number;
  status: string;
  subStatus: string;
  hora: string;
  motorista: string;
  placa: string;
  transportadora: string;
  horarioDe: string;
  horarioAte: string;
  pickupStatus: string;
}

interface DemoAccount {
  mlUserId: string;
  nickname: string;
  codigo: string;
  shipments: DemoShipment[];
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    mlUserId: "DEMO-BEMBARATO",
    nickname: "Bem Barato (demo)",
    codigo: "A8489FE6",
    shipments: [
      {
        inboundId: 71182418,
        description: "TRUSS",
        volumes: 36,
        status: "confirmed",
        subStatus: "scheduled",
        hora: "18:00",
        motorista: "Geovani Santos Silva",
        placa: "GIM6J64",
        transportadora: "JM Transportes",
        horarioDe: "10:54",
        horarioAte: "12:54",
        pickupStatus: "PENDING",
      },
      {
        inboundId: 71190233,
        description: "Kit Skincare Verão",
        volumes: 18,
        status: "confirmed",
        subStatus: "in_transit",
        hora: "14:30",
        motorista: "Marcos Antônio Pereira",
        placa: "FKR2A18",
        transportadora: "Loggi",
        horarioDe: "13:00",
        horarioAte: "15:00",
        pickupStatus: "PENDING",
      },
    ],
  },
  {
    mlUserId: "DEMO-SOFTUP",
    nickname: "SOFT UP (demo)",
    codigo: "B7723C10",
    shipments: [
      {
        inboundId: 68450912,
        description: "Fones Bluetooth XZ",
        volumes: 60,
        status: "confirmed",
        subStatus: "scheduled",
        hora: "16:00",
        motorista: "Rafael Lima Costa",
        placa: "HJP7D22",
        transportadora: "Total Express",
        horarioDe: "15:30",
        horarioAte: "17:30",
        pickupStatus: "PENDING",
      },
    ],
  },
];

/** Garante os dados de demonstração e devolve o `userId`. */
export async function ensureDemoData(env: Env): Promise<string> {
  const repo = new Repo(env);
  const userId = await repo.upsertUserByEmail(DEMO_EMAIL, "Operação (demo)");
  const dataRef = todaySaoPaulo();
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  for (const acc of DEMO_ACCOUNTS) {
    const accountId = await repo.upsertMlAccount({
      userId,
      mlUserId: acc.mlUserId,
      nickname: acc.nickname,
      accessToken: "demo-access-token",
      refreshToken: "demo-refresh-token",
      expiresAt: farFuture,
      siteId: "MLB",
    });

    for (const s of acc.shipments) {
      const shipmentId = await repo.upsertShipment({
        mlAccountId: accountId,
        inboundId: s.inboundId,
        description: s.description,
        volumes: s.volumes,
        status: s.status,
        subStatus: s.subStatus,
        dataColeta: todayAt(s.hora),
      });

      await repo.saveCollectionDetail({
        shipmentId,
        horarioDe: s.horarioDe,
        horarioAte: s.horarioAte,
        motorista: s.motorista,
        placa: s.placa,
        transportadora: s.transportadora,
        pickupStatus: s.pickupStatus,
        confiabilidade: "fresh",
      });
    }

    await repo.saveDailyAuthCode({
      mlAccountId: accountId,
      codigo: acc.codigo,
      dataRef,
    });
  }

  return userId;
}
