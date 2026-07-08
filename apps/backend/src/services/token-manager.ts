/**
 * Garante um access_token válido para uma conta ML, renovando via refresh_token
 * quando estiver expirado ou perto disso. Persiste os novos tokens (cifrados).
 */

import type { Env } from "../types";
import { Repo, type MlAccountRow } from "../db/repo";
import { refreshToken, MlApiError } from "./mercadolibre";

const SKEW_MS = 60_000; // renova 1 min antes de expirar

export class TokenExpiredError extends Error {
  constructor(readonly accountId: string) {
    super("Token OAuth expirado e não foi possível renovar — reconectar conta.");
    this.name = "TokenExpiredError";
  }
}

/** Retorna um access_token válido, renovando se necessário. */
export async function ensureAccessToken(
  env: Env,
  repo: Repo,
  account: MlAccountRow,
): Promise<string> {
  const { accessToken, refreshToken: refresh, expiresAt } =
    await repo.decryptTokens(account);

  const stillValid =
    accessToken &&
    expiresAt &&
    new Date(expiresAt).getTime() - Date.now() > SKEW_MS;
  if (stillValid) return accessToken;

  if (!refresh) throw new TokenExpiredError(account.id);

  try {
    const t = await refreshToken(env, refresh);
    const newExpiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
    await repo.updateTokens(
      account.id,
      t.access_token,
      t.refresh_token,
      newExpiresAt,
    );
    return t.access_token;
  } catch (e) {
    if (e instanceof MlApiError && (e.status === 400 || e.status === 401)) {
      // refresh token inválido/revogado — exige reconexão pelo usuário.
      throw new TokenExpiredError(account.id);
    }
    throw e;
  }
}
