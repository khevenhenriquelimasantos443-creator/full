/** Tipos dos payloads da API do backend (espelham os DTOs do Worker). */

export interface Account {
  id: string;
  mlUserId: string;
  nickname: string | null;
  siteId: string;
  status: string;
}

export interface ShipmentSummary {
  inboundId: number;
  description: string | null;
  volumes: number | null;
  status: string | null;
  subStatus: string | null;
  scheduledDate: string | null;
}

export interface ShipmentsResponse {
  date: string;
  accountId: string;
  shipments: ShipmentSummary[];
}

export interface AuthCodeResponse {
  accountId: string;
  date: string;
  code: string | null;
  obtidoEm: string | null;
  validadeHoras: number;
  aviso: string;
  fallbackUrl: string;
}

export interface RefreshResult {
  accountId: string;
  betaDisponivel: boolean;
  enviosProcessados: number;
  codigoDoDia?: string;
  erro?: string;
}
