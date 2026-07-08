/**
 * Parser do contexto de renderização "Nordic" do Mercado Livre (Módulo Beta).
 *
 * A tela `myaccount.mercadolivre.com.br/shipping/inbounds/{id}/details` é
 * renderizada no servidor: todos os dados do envio (incluindo motorista, placa,
 * transportadora e o `handshakeToken` — código de autorização) já vêm embutidos
 * no HTML, dentro de:
 *
 *     <script id="__NORDIC_RENDERING_CTX__">
 *       _n.ctx.r = { ..., appProps: { pageProps: { view: { data: { ... } } } } }
 *     </script>
 *
 * Este módulo NÃO faz rede — recebe o HTML e devolve a `view.data` normalizada.
 * Assim ele é puro, testável e barato (roda dentro do Worker, sem headless).
 *
 * ⚠️ Estrutura não-oficial e não documentada: o Mercado Livre pode mudá-la a
 * qualquer momento. O chamador deve tratar `NordicParseError` como sinal de
 * fallback (abrir a página oficial no navegador), não como erro fatal.
 */

import type {
  Address,
  CollectionDetail,
  NordicShipmentView,
  ShipmentItem,
} from "../types";

export class NordicParseError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "script_nao_encontrado"
      | "atribuicao_nao_encontrada"
      | "json_invalido"
      | "view_data_ausente",
  ) {
    super(message);
    this.name = "NordicParseError";
  }
}

/**
 * Extrai o conteúdo da tag `<script id="__NORDIC_RENDERING_CTX__">`.
 * Aceita atributos em qualquer ordem e aspas simples ou duplas.
 */
export function extractNordicScript(html: string): string {
  const re =
    /<script\b[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(html);
  if (!m) {
    throw new NordicParseError(
      "Tag <script id=__NORDIC_RENDERING_CTX__> não encontrada.",
      "script_nao_encontrado",
    );
  }
  return m[1];
}

/**
 * Dado o conteúdo do script, isola o objeto atribuído a `_n.ctx.r = {...}`
 * fazendo casamento balanceado de chaves (respeitando strings e escapes) e
 * faz o parse do JSON.
 */
export function parseNordicContext(scriptBody: string): unknown {
  // Localiza o início do objeto após a atribuição `_n.ctx.r =`.
  const assignRe = /_n\s*\.\s*ctx\s*\.\s*r\s*=\s*/;
  const m = assignRe.exec(scriptBody);
  if (!m) {
    throw new NordicParseError(
      "Atribuição `_n.ctx.r =` não encontrada no script.",
      "atribuicao_nao_encontrada",
    );
  }

  const start = scriptBody.indexOf("{", m.index + m[0].length);
  if (start === -1) {
    throw new NordicParseError(
      "Objeto `{` não encontrado após `_n.ctx.r =`.",
      "atribuicao_nao_encontrada",
    );
  }

  const objText = sliceBalancedObject(scriptBody, start);
  try {
    return JSON.parse(objText);
  } catch (e) {
    throw new NordicParseError(
      `JSON do contexto Nordic inválido: ${(e as Error).message}`,
      "json_invalido",
    );
  }
}

/**
 * Retorna o trecho `{ ... }` balanceado a partir de `openIndex`,
 * ignorando chaves que aparecem dentro de strings (aspas simples, duplas ou
 * template literals) e respeitando escapes com `\`.
 */
function sliceBalancedObject(src: string, openIndex: number): string {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }

  throw new NordicParseError(
    "Objeto do contexto Nordic não fechou (chaves desbalanceadas).",
    "json_invalido",
  );
}

/** Navega até `appProps.pageProps.view.data` no objeto de contexto. */
export function selectViewData(ctx: unknown): Record<string, unknown> {
  const data = (ctx as any)?.appProps?.pageProps?.view?.data;
  if (!data || typeof data !== "object") {
    throw new NordicParseError(
      "view.data ausente no contexto Nordic.",
      "view_data_ausente",
    );
  }
  return data as Record<string, unknown>;
}

/** Mapeia `view.data` (formato interno do ML) para o DTO normalizado. */
export function mapViewData(data: Record<string, unknown>): NordicShipmentView {
  const appointment = (data as any)?.appointment ?? {};
  const logistic = (data as any)?.logisticDetail ?? {};
  const transport = logistic?.transportDetail ?? {};
  const timeWindow = Array.isArray(transport?.timeWindows)
    ? transport.timeWindows[0]
    : undefined;

  const pickupAddress = mapAddress(
    appointment?.extendedAttributes?.pickup?.userAddress,
  );
  const warehouseAddress = mapAddress((data as any)?.warehouse?.address);

  const collection: CollectionDetail = {
    horarioDe: timeWindow?.from,
    horarioAte: timeWindow?.to,
    motorista: transport?.driverName,
    placa: transport?.vehicleLicencePlate,
    transportadora: transport?.carrierName,
    localColeta: pickupAddress,
    pickupStatus: logistic?.pickupStatus,
    handshakeToken: logistic?.handshakeToken,
    confiabilidade: "fresh",
  };

  return {
    inboundId: numberOrUndefined((data as any)?.inboundId),
    name: strOrUndefined((data as any)?.name),
    status: strOrUndefined((data as any)?.status),
    subStatus: strOrUndefined((data as any)?.subStatus),
    scheduledDate: strOrUndefined(appointment?.scheduledDate),
    pickupAddress,
    warehouseAddress,
    items: mapItems((data as any)?.units),
    collection,
  };
}

/**
 * Pipeline completo: HTML da página de detalhe → view normalizada.
 * Lança `NordicParseError` em qualquer etapa que falhar.
 */
export function parseNordicShipmentHtml(html: string): NordicShipmentView {
  const script = extractNordicScript(html);
  const ctx = parseNordicContext(script);
  const data = selectViewData(ctx);
  return mapViewData(data);
}

function mapItems(units: unknown): ShipmentItem[] {
  if (!Array.isArray(units)) return [];
  return units.map((u: any) => ({
    itemId: String(u?.itemId ?? ""),
    itemTitle: String(u?.itemTitle ?? ""),
    sku: strOrUndefined(u?.sku),
    declaredQuantity: Number(u?.declaredQuantity ?? 0),
  }));
}

function mapAddress(a: unknown): Address | undefined {
  if (!a || typeof a !== "object") return undefined;
  const addr = a as any;
  const out: Address = {
    streetName: strOrUndefined(addr.streetName),
    streetNumber: strOrUndefined(addr.streetNumber),
    cityName: strOrUndefined(addr.cityName),
    zip: strOrUndefined(addr.zip),
  };
  const hasAny = Object.values(out).some((v) => v !== undefined);
  return hasAny ? out : undefined;
}

function strOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
