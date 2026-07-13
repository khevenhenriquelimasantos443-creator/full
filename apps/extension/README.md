# Coleta Full — Extensão (Coletor)

Extensão de navegador (Chrome/Edge) que lê os **envios Full do dia** e o
**código de autorização** da sua conta do Mercado Livre — na sua própria sessão
já logada — e mostra num popup. Opcionalmente envia os dados para o backend do
app, para o celular ver os mesmos dados.

## Por que a extensão (em vez de sessão no servidor)

O dado do código de autorização não tem API oficial. Em vez de o backend manter
uma sessão de cookie e raspar o site (frágil e arriscado), a extensão roda **no
seu navegador logado**: os cookies são seus, o acesso é à sua própria tela.
Some o risco de sessão/conta; sobra só o risco de o Mercado Livre mudar o
layout (monitorável). A leitura reusa o mesmo parser validado do backend (§1.2).

```
Extensão (no seu Chrome, logado no ML)  →  popup mostra código + envios
        │  (opcional) "Enviar para o app"
        ▼
   Backend  →  App no celular
```

## Como instalar (uso próprio, sem loja)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `apps/extension`.
4. Fixe a extensão na barra (ícone de quebra-cabeça → alfinete).

## Como usar

1. Faça login no Mercado Livre e abra **Gestão de envios Full**
   (`myaccount.mercadolivre.com.br/shipping/inbounds`).
2. Clique no ícone da extensão. Ela lê os envios do dia e mostra o **código de
   autorização** em destaque, com motorista/placa/transportadora por envio.
3. **Copiar** o código: clique nele. **Atualizar**: recarrega os dados.

## Enviar para o app (opcional)

Só faz sentido depois de publicar o backend (ver `DEPLOY.md`).

1. Clique em **Configurar** no popup (ou botão direito → Opções).
2. Preencha:
   - **Endereço do backend** — a URL do seu Worker.
   - **Token de sessão do app** — gerado ao conectar sua conta no app.
   - **ID da conta** — o `accountId` da conta ML no app.
3. Salve. Agora o botão **Enviar para o app** manda os dados para o backend
   (endpoint `POST /ingest/beta`), e o celular passa a ver os mesmos envios e o
   código do dia.

## Permissões

- `host_permissions`: apenas `myaccount.mercadolivre.com.br` — a extensão não
  acessa nenhum outro site.
- `scripting`/`activeTab`: para ler a página **quando você clica** no ícone.
- `storage`: guarda só a configuração do backend (no seu navegador).

## Limitações conhecidas

- Desktop apenas (extensão de navegador). O celular vê os dados via app/backend.
- O `x-csrf-token` da listagem é buscado de algumas fontes da página; se a
  listagem falhar com 403, é aqui que ajustamos (é o ponto mais provável de
  precisar de um retoque após a 1ª inspeção real — ver escopo §1.3).
- Estrutura não-oficial: pode mudar sem aviso.
