/**
 * Lógica do popup: injeta o coletor na aba do Mercado Livre, mostra o código do
 * dia e os envios, e (se configurado) envia os dados para o backend do app.
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

function renderMessage(html) {
  body.innerHTML = `<div class="msg">${html}</div>`;
}

function renderNeedsMl() {
  renderMessage(
    `Abra a página de <b>Gestão de envios Full</b> do Mercado Livre (logado) e clique de novo.
     <button class="btn btn-primary" id="open">Abrir Gestão de envios Full</button>`,
  );
  document.getElementById("open").onclick = () =>
    chrome.tabs.create({ url: ML_URL });
}

function timeOf(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <div class="meta">ID ${s.inboundId}${
          s.volumes ? ` · ${s.volumes} volumes` : ""
        }${s.scheduledDate ? ` · ${timeOf(s.scheduledDate)}` : ""}</div>
        ${beta}
      </div>`;
    })
    .join("");

  body.innerHTML = `
    ${
      code
        ? `<div class="codecard">
             <div class="lab">Código de autorização de hoje</div>
             <div class="code" id="code">${esc(code)}</div>
             <div class="code-hint">clique para copiar</div>
           </div>`
        : `<div class="warn">Nenhum código de autorização encontrado nos envios de hoje.
             Ele costuma aparecer mais perto da coleta.</div>`
    }
    <div class="warn">Dados lidos da sua sessão do Mercado Livre (não-oficial). Podem
      falhar se a plataforma mudar o layout.</div>
    <div class="count">Envios de hoje (${ships.length})</div>
    ${cards || '<div class="msg">Nenhum envio encontrado.</div>'}
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
  const cfg = await chrome.storage.local.get([
    "backendUrl",
    "appToken",
    "accountId",
  ]);
  if (!cfg.backendUrl || !cfg.appToken || !cfg.accountId) {
    status.textContent = "Configure o app primeiro (botão Configurar).";
    chrome.runtime.openOptionsPage();
    return;
  }
  status.textContent = "Enviando…";
  try {
    const res = await fetch(
      `${cfg.backendUrl.replace(/\/$/, "")}/ingest/beta`,
      {
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
      },
    );
    status.textContent = res.ok
      ? "Enviado para o app ✓"
      : `Falha ao enviar (HTTP ${res.status}).`;
  } catch (e) {
    status.textContent = "Falha de rede ao enviar.";
  }
}

async function run() {
  body.innerHTML = `<div class="spinner"></div>`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/myaccount\.mercadolivre\.com\.br\//.test(tab.url || "")) {
    renderNeedsMl();
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectInPage,
      args: [{ limit: 50 }],
    });
    if (!result || !result.ok) {
      if (result && result.error === "sessao") {
        renderMessage(
          "Você não parece estar logado no Mercado Livre. Faça login e tente de novo.",
        );
      } else {
        renderMessage(
          `Não consegui ler os dados${
            result && result.status ? ` (HTTP ${result.status})` : ""
          }. Abra a tela de Gestão de envios Full e tente de novo.`,
        );
      }
      return;
    }
    render(result);
  } catch (e) {
    renderMessage("Erro ao ler a página. Recarregue a aba do Mercado Livre.");
  }
}

run();
