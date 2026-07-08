/**
 * Cliente da API OFICIAL do Mercado Livre (Módulo Core — 100% OAuth2).
 *
 * Base: `api.mercadolibre.com`. Autenticação por Bearer token (Authorization
 * Code + PKCE). Cobre: troca/refresh de token, dados do usuário, operações de
 * fulfillment (envios) e a Nota Fiscal do pedido (`embeddedInvoice`).
 *
 * Observação honesta sobre a "lista de envios Full do dia": a listagem rica por
 * data de coleta vive hoje no endpoint web interno (§1.1, Módulo Beta). A API
 * oficial expõe operações de fulfillment em `/stock/fulfillment/operations`.
 * Confirme os parâmetros exatos contra a doc vigente do ML antes do go-live.
 */

import type { Env } from "../types";

export interface MlTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
}

export interface MlUser {
  id: number;
  nickname: string;
  site_id: string;
}

export class MlApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "MlApiError";
  }
}

/** Monta a URL de autorização (o app abre no in-app browser). */
export function buildAuthorizeUrl(
  env: Env,
  state: string,
  codeChallenge: string,
): string {
  const u = new URL(`${env.ML_AUTH_BASE}/authorization`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.ML_CLIENT_ID);
  u.searchParams.set("redirect_uri", env.ML_REDIRECT_URI);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** Troca o `code` do callback por access/refresh token. */
export async function exchangeCodeForToken(
  env: Env,
  code: string,
  codeVerifier: string,
): Promise<MlTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    code,
    redirect_uri: env.ML_REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  return postToken(env, body);
}

/** Renova o access token a partir do refresh token. */
export async function refreshToken(
  env: Env,
  refresh: string,
): Promise<MlTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    refresh_token: refresh,
  });
  return postToken(env, body);
}

async function postToken(
  env: Env,
  body: URLSearchParams,
): Promise<MlTokenResponse> {
  const res = await fetch(`${env.ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  const json = await safeJson(res);
  if (!res.ok) {
    throw new MlApiError("Falha ao obter token OAuth do ML.", res.status, json);
  }
  return json as MlTokenResponse;
}

/** Dados do usuário autenticado. */
export async function getMe(env: Env, accessToken: string): Promise<MlUser> {
  return apiGet<MlUser>(env, "/users/me", accessToken);
}

/**
 * Operações de fulfillment (envios de estoque para o Full) — API oficial.
 * Retorna o payload cru; a normalização para DTO acontece na rota.
 */
export async function searchFulfillmentOperations(
  env: Env,
  accessToken: string,
  sellerId: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const qs = new URLSearchParams({ seller_id: sellerId, ...params });
  return apiGet<unknown>(
    env,
    `/stock/fulfillment/operations/search?${qs.toString()}`,
    accessToken,
  );
}

/** Detalhe de um shipment oficial (status, datas). */
export async function getShipment(
  env: Env,
  accessToken: string,
  shipmentId: string | number,
): Promise<unknown> {
  return apiGet<unknown>(env, `/shipments/${shipmentId}`, accessToken);
}

/** Itens/SKUs de um shipment. */
export async function getShipmentItems(
  env: Env,
  accessToken: string,
  shipmentId: string | number,
): Promise<unknown> {
  return apiGet<unknown>(env, `/shipments/${shipmentId}/items`, accessToken);
}

/**
 * Nota Fiscal do pedido Full via `Get Order` — campo `embeddedInvoice` (XML).
 * Retorna `{ xml }` quando presente, ou `null`.
 */
export async function getOrderInvoice(
  env: Env,
  accessToken: string,
  orderId: string | number,
): Promise<{ xml: string } | null> {
  const order = await apiGet<any>(env, `/orders/${orderId}`, accessToken);
  const xml = order?.embeddedInvoice?.xml ?? order?.embedded_invoice?.xml;
  return typeof xml === "string" ? { xml } : null;
}

async function apiGet<T>(
  env: Env,
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${env.ML_API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const json = await safeJson(res);
  if (!res.ok) {
    throw new MlApiError(`GET ${path} falhou.`, res.status, json);
  }
  return json as T;
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}
