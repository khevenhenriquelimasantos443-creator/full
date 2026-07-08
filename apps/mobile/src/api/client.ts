/**
 * Cliente HTTP do backend. Anexa o app session token (Bearer) e trata 401
 * (sessão expirada) para o app pedir reconexão. Nunca fala direto com o ML.
 */

import Constants from "expo-constants";
import type {
  Account,
  AuthCodeResponse,
  RefreshResult,
  ShipmentsResponse,
} from "./types";

// Prioridade: variável de ambiente (usada pelo script de demo) → app.json → local.
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string) ??
  "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class ApiClient {
  constructor(
    private token: string | null,
    private onUnauthorized?: () => void,
  ) {}

  setToken(token: string | null) {
    this.token = token;
  }

  authorizeUrl(email: string): string {
    return `${API_BASE}/auth/ml/start?email=${encodeURIComponent(email)}`;
  }

  /** Modo demonstração: retorna um session token com dados de exemplo. */
  async demoLogin(): Promise<string> {
    const res = await fetch(`${API_BASE}/auth/demo`);
    if (!res.ok) {
      throw new ApiError("modo demonstração indisponível", res.status);
    }
    const json = (await res.json()) as { session: string };
    return json.session;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const json = res.status === 204 ? null : await res.json().catch(() => null);

    if (res.status === 401) {
      this.onUnauthorized?.();
      throw new ApiError("sessão expirada", 401, json?.code);
    }
    if (!res.ok) {
      throw new ApiError(json?.error ?? "erro na requisição", res.status, json?.code);
    }
    return json as T;
  }

  listAccounts(): Promise<{ accounts: Account[] }> {
    return this.request("/accounts");
  }

  removeAccount(id: string): Promise<{ ok: true }> {
    return this.request(`/accounts/${id}`, { method: "DELETE" });
  }

  registerPushToken(expoToken: string, platform: string): Promise<{ ok: true }> {
    return this.request("/accounts/push-token", {
      method: "POST",
      body: JSON.stringify({ expoToken, platform }),
    });
  }

  shipmentsOfDay(accountId: string, date?: string): Promise<ShipmentsResponse> {
    const q = new URLSearchParams({ accountId });
    if (date) q.set("date", date);
    return this.request(`/shipments?${q.toString()}`);
  }

  refresh(accountId: string): Promise<RefreshResult> {
    return this.request(`/shipments/refresh?accountId=${accountId}`, {
      method: "POST",
    });
  }

  authCode(accountId: string, opts: { refresh?: boolean } = {}): Promise<AuthCodeResponse> {
    const q = new URLSearchParams({ accountId });
    if (opts.refresh) q.set("refresh", "1");
    return this.request(`/beta/auth-code?${q.toString()}`);
  }

  invoice(accountId: string, orderId: string): Promise<{ xml: string }> {
    return this.request(`/shipments/invoice?accountId=${accountId}&orderId=${orderId}`);
  }
}
