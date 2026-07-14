/**
 * Lógica do popup: injeta o coletor na aba do Mercado Livre, mostra o código do
 * dia e os envios, e (se configurado) envia os dados ao backend do app.
 * Nunca fica girando em silêncio: tem tempo-limite e mensagens claras.
 */

const ML_URL = "https://myaccount.mercadolivre.com.br/shipping/inbounds";
const body = document.getElementById("body");
document.getElementById("cfg").onclick = () => chrome.runtime.openOptionsPage();

let lastData = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
function loading(text) {
  body.innerHTML = `<div class="spinner"></div><div class="status">${esc(text)}</div>`;
}
function renderMessage(html) {
  body.innerHTML = `<div class="msg">${html}</div>`;
}
function renderNeedsMl() {
  renderMessage(
    `Abra a página de <b>Gestão de envios Full</b> do Mercado Livre (logado) e clique de novo.
     <button class="btn btn-primary" id="open">Abrir Gestão de envios Full</button>
     <button class="btn btn-ghost" id="retry">Já estou nela — tentar de novo</button>`,
  );
  document.getElementById("open").onclick = () => chrome.tabs.create({ url: ML_URL });
  document.getElementById("retry").onclick = run;
}
function renderError(text) {
  renderMessage(
    `${esc(text)}<button class="btn btn-ghost" id="retry">Tentar de novo</button>`,
  );
  document.getElementById("retry").onclick = run;
}
function timeOf(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function render(data) {
  lastData = data;
  const code = data.code;
  const ships = data.shipments || [];
  const cards = ships
    .map((s) => {
      const beta =
        s.motorista || s.placa || s.transportadora
          ? `<div class="beta">🚚 ${esc(s.transportadora || "—")} · ${esc(
              s.motorista || "—",
            )} · ${esc(s.placa || "—")}${
              s.horarioDe ? ` · ${esc(s.horarioDe)}–${esc(s.horarioAte)}` : ""
            }</div>`
          : "";
      return `
      <div class="ship">
        <div class="row"><span class="name">${esc(s.name || "Envio " + s.inboundId)}</span>
          <span class="pill">${esc(s.status || "—")}</span></div>
        <div class="meta">ID ${s.inboundId}${s.volumes ? ` · ${s.volumes} volumes` : ""}${
          s.scheduledDate ? ` · ${timeOf(s.scheduledDate)}` : ""
        }</div>
        ${beta}
      </div>`;
    })
    .join("");

  const parcial =
    data.total && data.lidos && data.total > data.lidos
      ? `<div class="status">Mostrando ${data.lidos} de ${data.total} envios.</div>`
      : "";

  body.innerHTML = `
    ${
      code
        ? `<div class="codecard">
             <div class="lab">Código de autorização de hoje</div>
             <div class="code" id="code">${esc(code)}</div>
             <div class="code-hint">clique para copiar</div>
           </div>`
        : `<div class="warn">Nenhum código de autorização encontrado hoje. Ele costuma
             aparecer mais perto da coleta — tente de novo mais tarde.</div>`
    }
    <div class="warn">Dados lidos da sua sessão do Mercado Livre (não-oficial).</div>
    <div class="count">Envios de hoje (${ships.length})</div>
    ${cards || '<div class="msg">Nenhum envio encontrado.</div>'}
    ${parcial}
    <button class="btn btn-primary" id="send">Enviar para o app</button>
    <button class="btn btn-ghost" id="refresh">Atualizar</button>
    <div class="status" id="status"></div>`;

  const codeEl = document.getElementById("code");
  if (codeEl)
    codeEl.onclick = () => {
      navigator.clipboard.writeText(code).catch(() => {});
      document.getElementById("status").textContent = "Código copiado ✓";
    };
  document.getElementById("refresh").onclick = run;
  document.getElementById("send").onclick = sendToApp;
}

async function sendToApp() {
  const status = document.getElementById("status");
  const cfg = await chrome.storage.local.get(["backendUrl", "appToken", "accountId"]);
  if (!cfg.backendUrl || !cfg.appToken || !cfg.accountId) {
    status.textContent = "Configure o app primeiro (botão Configurar).";
    chrome.runtime.openOptionsPage();
    return;
  }
  status.textContent = "Enviando…";
  try {
    const res = await fetch(`${cfg.backendUrl.replace(/\/$/, "")}/ingest/beta`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.appToken}`,
      },
      body: JSON.stringify({
        accountId: cfg.accountId,
        dateRef: lastData.dateRef,
        code: lastData.code,
        shipments: lastData.shipments,
      }),
    });
    status.textContent = res.ok ? "Enviado para o app ✓" : `Falha ao enviar (HTTP ${res.status}).`;
  } catch (e) {
    status.textContent = "Falha de rede ao enviar.";
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function run() {
  loading("Lendo sua conta do Mercado Livre…");

  if (!chrome.scripting) {
    renderError("A extensão está sem permissão de leitura. Remova e carregue de novo a pasta apps/extension.");
    return;
  }

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    renderError("Não consegui identificar a aba atual.");
    return;
  }
  if (!tab || !tab.id) {
    renderNeedsMl();
    return;
  }

  try {
    const res = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectInPage,
        args: [{ limit: 50, maxDetails: 30 }],
      }),
      35000,
    );
    const result = res && res[0] && res[0].result;

    if (!result) {
      renderNeedsMl();
      return;
    }
    if (result.ok) {
      render(result);
      return;
    }
    switch (result.error) {
      case "nao_ml":
        renderNeedsMl();
        break;
      case "sessao":
        renderError("Você não parece estar logado no Mercado Livre. Faça login e tente de novo.");
        break;
      case "http_list":
        renderError(
          `A listagem de envios respondeu HTTP ${result.status}. Se for 403, é o ponto do csrf-token — me avise que eu ajusto.`,
        );
        break;
      case "fetch_list":
        renderError("Não consegui buscar a lista de envios. Recarregue a página do Mercado Livre e tente de novo.");
        break;
      default:
        renderError(`Não consegui ler os dados (${esc(result.error)}${result.message ? ": " + esc(result.message) : ""}).`);
    }
  } catch (e) {
    if (String(e && e.message).includes("timeout")) {
      renderError("Demorou demais para responder. Recarregue a aba do Mercado Livre e tente de novo.");
    } else if (String(e && e.message).toLowerCase().includes("cannot access")) {
      renderNeedsMl();
    } else {
      renderError("Erro ao ler a página. Abra a tela de Gestão de envios Full e tente de novo.");
    }
  }
}

run();
