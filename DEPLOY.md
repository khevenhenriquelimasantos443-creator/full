# Colocar o Coleta Full pra funcionar (produção, dados reais)

O site de demonstração (GitHub Pages) usa dados fictícios. Para o app puxar seus
**envios Full reais**, é preciso subir o backend e ligá-lo à sua conta do
Mercado Livre. São 3 blocos — os dois primeiros só você pode fazer, porque
envolvem **suas credenciais**.

## Pré-requisitos (uma vez)

1. **Conta Cloudflare** (grátis): https://dash.cloudflare.com/sign-up
2. **Aplicação no Mercado Livre Developers**: https://developers.mercadolivre.com.br
   - Anote o **Client ID** e o **Client Secret**.
   - Em *Redirect URI*, coloque (ajuste o subdomínio depois do 1º deploy):
     `https://coleta-full-backend.SEU-SUBDOMINIO.workers.dev/auth/callback`

## Passo a passo (backend na Cloudflare)

```bash
cd apps/backend
npm install

# 1) Login na Cloudflare (abre o navegador uma vez)
npx wrangler login

# 2) Criar o banco e o bucket de fotos
npx wrangler d1 create coleta_full
#   → copie o "database_id" que aparecer e cole no wrangler.toml
npx wrangler r2 bucket create coleta-full-proofs
#   → descomente o bloco [[r2_buckets]] no wrangler.toml

# 3) Criar as tabelas no banco de produção
npm run db:apply:remote

# 4) Guardar os segredos (cada comando pede o valor e não fica no código)
npx wrangler secret put ML_CLIENT_ID
npx wrangler secret put ML_CLIENT_SECRET
npx wrangler secret put ML_REDIRECT_URI       # a URL /auth/callback acima
npx wrangler secret put TOKEN_ENC_KEY         # gere: openssl rand -base64 32
npx wrangler secret put SESSION_JWT_SECRET    # gere: openssl rand -hex 32

# 5) Publicar
npx wrangler deploy
#   → anote a URL final (ex.: https://coleta-full-backend.xxxx.workers.dev)
```

Depois do deploy: volte no Mercado Livre Developers e confirme que o *Redirect
URI* bate com a URL real do Worker (`.../auth/callback`).

> Deixe `DEMO_MODE` como `"false"` em produção (é o padrão no wrangler.toml).

## Ligar o app ao backend

- **App no celular (Expo):** em `apps/mobile/app.json`, ajuste
  `expo.extra.apiBaseUrl` para a URL do seu Worker. Rode `npm start` e use o
  **Expo Go**, ou gere um build com EAS para instalar sem depender do Expo Go.
- **Site web:** rode `EXPO_PUBLIC_API_BASE_URL="https://SUA-URL" npm run web`
  em `apps/mobile`, ou publique esse build no lugar da demo.

## Código de autorização e dados do motorista (Módulo Beta)

Esses dados não têm API oficial. Para ligá-los, é preciso fornecer ao backend a
**sessão web** de um usuário (idealmente um **Colaborador** de menor privilégio,
ver escopo §7), uma vez:

```bash
curl -X PUT "https://SUA-URL/accounts/SEU_ACCOUNT_ID/beta-session" \
  -H "Authorization: Bearer SEU_APP_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cookie":"ssid=...; x-meli-session-id=...","csrfToken":"..."}'
```

O cookie sai do DevTools do navegador logado no Mercado Livre (aba Network, em
requisições para `myaccount.mercadolivre.com.br`). Ele é guardado criptografado
e nunca é exposto ao app.

## Custos

- Cloudflare Workers + D1 + R2 têm camada gratuita generosa — para uma operação
  de poucas contas, tende a custar R$ 0.
- GitHub Pages (site de demonstração) é gratuito.

## Publicar nas lojas (App Store / Google Play)

É a última etapa (Fase 4 do escopo): gerar builds com **EAS Build**
(`npx eas build`), criar as fichas nas lojas e enviar para revisão. Requer conta
Apple Developer (US$ 99/ano) e Google Play (US$ 25 única vez).
