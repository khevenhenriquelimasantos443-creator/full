/** Carrega e salva a configuração da extensão (chrome.storage.local). */

const fields = ["backendUrl", "appToken", "accountId"];

chrome.storage.local.get(fields).then((cfg) => {
  for (const f of fields) {
    const el = document.getElementById(f);
    if (cfg[f]) el.value = cfg[f];
  }
});

document.getElementById("save").onclick = async () => {
  const data = {};
  for (const f of fields) data[f] = document.getElementById(f).value.trim();
  await chrome.storage.local.set(data);
  const ok = document.getElementById("ok");
  ok.textContent = "Salvo ✓";
  setTimeout(() => (ok.textContent = ""), 1500);
};
