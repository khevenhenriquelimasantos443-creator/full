# Coleta Full

App para gestão dos **envios Full do Mercado Livre** do dia: centraliza, para uma
ou várias contas de vendedor, a lista de coletas agendadas para o Centro de
Distribuição, os documentos fiscais e — o dado mais crítico da operação — o
**código de autorização diário** (`handshakeToken`) em destaque, para agilizar a
liberação do motorista na coleta.

> Escopo completo do produto em [`docs/escopo.md`](docs/escopo.md).

## Arquitetura

```
┌─────────────────────────────┐
│  App Mobile (Expo / RN)     │   apps/mobile
│  - iOS + Android            │
│  - Card do código em foco   │
│  - Secure storage (sessão)  │
└──────────────┬──────────────┘
               │ HTTPS/REST
┌──────────────▼──────────────┐
│  Backend (Cloudflare Workers)│   apps/backend
│  - OAuth2 broker ML (Core)  │
│  - API oficial: shipments,  │
│    orders/NF-e              │
│  - Módulo Beta isolado:     │
│    fetch por cookie + parse │
│    do __NORDIC_RENDERING_CTX│
│  - Cron: puxa envios do dia │
└──────────────┬──────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────┐     ┌───────────────┐
│ D1 (SQL) │     │ Mercado Livre │
│ contas,  │     │ API oficial + │
│ envios,  │     │ sessão web    │
│ cache    │     │ (módulo Beta) │
└──────────┘     └───────────────┘
```

Dois módulos, separados de propósito:

- **Módulo Core** — 100% API oficial OAuth2 (`api.mercadolibre.com`). Lista de
  envios, status, itens, NF-e. É a base sólida e vendável do produto.
- **Módulo Beta** — dados que só existem na interface web interna
  (`myaccount.mercadolivre.com.br`): motorista, placa, transportadora, janela de
  horário e o `handshakeToken` (código de autorização). Autenticado por **sessão
  de cookie**, extraído da tag `<script id="__NORDIC_RENDERING_CTX__">` embutida
  no HTML. Não-oficial, isolado no backend, sinalizado como Beta.

## Estrutura do repositório

```
apps/
  backend/    Cloudflare Worker (Hono + D1) — API que o app consome
  mobile/     App Expo / React Native
docs/
  escopo.md   Escopo completo do produto (v1.0)
```

## Testar agora (modo demonstração) — um comando

Quer só **ver o app funcionando**, sem Mercado Livre, sem login, sem configurar
nada? Rode:

```bash
./start.sh
```

Ele instala tudo, sobe o backend com **dados de exemplo** e abre o app no
navegador. Quando abrir, clique em **"Entrar em modo demonstração"** — você verá
o código de autorização do dia (`A8489FE6`), a lista de envios (TRUSS, etc.),
duas contas para trocar e as telas de detalhe e ajustes. Para parar: `Ctrl+C`.

> Precisa só do Node.js 18+ instalado. Na primeira vez demora um pouco baixando
> as dependências.

Prefere no **celular**? Rode `./start.sh`, e no app rode `npm --workspace
apps/mobile run start` apontando `EXPO_PUBLIC_API_BASE_URL` para o IP da sua
máquina; abra no app **Expo Go**. (O modo web acima é o caminho mais rápido.)

## Conectar sua conta real do Mercado Livre

O modo demonstração usa dados fictícios. Para puxar seus envios de verdade, há
alguns passos únicos que só você pode fazer (são suas credenciais) — o passo a
passo está em [`apps/backend/README.md`](apps/backend/README.md): criar o app no
Central de Desenvolvedores do ML e, para o código de autorização (Módulo Beta),
fornecer a sessão da conta uma vez.

## Documentação por app

- Backend: [`apps/backend/README.md`](apps/backend/README.md)
- Mobile: [`apps/mobile/README.md`](apps/mobile/README.md)

## Estado atual (Fase 1 — MVP interno)

Implementado:

- Broker OAuth2 do Mercado Livre (Authorization Code + PKCE) no backend.
- Cliente da API oficial: envios Full do dia, detalhe, itens e NF-e
  (`embeddedInvoice`).
- Módulo Beta: fetch autenticado por cookie + parser do
  `__NORDIC_RENDERING_CTX__` com testes unitários sobre a estrutura real
  documentada no escopo (§1.2).
- Modelo de dados D1 (schema completo do §6).
- Criptografia de tokens/sessão em repouso (AES-GCM via WebCrypto).
- App Expo com as telas: Home (card do código + lista do dia), Detalhe do envio,
  Configurações e seletor de conta.

Ver o backlog por fase em [`docs/escopo.md`](docs/escopo.md) §8.
