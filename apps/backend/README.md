# Coleta Full — Backend (Cloudflare Workers)

API que o app consome. Concentra toda a integração com o Mercado Livre:

- **Módulo Core** (`src/services/mercadolibre.ts`) — API oficial OAuth2:
  troca/refresh de token, dados do usuário, operações de fulfillment e a NF-e do
  pedido (`embeddedInvoice`).
- **Módulo Beta** (`src/services/beta.ts` + `src/lib/nordic.ts`) — dados
  não-oficiais da interface web, autenticados por **cookie de sessão**:
  listagem de inbounds (§1.1) e o detalhe do envio extraído da tag
  `<script id="__NORDIC_RENDERING_CTX__">` (§1.2), de onde sai o
  `handshakeToken` (código de autorização). Isolado no backend; o cookie nunca
  chega ao app.

## Stack

Hono (roteamento) sobre Cloudflare Workers, D1 (SQLite) como banco, WebCrypto
para criptografia de tokens/sessão em repouso. Sem headless browser.

## Setup

```bash
npm install

# 1. Crie o D1 e cole o database_id no wrangler.toml
npx wrangler d1 create coleta_full

# 2. Aplique o schema
npm run db:apply:local     # local (miniflare)
npm run db:apply:remote    # produção

# 3. Segredos (produção)
npx wrangler secret put ML_CLIENT_ID
npx wrangler secret put ML_CLIENT_SECRET
npx wrangler secret put ML_REDIRECT_URI
npx wrangler secret put TOKEN_ENC_KEY       # openssl rand -base64 32
npx wrangler secret put SESSION_JWT_SECRET

# Para desenvolvimento local, copie .dev.vars.example → .dev.vars

npm run dev        # sobe o Worker em http://localhost:8787
npm test           # testes (parser Nordic, crypto, pipeline Beta)
npm run typecheck
```

## Endpoints

Autenticação do app: header `Authorization: Bearer <app session token>` (emitido
no callback OAuth). `accountId` sempre é validado contra o usuário logado
(isolamento multi-tenant).

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/health` | Healthcheck |
| GET  | `/auth/ml/start?email=` | Inicia OAuth (redireciona ao ML) |
| GET  | `/auth/callback` | Callback OAuth → deep link com session token |
| GET  | `/accounts` | Lista contas ML do usuário |
| DELETE | `/accounts/:id` | Remove conta |
| POST | `/accounts/push-token` | Registra push token (Expo) |
| PUT  | `/accounts/:id/beta-session` | Configura cookie de sessão do Beta |
| GET  | `/shipments?accountId=&date=` | Envios Full do dia (cache) |
| POST | `/shipments/refresh?accountId=` | Força coleta imediata |
| GET  | `/shipments/invoice?accountId=&orderId=` | NF-e (XML) via API oficial |
| GET  | `/beta/auth-code?accountId=&date=&refresh=` | Código de autorização do dia |

## Cron

`wrangler.toml` agenda uma coleta a cada 15 min entre 6h e 20h. O handler
`scheduled` percorre todas as contas ativas e chama `collectAccount`, que puxa os
envios do dia e captura o `handshakeToken` assim que aparece (§4.4).

## Segurança (§7)

- `access_token` / `refresh_token` e o cookie do Beta são cifrados com AES-GCM
  (`src/lib/crypto.ts`) antes de irem ao D1.
- Nada de segredo em log (o `onError` loga só nome/mensagem do erro).
- Recomenda-se usuário **Colaborador** de menor privilégio para a sessão do Beta.
- Sessão do Beta que retorna 401/redirect para login é marcada como inválida
  para disparar reautenticação.

## Limites conhecidos (do escopo §1.3)

- Mapeamento envio→pedido para a NF-e ainda depende do `orderId` (a captura via
  fulfillment/orders é o próximo passo).
- Autorização de Entrada (AE) ainda não localizada no JSON Nordic.
- Duração real da sessão de cookie e comportamento do `handshakeToken`
  (por envio vs. por dia) a confirmar empiricamente.
