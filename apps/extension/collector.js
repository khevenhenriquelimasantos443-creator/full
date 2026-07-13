/**
 * Função INJETADA na aba do Mercado Livre (chrome.scripting.executeScript).
 *
 * Precisa ser autossuficiente (sem imports/refs externas), pois o Chrome
 * serializa o código-fonte e roda dentro da página. Aqui reusamos a mesma
 * lógica do parser do backend (§1.2), mas rodando na SUA sessão logada — os
 * cookies são anexados automaticamente pelo navegador (credentials: include).
 *
 * Retorna { ok, code, dateRef, shipments[] } ou { ok:false, error }.
 */
async function collectInPage(opts) {
  const limit = (opts && opts.limit) || 50;
  const BASE = "https://myaccount.mercadolivre.com.br";

  // Extrai e faz o parse do contexto Nordic embutido no HTML (§1.2).
  function extractNordic(html) {
    const m =
      /<script\b[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
        html,
      );
    if (!m) return null;
    const body = m[1];
    const a = /_n\s*\.\s*ctx\s*\.\s*r\s*=\s*/.exec(body);
    if (!a) return null;
    const start = body.indexOf("{", a.index + a[0].length);
    if (start === -1) return null;
    let depth = 0,
      inStr = null,
      esc = false,
      end = -1;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) return null;
    try {
      return JSON.parse(body.slice(start, end));
    } catch (e) {
      return null;
    }
  }

  // Tenta obter o x-csrf-token de várias fontes possíveis da página.
  let csrf = "";
  const meta = document.querySelector(
    'meta[name="csrf-token"], meta[name="csrf_token"]',
  );
  if (meta) csrf = meta.getAttribute("content") || "";
  if (!csrf) {
    const mm = /"csrfToken"\s*:\s*"([^"]+)"/.exec(
      document.documentElement.innerHTML,
    );
    if (mm) csrf = mm[1];
  }

  const headers = { accept: "application/json" };
  if (csrf) headers["x-csrf-token"] = csrf;

  // 1) Lista de inbounds do dia (§1.1) — mesma sessão do navegador.
  let list = [];
  try {
    const url =
      `${BASE}/api/shipping/inbounds/search` +
      `?query=&page=1&status=&orders=&offset=0&limit=${limit}`;
    const res = await fetch(url, { headers, credentials: "include" });
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "sessao", status: res.status };
    if (!res.ok) return { ok: false, error: "http_list", status: res.status };
    const j = await res.json();
    const results =
      j.results || j.inbounds || (j.data && j.data.results) || [];
    list = results.map((r) => ({
      inboundId: Number(r.id ?? r.inboundId ?? r.inbound_id),
      name: r.name || r.description,
      status: r.status,
    }));
  } catch (e) {
    return { ok: false, error: "fetch_list", message: String(e) };
  }

  // 2) Detalhe de cada inbound → handshakeToken + dados de coleta (§1.2).
  const shipments = [];
  let code = null;
  for (const it of list) {
    if (!isFinite(it.inboundId)) continue;
    let view = null;
    try {
      const html = await (
        await fetch(`${BASE}/shipping/inbounds/${it.inboundId}/details`, {
          credentials: "include",
        })
      ).text();
      const ctx = extractNordic(html);
      view =
        ctx &&
        ctx.appProps &&
        ctx.appProps.pageProps &&
        ctx.appProps.pageProps.view &&
        ctx.appProps.pageProps.view.data;
    } catch (e) {
      /* segue para o próximo */
    }
    const log = (view && view.logisticDetail) || {};
    const tr = log.transportDetail || {};
    const tw = Array.isArray(tr.timeWindows) ? tr.timeWindows[0] : undefined;
    const appt = (view && view.appointment) || {};
    const units = (view && view.units) || [];
    const volumes = units.reduce(
      (s, u) => s + (Number(u.declaredQuantity) || 0),
      0,
    );
    const token = log.handshakeToken || null;
    if (token && !code) code = token;
    shipments.push({
      inboundId: it.inboundId,
      name: (view && view.name) || it.name || null,
      status: (view && view.status) || it.status || null,
      subStatus: (view && view.subStatus) || null,
      scheduledDate: appt.scheduledDate || null,
      volumes: volumes || null,
      transportadora: tr.carrierName || null,
      motorista: tr.driverName || null,
      placa: tr.vehicleLicencePlate || null,
      horarioDe: (tw && tw.from) || null,
      horarioAte: (tw && tw.to) || null,
      handshakeToken: token,
    });
  }

  const dateRef = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return { ok: true, code, dateRef, shipments };
}
