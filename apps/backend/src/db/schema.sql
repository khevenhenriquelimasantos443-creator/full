-- Modelo de dados do Coleta Full (escopo §6).
-- Compatível com Cloudflare D1 (SQLite).
-- Aplicar com: npm run db:apply:local  (ou :remote)

PRAGMA foreign_keys = ON;

-- Usuários do app (dono da instalação; multi-conta pendura contas ML aqui).
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- uuid
  nome         TEXT,
  email        TEXT UNIQUE NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contas Mercado Livre vinculadas (Módulo Core / OAuth2).
-- access_token e refresh_token são armazenados CRIPTOGRAFADOS (AES-GCM).
CREATE TABLE IF NOT EXISTS ml_accounts (
  id                TEXT PRIMARY KEY,        -- uuid
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ml_user_id        TEXT NOT NULL,           -- id do usuário no Mercado Livre
  nickname          TEXT,
  access_token_enc  TEXT,                    -- ciphertext base64
  refresh_token_enc TEXT,                    -- ciphertext base64
  token_expires_at  TEXT,                    -- ISO 8601
  site_id           TEXT NOT NULL DEFAULT 'MLB',
  status            TEXT NOT NULL DEFAULT 'ativa', -- ativa | expirada | revogada
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, ml_user_id)
);

-- Cache local dos envios Full, populado pelo cron (Módulo Core).
CREATE TABLE IF NOT EXISTS full_shipments (
  id             TEXT PRIMARY KEY,           -- uuid
  ml_account_id  TEXT NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  inbound_id     INTEGER NOT NULL,           -- inboundId do ML
  description    TEXT,                        -- "name" do envio
  volumes        INTEGER,
  status         TEXT,                        -- confirmed, ...
  sub_status     TEXT,
  data_coleta    TEXT,                        -- appointment.scheduledDate (ISO)
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ml_account_id, inbound_id)
);

CREATE INDEX IF NOT EXISTS idx_full_shipments_account_data
  ON full_shipments (ml_account_id, data_coleta);

-- Documentos fiscais do envio (NF-e via embeddedInvoice; AE quando existir).
CREATE TABLE IF NOT EXISTS shipment_documents (
  id           TEXT PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES full_shipments(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,                -- nota_fiscal | autorizacao_entrada
  formato      TEXT,                          -- xml | pdf
  url_arquivo  TEXT,                          -- URL ou chave no storage
  obtido_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Detalhes de coleta (Módulo Beta — campos mapeados do JSON real, §1.2).
CREATE TABLE IF NOT EXISTS collection_details (
  id             TEXT PRIMARY KEY,
  shipment_id    TEXT NOT NULL REFERENCES full_shipments(id) ON DELETE CASCADE,
  horario_de     TEXT,                        -- transportDetail.timeWindows[].from
  horario_ate    TEXT,                        -- transportDetail.timeWindows[].to
  motorista      TEXT,                        -- transportDetail.driverName
  placa          TEXT,                        -- transportDetail.vehicleLicencePlate
  transportadora TEXT,                        -- transportDetail.carrierName
  local_coleta   TEXT,                        -- appointment...userAddress (json)
  pickup_status  TEXT,                        -- logisticDetail.pickupStatus
  confiabilidade TEXT NOT NULL DEFAULT 'fresh', -- fresh | stale
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shipment_id)
);

-- Código de autorização diário (Módulo Beta).
-- Validade declarada de 24h pela doc do ML; ver pendência §1.3.
CREATE TABLE IF NOT EXISTS daily_auth_codes (
  id             TEXT PRIMARY KEY,
  ml_account_id  TEXT NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  shipment_id    TEXT REFERENCES full_shipments(id) ON DELETE SET NULL,
  codigo         TEXT NOT NULL,               -- logisticDetail.handshakeToken
  data_ref       TEXT NOT NULL,               -- YYYY-MM-DD a que o código se refere
  obtido_em      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ml_account_id, data_ref)
);

-- Sessão não-oficial do Módulo Beta (cookie de sessão web).
-- cookie_criptografado tratado com sigilo de senha — nunca logado em claro (§7).
CREATE TABLE IF NOT EXISTS collaborator_sessions (
  id                  TEXT PRIMARY KEY,
  ml_account_id       TEXT NOT NULL REFERENCES ml_accounts(id) ON DELETE CASCADE,
  cookie_criptografado TEXT NOT NULL,          -- ciphertext base64
  csrf_token          TEXT,
  ultima_validacao_ok TEXT,                    -- ISO 8601
  status              TEXT NOT NULL DEFAULT 'ativa', -- ativa | expirada | invalida
  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ml_account_id)
);

-- Log de notificações push.
CREATE TABLE IF NOT EXISTS notification_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,                   -- codigo_disponivel | motorista_chegando | status_mudou
  payload    TEXT,                            -- json
  enviado_em TEXT NOT NULL DEFAULT (datetime('now')),
  lido       INTEGER NOT NULL DEFAULT 0
);

-- Push tokens dos dispositivos (Expo push).
CREATE TABLE IF NOT EXISTS push_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_token  TEXT NOT NULL,
  plataforma  TEXT,                           -- ios | android
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, expo_token)
);
