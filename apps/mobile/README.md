# Coleta Full — App Mobile (Expo)

App React Native (Expo SDK 52) que consome a API do backend. Nunca fala direto
com o Mercado Livre: a autenticação é feita pelo broker OAuth do backend, e o
Módulo Beta fica inteiramente no servidor.

## Telas

- **Login** — dispara o OAuth do Mercado Livre num in-app browser; recebe o app
  session token via deep link `coletafull://auth`.
- **Home** — card do **código de autorização de hoje** fixado no topo (fonte
  grande, copiar, forçar atualização), seletor de conta ativa e a lista de
  envios Full do dia com pull-to-refresh.
- **Detalhe do envio** — dados do envio, documentos e fallback para abrir a
  página oficial.
- **Ajustes** — contas conectadas, conectar outra conta, sair.

## Rodando

```bash
npm install
npm start          # abre o Expo (pressione i / a para iOS / Android)
```

Aponte para o seu backend em `app.json` → `expo.extra.apiBaseUrl`
(padrão: `https://coleta-full-backend.workers.dev`). Para desenvolvimento local
com o Worker via `wrangler dev`, use o IP da sua máquina, ex.:
`http://192.168.0.10:8787` (o simulador não enxerga `localhost` do host).

## Estrutura

```
App.tsx                     raiz: gate de auth + navegação
index.ts                    registerRootComponent
src/
  api/
    client.ts               cliente HTTP tipado do backend
    types.ts                DTOs
  store/AppContext.tsx      sessão (SecureStore), conta ativa, ApiClient
  components/
    AuthCodeCard.tsx        card do código de autorização (destaque)
    ShipmentCard.tsx        card de envio
    AccountSelector.tsx     chips de conta ativa
    BetaBadge.tsx           selo/aviso de dado não-oficial
  screens/
    LoginScreen.tsx
    HomeScreen.tsx
    ShipmentDetailScreen.tsx
    SettingsScreen.tsx
  navigation/types.ts
  theme.ts
```

## Notas

- O token de sessão é guardado em `expo-secure-store` (Keychain / Keystore).
- Deep link scheme: `coletafull` (ver `app.json`).
- Notificações push (Expo) previstas no §4.4 — o registro do token já existe no
  backend (`POST /accounts/push-token`); o envio é fase seguinte.
