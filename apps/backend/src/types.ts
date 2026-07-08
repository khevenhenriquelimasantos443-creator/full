/**
 * Tipos compartilhados do backend.
 *
 * `Env` são os bindings/segredos do Worker (ver wrangler.toml e .dev.vars.example).
 * Os DTOs normalizados são o que o app mobile consome — o formato interno do
 * Mercado Livre (oficial ou Nordic) nunca vaza para o cliente.
 */

export interface Env {
  DB: D1Database;

  // Bucket R2 para as fotos de confirmação de fechamento da coleta (opcional:
  // se ausente, os endpoints de fotos respondem 501).
  PROOFS_BUCKET?: R2Bucket;

  // vars públicas
  ML_SITE_ID: string;
  ML_API_BASE: string;
  ML_WEB_BASE: string;
  ML_AUTH_BASE: string;
  APP_BASE_URL: string;

  // segredos
  ML_CLIENT_ID: string;
  ML_CLIENT_SECRET: string;
  ML_REDIRECT_URI: string;
  TOKEN_ENC_KEY: string;
  SESSION_JWT_SECRET: string;

  // "true" liga o modo demonstração (dados de exemplo, sem ML/OAuth/cookie).
  DEMO_MODE?: string;
}

/** Confiabilidade de um dado do Módulo Beta. */
export type Confiabilidade = "fresh" | "stale";

/** Endereço normalizado (coleta ou CD de destino). */
export interface Address {
  streetName?: string;
  streetNumber?: string;
  cityName?: string;
  zip?: string;
}

/** Item/SKU de um envio. */
export interface ShipmentItem {
  itemId: string;
  itemTitle: string;
  sku?: string;
  declaredQuantity: number;
}

/** Detalhe de coleta do Módulo Beta (mapeado do JSON Nordic, §1.2). */
export interface CollectionDetail {
  horarioDe?: string; // "10:54"
  horarioAte?: string; // "12:54"
  motorista?: string;
  placa?: string;
  transportadora?: string;
  localColeta?: Address;
  pickupStatus?: string;
  /** Código de autorização diário (handshakeToken). */
  handshakeToken?: string;
  confiabilidade: Confiabilidade;
}

/** DTO de envio Full normalizado, entregue ao app. */
export interface FullShipmentDTO {
  inboundId: number;
  description: string | null;
  status: string | null;
  subStatus: string | null;
  volumes: number | null;
  scheduledDate: string | null;
  pickupAddress?: Address;
  warehouseAddress?: Address;
  items: ShipmentItem[];
  /** Presente apenas quando o Módulo Beta está ativo e a extração teve sucesso. */
  collection?: CollectionDetail;
}

/** Resultado da extração do contexto Nordic (Módulo Beta). */
export interface NordicShipmentView {
  inboundId?: number;
  name?: string;
  status?: string;
  subStatus?: string;
  scheduledDate?: string;
  pickupAddress?: Address;
  warehouseAddress?: Address;
  items: ShipmentItem[];
  collection: CollectionDetail;
}
