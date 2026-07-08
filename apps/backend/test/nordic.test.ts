import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseNordicShipmentHtml,
  extractNordicScript,
  parseNordicContext,
  selectViewData,
  mapViewData,
  NordicParseError,
} from "../src/lib/nordic";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "fixtures", "nordic-detail.html"), "utf8");

describe("parser Nordic (Módulo Beta, §1.2)", () => {
  it("extrai o handshakeToken — o código de autorização do dia", () => {
    const view = parseNordicShipmentHtml(html);
    expect(view.collection.handshakeToken).toBe("A8489FE6");
  });

  it("mapeia motorista, placa, transportadora e janela de horário", () => {
    const view = parseNordicShipmentHtml(html);
    expect(view.collection.motorista).toBe("Geovani Santos Silva");
    expect(view.collection.placa).toBe("GIM6J64");
    expect(view.collection.transportadora).toBe("JM Transportes");
    expect(view.collection.horarioDe).toBe("10:54");
    expect(view.collection.horarioAte).toBe("12:54");
    expect(view.collection.pickupStatus).toBe("PENDING");
    expect(view.collection.confiabilidade).toBe("fresh");
  });

  it("mapeia identificação e status do envio", () => {
    const view = parseNordicShipmentHtml(html);
    expect(view.inboundId).toBe(71182418);
    expect(view.name).toBe("TRUSS");
    expect(view.status).toBe("confirmed");
    expect(view.subStatus).toBe("scheduled");
    expect(view.scheduledDate).toBe("2026-07-08T18:00:00-03:00");
  });

  it("mapeia o endereço de coleta", () => {
    const view = parseNordicShipmentHtml(html);
    expect(view.pickupAddress).toEqual({
      streetName: "Avenida Ana Costa",
      streetNumber: "34",
      cityName: "Santos",
      zip: "11060903",
    });
  });

  it("mapeia os itens/SKUs do envio", () => {
    const view = parseNordicShipmentHtml(html);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toEqual({
      itemId: "MLB5599322256",
      itemTitle:
        "Truss Equilibrium Scalp Kit Shampoo E Condicionador 300ml",
      sku: "KT-TRUSS-0033",
      declaredQuantity: 36,
    });
  });

  it("não confunde outras tags <script> com o contexto Nordic", () => {
    const script = extractNordicScript(html);
    expect(script).toContain("_n.ctx.r");
    expect(script).not.toContain("__something_else");
  });

  it("respeita chaves dentro de strings ao balancear o objeto", () => {
    const body = `_n.ctx.r = {"appProps":{"pageProps":{"view":{"data":{"name":"A } B { C","units":[]}}}}}};extra();`;
    const ctx = parseNordicContext(body);
    const data = selectViewData(ctx);
    const view = mapViewData(data);
    expect(view.name).toBe("A } B { C");
  });
});

describe("falhas do parser sinalizam fallback, não erro fatal", () => {
  it("lança NordicParseError quando a tag não existe", () => {
    expect(() => parseNordicShipmentHtml("<html><body>nada</body></html>"))
      .toThrowError(NordicParseError);
  });

  it("expõe o motivo da falha para o chamador decidir o fallback", () => {
    try {
      parseNordicShipmentHtml("<html></html>");
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(NordicParseError);
      expect((e as NordicParseError).reason).toBe("script_nao_encontrado");
    }
  });

  it("detecta JSON malformado dentro do contexto", () => {
    const bad = `<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r = {oops:,};</script>`;
    try {
      parseNordicShipmentHtml(bad);
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect((e as NordicParseError).reason).toBe("json_invalido");
    }
  });
});
