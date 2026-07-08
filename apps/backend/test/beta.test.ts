import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  listInbounds,
  getInboundDetail,
  BetaUnavailableError,
  type BetaSession,
} from "../src/services/beta";
import type { Env } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const detailHtml = readFileSync(
  join(here, "fixtures", "nordic-detail.html"),
  "utf8",
);

const env = { ML_WEB_BASE: "https://myaccount.mercadolivre.com.br" } as Env;
const session: BetaSession = { cookie: "ssid=abc; x-meli-session-id=def", csrfToken: "t" };

function mockFetchOnce(body: string, init: ResponseInit = { status: 200 }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, init)),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Módulo Beta — pipeline HTTP + parse", () => {
  it("extrai o detalhe do envio (incl. código) a partir do HTML SSR", async () => {
    mockFetchOnce(detailHtml);
    const view = await getInboundDetail(env, session, 71182418);
    expect(view.collection.handshakeToken).toBe("A8489FE6");
    expect(view.collection.motorista).toBe("Geovani Santos Silva");
    expect(view.name).toBe("TRUSS");
  });

  it("envia cookie e csrf-token nos headers", async () => {
    const spy = vi.fn(
      async (_url: string, _opts: RequestInit) =>
        new Response(detailHtml, { status: 200 }),
    );
    vi.stubGlobal("fetch", spy);
    await getInboundDetail(env, session, 71182418);
    const opts = spy.mock.calls[0][1];
    const headers = opts.headers as Record<string, string>;
    expect(headers.cookie).toContain("ssid=abc");
    expect(headers["x-csrf-token"]).toBe("t");
  });

  it("lista inbounds a partir do endpoint interno", async () => {
    mockFetchOnce(
      JSON.stringify({
        results: [{ id: 71182418, name: "TRUSS", status: "confirmed" }],
      }),
    );
    const list = await listInbounds(env, session);
    expect(list).toEqual([
      { inboundId: 71182418, name: "TRUSS", status: "confirmed" },
    ]);
  });

  it("sinaliza sessão inválida em 401 (para reautenticação)", async () => {
    mockFetchOnce("", { status: 401 });
    await expect(getInboundDetail(env, session, 1)).rejects.toMatchObject({
      name: "BetaUnavailableError",
      kind: "sessao_invalida",
    });
  });

  it("sinaliza indisponibilidade em erro HTTP genérico", async () => {
    mockFetchOnce("erro", { status: 500 });
    try {
      await listInbounds(env, session);
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(BetaUnavailableError);
      expect((e as BetaUnavailableError).kind).toBe("http");
    }
  });
});
