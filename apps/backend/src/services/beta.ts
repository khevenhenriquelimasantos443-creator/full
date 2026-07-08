/**
 * Módulo Beta — dados NÃO-oficiais da interface web do Mercado Livre.
 *
 * Isolado inteiramente no backend (§5.3): o cookie de sessão nunca chega ao app
 * mobile. Duas capacidades:
 *   1. Listagem de inbounds do dia — endpoint interno (§1.1), cookie + csrf.
 *   2. Detalhe do envio — HTML SSR, parseado via lib/nordic (§1.2). Sem headless.
 *
 * Toda função aqui pode falhar se o ML mudar a interface. As falhas são
 * sinalizadas (BetaUnavailableError / NordicParseError) para o chamador cair no
 * fallback (abrir a página oficial no navegador), nunca quebrar o app.
 */

import type { Env, NordicShipmentView } from "../types";
import { parseNordicShipmentHtml } from "../lib/nordic";

export interface BetaSession {
  /** Cabeçalho Cookie já montado (ex: "ssid=...; x-meli-session-id=..."). */
  cookie: string;
  csrfToken?: string;
}

export interface InboundListItem {
  inboundId: number;
  name?: string;
  status?: string;
}

export class BetaUnavailableError extends Error {
  constructor(
    message: string,
    readonly kind: "sessao_invalida" | "http" | "formato_inesperado",
    readonly status?: number,
  ) {
    super(message);
    this.name = "BetaUnavailableError";
  }
}

function betaHeaders(session: BetaSession): HeadersInit {
  const h: Record<string, string> = {
    cookie: session.cookie,
    "user-agent":
      "Mozilla/5.0 (ColetaFull backend; contato: operacao@coleta-full.app)",
    accept: "text/html,application/json",
    "accept-language": "pt-BR,pt;q=0.9",
  };
  if (session.csrfToken) h["x-csrf-token"] = session.csrfToken;
  return h;
}

/** 401/redirect para login ⇒ sessão precisa ser reautenticada (§7). */
function assertSessionAlive(res: Response) {
  if (res.status === 401 || res.status === 403) {
    throw new BetaUnavailableError(
      "Sessão do Módulo Beta inválida ou expirada — reautenticar.",
      "sessao_invalida",
      res.status,
    );
  }
  // Redirecionamento para tela de login (heurística).
  const loc = res.headers.get("location") ?? "";
  if (res.status >= 300 && res.status < 400 && /login|signin/i.test(loc)) {
    throw new BetaUnavailableError(
      "Sessão do Módulo Beta redirecionada para login — reautenticar.",
      "sessao_invalida",
      res.status,
    );
  }
}

/**
 * Lista os envios Full (inbounds) da conta via endpoint interno (§1.1).
 * `status` filtra por status; paginação por `offset`/`limit`.
 */
export async function listInbounds(
  env: Env,
  session: BetaSession,
  opts: { status?: string; offset?: number; limit?: number } = {},
): Promise<InboundListItem[]> {
  const qs = new URLSearchParams({
    query: "",
    page: "1",
    status: opts.status ?? "",
    orders: "",
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 50),
  });
  const url = `${env.ML_WEB_BASE}/api/shipping/inbounds/search?${qs.toString()}`;

  const res = await fetch(url, {
    headers: betaHeaders(session),
    redirect: "manual",
  });
  assertSessionAlive(res);
  if (!res.ok) {
    throw new BetaUnavailableError(
      `Listagem de inbounds falhou (HTTP ${res.status}).`,
      "http",
      res.status,
    );
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new BetaUnavailableError(
      "Resposta de inbounds não era JSON.",
      "formato_inesperado",
    );
  }

  const results: any[] =
    json?.results ?? json?.inbounds ?? json?.data?.results ?? [];
  if (!Array.isArray(results)) {
    throw new BetaUnavailableError(
      "Formato inesperado na listagem de inbounds.",
      "formato_inesperado",
    );
  }
  return results.map((r) => ({
    inboundId: Number(r?.id ?? r?.inboundId ?? r?.inbound_id),
    name: r?.name ?? r?.description,
    status: r?.status,
  }));
}

/**
 * Busca o HTML da página de detalhe e extrai a view normalizada (§1.2).
 * Lança BetaUnavailableError (sessão/HTTP) ou NordicParseError (formato).
 */
export async function getInboundDetail(
  env: Env,
  session: BetaSession,
  inboundId: number,
): Promise<NordicShipmentView> {
  const url = `${env.ML_WEB_BASE}/shipping/inbounds/${inboundId}/details`;
  const res = await fetch(url, {
    headers: betaHeaders(session),
    redirect: "manual",
  });
  assertSessionAlive(res);
  if (!res.ok) {
    throw new BetaUnavailableError(
      `Detalhe do inbound ${inboundId} falhou (HTTP ${res.status}).`,
      "http",
      res.status,
    );
  }
  const html = await res.text();
  return parseNordicShipmentHtml(html); // pode lançar NordicParseError
}
