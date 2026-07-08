/**
 * Camada de acesso ao D1. Encapsula as queries do modelo do §6.
 * Toda query filtra por `ml_account_id`/`user_id` para garantir isolamento
 * multi-tenant (§10 — risco de vazamento entre contas).
 */

import type { Env } from "../types";
import { encryptSecret, decryptSecret, uuid } from "../lib/crypto";

export interface MlAccountRow {
  id: string;
  user_id: string;
  ml_user_id: string;
  nickname: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  site_id: string;
  status: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
}

export class Repo {
  constructor(private readonly env: Env) {}

  private get db(): D1Database {
    return this.env.DB;
  }

  // ---- users -------------------------------------------------------------

  async upsertUserByEmail(email: string, nome?: string): Promise<string> {
    const existing = await this.db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (existing) return existing.id;

    const id = uuid();
    await this.db
      .prepare("INSERT INTO users (id, nome, email) VALUES (?, ?, ?)")
      .bind(id, nome ?? null, email)
      .run();
    return id;
  }

  // ---- ml_accounts -------------------------------------------------------

  async upsertMlAccount(params: {
    userId: string;
    mlUserId: string;
    nickname?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    siteId: string;
  }): Promise<string> {
    const accessEnc = await encryptSecret(
      params.accessToken,
      this.env.TOKEN_ENC_KEY,
    );
    const refreshEnc = await encryptSecret(
      params.refreshToken,
      this.env.TOKEN_ENC_KEY,
    );

    const existing = await this.db
      .prepare(
        "SELECT id FROM ml_accounts WHERE user_id = ? AND ml_user_id = ?",
      )
      .bind(params.userId, params.mlUserId)
      .first<{ id: string }>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE ml_accounts
             SET nickname = ?, access_token_enc = ?, refresh_token_enc = ?,
                 token_expires_at = ?, site_id = ?, status = 'ativa',
                 atualizado_em = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          params.nickname ?? null,
          accessEnc,
          refreshEnc,
          params.expiresAt,
          params.siteId,
          existing.id,
        )
        .run();
      return existing.id;
    }

    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO ml_accounts
           (id, user_id, ml_user_id, nickname, access_token_enc,
            refresh_token_enc, token_expires_at, site_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativa')`,
      )
      .bind(
        id,
        params.userId,
        params.mlUserId,
        params.nickname ?? null,
        accessEnc,
        refreshEnc,
        params.expiresAt,
        params.siteId,
      )
      .run();
    return id;
  }

  async listAccounts(userId: string): Promise<
    Array<Pick<MlAccountRow, "id" | "ml_user_id" | "nickname" | "site_id" | "status">>
  > {
    const { results } = await this.db
      .prepare(
        `SELECT id, ml_user_id, nickname, site_id, status
           FROM ml_accounts WHERE user_id = ? ORDER BY criado_em`,
      )
      .bind(userId)
      .all<MlAccountRow>();
    return results ?? [];
  }

  /** IDs de todas as contas ativas — usado pelo cron de coleta. */
  async allActiveAccountIds(): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT id FROM ml_accounts WHERE status = 'ativa'")
      .all<{ id: string }>();
    return (results ?? []).map((r) => r.id);
  }

  /** Retorna a conta se pertencer ao usuário (checagem de isolamento). */
  async getAccountOwned(
    userId: string,
    accountId: string,
  ): Promise<MlAccountRow | null> {
    return this.db
      .prepare("SELECT * FROM ml_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, userId)
      .first<MlAccountRow>();
  }

  async removeAccount(userId: string, accountId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM ml_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, userId)
      .run();
  }

  async decryptTokens(row: MlAccountRow): Promise<DecryptedTokens> {
    return {
      accessToken: row.access_token_enc
        ? await decryptSecret(row.access_token_enc, this.env.TOKEN_ENC_KEY)
        : "",
      refreshToken: row.refresh_token_enc
        ? await decryptSecret(row.refresh_token_enc, this.env.TOKEN_ENC_KEY)
        : "",
      expiresAt: row.token_expires_at,
    };
  }

  async updateTokens(
    accountId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: string,
  ): Promise<void> {
    const accessEnc = await encryptSecret(accessToken, this.env.TOKEN_ENC_KEY);
    const refreshEnc = await encryptSecret(refreshToken, this.env.TOKEN_ENC_KEY);
    await this.db
      .prepare(
        `UPDATE ml_accounts
           SET access_token_enc = ?, refresh_token_enc = ?,
               token_expires_at = ?, status = 'ativa',
               atualizado_em = datetime('now')
         WHERE id = ?`,
      )
      .bind(accessEnc, refreshEnc, expiresAt, accountId)
      .run();
  }

  // ---- full_shipments (cache) -------------------------------------------

  async upsertShipment(params: {
    mlAccountId: string;
    inboundId: number;
    description?: string | null;
    volumes?: number | null;
    status?: string | null;
    subStatus?: string | null;
    dataColeta?: string | null;
  }): Promise<string> {
    const existing = await this.db
      .prepare(
        "SELECT id FROM full_shipments WHERE ml_account_id = ? AND inbound_id = ?",
      )
      .bind(params.mlAccountId, params.inboundId)
      .first<{ id: string }>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE full_shipments
             SET description = ?, volumes = ?, status = ?, sub_status = ?,
                 data_coleta = ?, atualizado_em = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          params.description ?? null,
          params.volumes ?? null,
          params.status ?? null,
          params.subStatus ?? null,
          params.dataColeta ?? null,
          existing.id,
        )
        .run();
      return existing.id;
    }

    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO full_shipments
           (id, ml_account_id, inbound_id, description, volumes, status,
            sub_status, data_coleta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        params.mlAccountId,
        params.inboundId,
        params.description ?? null,
        params.volumes ?? null,
        params.status ?? null,
        params.subStatus ?? null,
        params.dataColeta ?? null,
      )
      .run();
    return id;
  }

  /** Envios com data de coleta no dia `yyyymmdd` (formato YYYY-MM-DD). */
  async shipmentsForDay(
    mlAccountId: string,
    yyyymmdd: string,
  ): Promise<
    Array<{
      id: string;
      inbound_id: number;
      description: string | null;
      volumes: number | null;
      status: string | null;
      sub_status: string | null;
      data_coleta: string | null;
    }>
  > {
    const { results } = await this.db
      .prepare(
        `SELECT id, inbound_id, description, volumes, status, sub_status, data_coleta
           FROM full_shipments
          WHERE ml_account_id = ? AND substr(data_coleta, 1, 10) = ?
          ORDER BY data_coleta`,
      )
      .bind(mlAccountId, yyyymmdd)
      .all<any>();
    return results ?? [];
  }

  /** Resolve o id interno do envio a partir do inboundId (dentro da conta). */
  async getShipmentIdByInbound(
    mlAccountId: string,
    inboundId: number,
  ): Promise<string | null> {
    const row = await this.db
      .prepare(
        "SELECT id FROM full_shipments WHERE ml_account_id = ? AND inbound_id = ?",
      )
      .bind(mlAccountId, inboundId)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  // ---- collection_proofs (fotos de fechamento) --------------------------

  async saveCollectionProof(params: {
    shipmentId: string;
    mlAccountId: string;
    storageKey: string;
    contentType?: string;
    observacao?: string;
  }): Promise<string> {
    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO collection_proofs
           (id, shipment_id, ml_account_id, storage_key, content_type, observacao)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        params.shipmentId,
        params.mlAccountId,
        params.storageKey,
        params.contentType ?? null,
        params.observacao ?? null,
      )
      .run();
    return id;
  }

  async listCollectionProofs(shipmentId: string): Promise<
    Array<{
      id: string;
      storage_key: string;
      content_type: string | null;
      observacao: string | null;
      criado_em: string;
    }>
  > {
    const { results } = await this.db
      .prepare(
        `SELECT id, storage_key, content_type, observacao, criado_em
           FROM collection_proofs WHERE shipment_id = ? ORDER BY criado_em DESC`,
      )
      .bind(shipmentId)
      .all<any>();
    return results ?? [];
  }

  // ---- daily_auth_codes --------------------------------------------------

  async saveDailyAuthCode(params: {
    mlAccountId: string;
    shipmentId?: string | null;
    codigo: string;
    dataRef: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO daily_auth_codes (id, ml_account_id, shipment_id, codigo, data_ref)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (ml_account_id, data_ref)
         DO UPDATE SET codigo = excluded.codigo, obtido_em = datetime('now')`,
      )
      .bind(
        uuid(),
        params.mlAccountId,
        params.shipmentId ?? null,
        params.codigo,
        params.dataRef,
      )
      .run();
  }

  async getDailyAuthCode(
    mlAccountId: string,
    dataRef: string,
  ): Promise<{ codigo: string; obtido_em: string } | null> {
    return this.db
      .prepare(
        `SELECT codigo, obtido_em FROM daily_auth_codes
          WHERE ml_account_id = ? AND data_ref = ?`,
      )
      .bind(mlAccountId, dataRef)
      .first<{ codigo: string; obtido_em: string }>();
  }

  // ---- collection_details (Beta) ----------------------------------------

  async saveCollectionDetail(params: {
    shipmentId: string;
    horarioDe?: string | null;
    horarioAte?: string | null;
    motorista?: string | null;
    placa?: string | null;
    transportadora?: string | null;
    localColeta?: unknown;
    pickupStatus?: string | null;
    confiabilidade: "fresh" | "stale";
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO collection_details
           (id, shipment_id, horario_de, horario_ate, motorista, placa,
            transportadora, local_coleta, pickup_status, confiabilidade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (shipment_id) DO UPDATE SET
           horario_de = excluded.horario_de,
           horario_ate = excluded.horario_ate,
           motorista = excluded.motorista,
           placa = excluded.placa,
           transportadora = excluded.transportadora,
           local_coleta = excluded.local_coleta,
           pickup_status = excluded.pickup_status,
           confiabilidade = excluded.confiabilidade,
           atualizado_em = datetime('now')`,
      )
      .bind(
        uuid(),
        params.shipmentId,
        params.horarioDe ?? null,
        params.horarioAte ?? null,
        params.motorista ?? null,
        params.placa ?? null,
        params.transportadora ?? null,
        params.localColeta ? JSON.stringify(params.localColeta) : null,
        params.pickupStatus ?? null,
        params.confiabilidade,
      )
      .run();
  }

  // ---- collaborator_sessions (Beta) -------------------------------------

  async saveBetaSession(params: {
    mlAccountId: string;
    cookie: string;
    csrfToken?: string;
  }): Promise<void> {
    const enc = await encryptSecret(params.cookie, this.env.TOKEN_ENC_KEY);
    await this.db
      .prepare(
        `INSERT INTO collaborator_sessions
           (id, ml_account_id, cookie_criptografado, csrf_token,
            ultima_validacao_ok, status)
         VALUES (?, ?, ?, ?, datetime('now'), 'ativa')
         ON CONFLICT (ml_account_id) DO UPDATE SET
           cookie_criptografado = excluded.cookie_criptografado,
           csrf_token = excluded.csrf_token,
           ultima_validacao_ok = datetime('now'),
           status = 'ativa',
           atualizado_em = datetime('now')`,
      )
      .bind(uuid(), params.mlAccountId, enc, params.csrfToken ?? null)
      .run();
  }

  async getBetaSession(
    mlAccountId: string,
  ): Promise<{ cookie: string; csrfToken?: string } | null> {
    const row = await this.db
      .prepare(
        `SELECT cookie_criptografado, csrf_token FROM collaborator_sessions
          WHERE ml_account_id = ? AND status = 'ativa'`,
      )
      .bind(mlAccountId)
      .first<{ cookie_criptografado: string; csrf_token: string | null }>();
    if (!row) return null;
    const cookie = await decryptSecret(
      row.cookie_criptografado,
      this.env.TOKEN_ENC_KEY,
    );
    return { cookie, csrfToken: row.csrf_token ?? undefined };
  }

  async markBetaSessionInvalid(mlAccountId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE collaborator_sessions
            SET status = 'invalida', atualizado_em = datetime('now')
          WHERE ml_account_id = ?`,
      )
      .bind(mlAccountId)
      .run();
  }

  // ---- push_tokens -------------------------------------------------------

  async savePushToken(
    userId: string,
    expoToken: string,
    plataforma?: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO push_tokens (id, user_id, expo_token, plataforma)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, expo_token) DO NOTHING`,
      )
      .bind(uuid(), userId, expoToken, plataforma ?? null)
      .run();
  }
}
