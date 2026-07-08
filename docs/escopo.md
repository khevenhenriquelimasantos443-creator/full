# Escopo Completo — App "Coleta Full" (Gestão de Envios Full Mercado Livre)

**Versão:** 1.0
**Data:** 03/07/2026
**Autor do produto:** Keven
**Tipo de produto:** App mobile nativo/híbrido, multi-conta, com ambição de virar SaaS B2B para sellers Mercado Livre

---

## 0. Resumo executivo

App mobile que centraliza, para uma ou várias contas de vendedor do Mercado Livre, os **envios Full do dia** (coletas de estoque agendadas para o Centro de Distribuição), trazendo em uma tela só: dados operacionais do envio, documentos fiscais oficiais da plataforma e o **código de autorização diário em destaque**, para agilizar a liberação do motorista na coleta. A visão de produto é começar como ferramenta interna (sua operação), validar, e depois abrir como produto multi-tenant para outros sellers.

---

## 1. Descoberta técnica crítica — leia isso antes de aprovar o escopo

Fiz um levantamento na documentação oficial de developers do Mercado Livre e, em seguida, uma inspeção manual (DevTools) na própria tela de "Detalhe do envio", que resultou numa descoberta concreta. Resumo:

| Dado que você quer | Existe API pública documentada? | Onde vive hoje |
|---|---|---|
| ID do envio, status, datas | ✅ Sim (`/shipments/{id}`) — mas focado em envios ME2 (venda ao comprador), não no fluxo de **coleta de estoque para o Full** | API REST oficial |
| Estoque / operações de fulfillment | ✅ Sim (`/stock/fulfillment/operations/search`) | API REST oficial |
| Nota Fiscal do pedido Full | ✅ Parcialmente — via `Get Order`, campo `embeddedInvoice` (XML) | API REST oficial |
| Lista de envios Full do dia (ID, nome, status, paginação) | ⚠️ Endpoint interno confirmado (não documentado publicamente), ver seção 1.1 | Web interno (sessão de cookie) |
| Volumes, horário estimado, motorista, placa, transportadora, endereço de coleta | ⚠️ **Confirmado via engenharia reversa** — todos vêm num único objeto JSON embutido na página de detalhe, ver seção 1.2 | Web interno (sessão de cookie) |
| **Código de autorização diário** | ⚠️ **Confirmado** — campo `handshakeToken` dentro do mesmo objeto JSON acima | Web interno (sessão de cookie) |
| Autorização de Entrada (AE) | Não localizado ainda nesse JSON — ver "Pendências" na seção 1.3 | A investigar |
| Romaneio da coleta | Enviado por **e-mail** ao vendedor após a coleta, não via API | E-mail |

### 1.1 Endpoint de listagem (Módulo Core / lista do dia)

Descoberto via inspeção de rede (aba Network → Fetch/XHR) na tela **Gestão de envios Full**:

```
GET https://myaccount.mercadolivre.com.br/api/shipping/inbounds/search
    ?query=&page={n}&status=&orders=&offset={n}&limit={n}
```

- **Autenticação:** cookie de sessão do navegador (`ssid`, `x-meli-session-id`) + header `x-csrf-token` — **não** usa o `Bearer` token OAuth da API pública (`api.mercadolibre.com`).
- **Domínio:** `myaccount.mercadolivre.com.br`, diferente do domínio da API pública de developers.
- Retorna a lista paginada de envios (inbounds), com filtro por status.

### 1.2 Endpoint de detalhe (Módulo Beta / motorista + código de autorização) — a descoberta principal

Ao contrário do que eu esperava, **não existe uma chamada XHR separada para o detalhe do envio**. A tela `myaccount.mercadolivre.com.br/shipping/inbounds/{inboundId}/details` é renderizada no servidor (o front-end interno do Mercado Livre usa um framework próprio chamado "Nordic", com SSR/hidratação) e **todos os dados já vêm embutidos no HTML da própria página**, dentro de uma tag:

```html
<script id="__NORDIC_RENDERING_CTX__">
  _n.ctx.r = { ..., appProps: { pageProps: { view: { data: { ... } } } } }
</script>
```

Dentro de `view.data`, a estrutura relevante (validada com dados reais em 08/07/2026) é:

```jsonc
{
  "inboundId": 71182418,
  "name": "TRUSS",                          // descrição do envio
  "status": "confirmed",
  "subStatus": "scheduled",
  "appointment": {
    "type": "pickup",
    "scheduledDate": "2026-07-08T18:00:00-03:00",
    "extendedAttributes": {
      "pickup": {
        "userAddress": {
          "streetName": "Avenida Ana Costa",
          "streetNumber": "34",
          "cityName": "Santos",
          "zip": "11060903"
        }
      }
    }
  },
  "logisticDetail": {
    "pickupStatus": "PENDING",
    "transportDetail": {
      "carrierName": "JM Transportes",        // transportadora
      "driverName": "Geovani Santos Silva",    // motorista
      "vehicleLicencePlate": "GIM6J64",        // placa
      "timeWindows": [{"from": "10:54", "to": "12:54"}]  // horário
    },
    "handshakeToken": "A8489FE6"               // ★ CÓDIGO DE AUTORIZAÇÃO ★
  },
  "units": [
    {
      "itemId": "MLB5599322256",
      "itemTitle": "Truss Equilibrium Scalp Kit Shampoo E Condicionador 300ml",
      "sku": "KT-TRUSS-0033",
      "declaredQuantity": 36
      // ... demais campos de produto
    }
  ],
  "warehouse": { "address": { /* endereço do CD de destino */ } }
}
```

**Isso é uma boa notícia técnica:** não precisamos de um navegador headless (Puppeteer/Playwright) renderizando a página inteira — basta uma requisição HTTP simples (com cookie de sessão válido) para essa URL, seguida de extração do conteúdo da tag `<script id="__NORDIC_RENDERING_CTX__">` via regex e parse do JSON. Isso é leve, rápido e barato de rodar em produção (ex: dentro de um Cloudflare Worker ou função serverless comum).

### 1.3 O que ainda falta confirmar

- **Autorização de Entrada (AE):** não identificado ainda dentro desse JSON — pode estar num campo não mapeado (ex: dentro de `fiscalDocumentEnabled` ou em outro endpoint associado a documentos). Precisa de uma segunda rodada de inspeção, dessa vez clicando especificamente em "Baixar autorização" (string encontrada nas traduções da página: `"Descargar autorización"` / `"Baixar autorização"`) e capturando a chamada de download.
- **Validade real do `handshakeToken`:** a documentação pública menciona 24h de validade — precisa confirmar empiricamente se esse campo no JSON muda de valor a cada dia ou por sessão.
- **Duração da sessão de cookie:** o cookie `_mldataSessionId` capturado tinha `Max-Age=1800` (30 minutos) — mas esse é só um cookie de telemetria, não necessariamente o que controla a sessão de autenticação real (`ssid`/`x-meli-session-id`). Precisa medir por quanto tempo a sessão de login efetivamente dura sem re-autenticação.

### O que isso significa na prática

1. **Módulo Core (ID, descrição, status, NF-e via API pública OAuth)** continua sendo a base sólida e vendável do produto — sem mudanças aqui.
2. **Módulo Beta agora tem um caminho técnico concreto e mais leve do que eu esperava**, mas continua sendo:
   - **Não-oficial / não documentado** — o Mercado Livre pode mudar essa estrutura de página a qualquer momento, sem aviso, e sem contrato de estabilidade.
   - **Autenticado por sessão de cookie, não por OAuth** — isso significa login programático mantido pelo backend, com necessidade de re-autenticação periódica, e uma zona cinzenta maior nos Termos de Uso do que o Módulo Core.
3. **Continua valendo a recomendação de investigar o Plano A** (contato oficial com o Mercado Livre Developers, ou avaliação de parceria com ERPs que já tenham acesso oficial) antes de escalar esse módulo para outros sellers — o valor dessa investigação não muda com a descoberta técnica, porque o risco aqui é contratual/jurídico, não técnico.

Isso muda o escopo abaixo: os dois módulos continuam separados de propósito, mas o Módulo Beta agora tem uma implementação de referência conhecida.

---

## 2. Objetivo do produto

Dar ao operador de e-commerce (você e, depois, outros sellers) uma visão mobile, rápida, do que precisa ser feito **hoje** para as coletas Full: quantos envios têm, que documentos precisam estar prontos, quem vai buscar, e — o dado mais crítico do dia a dia — o código de autorização, sem precisar abrir o site do Mercado Livre no computador ou procurar e-mail.

### Problema que resolve
Hoje esse fluxo é manual: entrar no site, navegar até Full, abrir cada envio, anotar/lembrar o código do dia, e ter as folhas fiscais em mãos na hora da coleta. Isso é lento, sujeito a erro humano (motorista chega e ninguém acha o código), e não escala para quem opera múltiplas contas/CNPJs.

### Público-alvo
- **Fase 1:** você mesmo, operação Bem Barato / SOFT UP, controlando envios Full de múltiplas contas de marketplace.
- **Fase 2:** sellers de médio porte com operação Full ativa que sofrem com o mesmo problema de coordenação de coleta.

---

## 3. Personas

| Persona | Necessidade principal |
|---|---|
| **Operador administrativo** (você, hoje) | Ver todos os envios do dia de várias contas, ter o código de autorização à mão sem procurar |
| **Responsável pelo despacho / recepção do motorista** | Precisa do código de autorização e da confirmação de volumes rapidamente, muitas vezes no celular, em pé, no depósito |
| **Gestor multi-conta / agência de gestão de marketplace** (público futuro do SaaS) | Gerencia Full de vários clientes/CNPJs, precisa trocar de conta rapidamente sem logout/login |

---

## 4. Escopo funcional

### 4.1 Módulo Core (100% API oficial Mercado Livre) — prioridade 1

**Tela: Envios Full de Hoje**
- Lista de todos os envios Full com data de coleta = hoje, para a conta ativa
- Cada card mostra:
  - ID do envio
  - Descrição do envio
  - Quantidade de volumes
  - Status atual (aguardando, em coleta, coletado, etc.)
- Pull-to-refresh + atualização automática a cada X minutos (configurável)
- Filtro por conta (quando multi-conta estiver ativo) e por status

**Tela: Detalhe do Envio**
- Todos os dados do card, mais:
  - Itens / SKUs incluídos no envio (via `/shipments/{id}/items` ou recurso equivalente de fulfillment)
  - **Folha(s) de envio direto da plataforma**: Nota Fiscal (XML/PDF vindo de `embeddedInvoice` do pedido) e, quando existir via API, Autorização de Entrada — renderizados como anexo/preview dentro do app, com opção de abrir/baixar/compartilhar (ex: enviar por WhatsApp para quem vai lidar com o motorista)
  - Botão "Compartilhar documentos" (gera PDF único com NF + AE para entregar impresso, se precisar)

### 4.2 Módulo Coleta (dados não-oficiais, sinalizado como Beta) — prioridade 2

**Tela: Coleta de Hoje (Beta)**
- Para os mesmos envios do dia, complementa com:
  - Horário estimado de chegada
  - Motorista / placa do veículo (quando disponível)
  - Local de coleta configurado
  - Transportadora responsável
- Aviso permanente no topo da tela: *"Dados obtidos de forma não-oficial da interface do Mercado Livre. Podem atrasar ou falhar se a plataforma mudar o layout."*
- Fallback: se a extração falhar, o app orienta a abrir o link direto da tela de detalhe no navegador

**Card "Código de Autorização de Hoje" — destaque máximo**
- Fixado no topo da Home (não dentro do detalhe de cada envio — o código vale para o dia, não por envio individual, então ele fica visível assim que o app abre)
- Fonte grande, alto contraste, com botão de copiar
- Contador visual de validade (24h) com alerta quando estiver perto de expirar/mudar
- Atualização automática + botão manual de "forçar atualização"
- Se o app tiver mais de uma conta ativa, mostra um código por conta, com abas ou seletor claro (o código é por conta/seller, não geral)

### 4.3 Módulo Multi-Conta — prioridade 1 (crítico para virar produto)

- Login via **OAuth2 oficial do Mercado Livre** (fluxo Authorization Code, não usuário/senha) — isso é obrigatório, é o único jeito suportado e seguro de autenticar
- Suporte a múltiplas contas ML vinculadas ao mesmo usuário do app (ex: você gerenciando 3 CNPJs diferentes)
- Seletor de conta ativa no topo do app, com troca rápida sem novo login
- Cada conta armazena seu próprio `access_token` / `refresh_token` de forma isolada e criptografada
- Estrutura já pensada para, no futuro, um usuário do app poder convidar/gerenciar contas de terceiros (modelo agência) — mas isso fica para fase 3, não é MVP

### 4.4 Notificações Push

- Notificação assim que o código de autorização do dia estiver disponível (geralmente de manhã)
- Notificação X minutos antes do horário estimado de chegada do motorista (módulo Beta, depende do dado estar disponível)
- Notificação se algum envio do dia mudar de status (ex: coleta cancelada, reagendada)

### 4.5 Configurações

- Gerenciar contas conectadas (adicionar/remover)
- Definir intervalo de atualização automática
- Ativar/desativar módulo Beta (coleta)
- Notificações: quais tipos, horário de silêncio

---

## 5. Arquitetura técnica proposta

Dado seu stack atual (Cloudflare Workers, D1/Supabase, React), a proposta segue a mesma linha para reaproveitar conhecimento e não fragmentar sua stack:

```
┌─────────────────────────────┐
│   App Mobile (React Native  │
│   via Expo)                 │
│   - iOS + Android            │
│   - Push notifications       │
│   - Secure storage (tokens)  │
└──────────────┬───────────────┘
               │ HTTPS/REST
┌──────────────▼───────────────┐
│  Backend (Cloudflare Workers) │
│  - OAuth2 broker ML (Core)    │
│  - Cache/normalização de dados│
│  - Scheduler (cron) p/ puxar  │
│    envios do dia por conta    │
│  - Módulo Beta isolado:       │
│    fetch autenticado por      │
│    cookie + parse do JSON     │
│    embutido no HTML (ver §1.2)│
│    Sem headless browser.      │
└──────────────┬───────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────┐      ┌──────────────┐
│ D1/Supabase│    │ Mercado Livre │
│ - contas   │    │ API oficial   │
│ - tokens   │    │ + sessão web  │
│ - cache de │    │ (módulo Beta) │
│   envios   │    └──────────────┘
└──────────┘
```

### Por que React Native/Expo
Reaproveita 100% do seu conhecimento em React, permite build para iOS e Android a partir da mesma base, e tem suporte maduro para push notifications, secure storage e OAuth in-app browser — tudo que esse app precisa.

### Por que o backend intermedia tudo (não é o app direto na API do ML)
1. **Segurança:** `client_secret` do app Mercado Livre nunca pode ficar no app mobile (engenharia reversa expõe a credencial). O fluxo OAuth precisa de um backend trocando o `code` pelo token.
2. **Multi-tenant:** quando você abrir para outros sellers, o backend é o único lugar que precisa saber lidar com múltiplas contas, rate limits, cache — o app mobile só consome uma API sua, normalizada.
3. **Isolamento do módulo Beta:** a parte "não-oficial" fica só no backend, nunca no app publicado nas lojas — reduz risco de a Apple/Google rejeitarem o app por comportamento não previsto, e facilita desligar essa função remotamente se necessário.

---

## 6. Modelo de dados (visão inicial)

```
users
 └─ id, nome, email, senha_hash (ou auth via provedor), criado_em

ml_accounts
 └─ id, user_id (FK), ml_user_id, nickname, access_token (cripto),
    refresh_token (cripto), token_expires_at, site_id (MLB),
    status (ativa/expirada), criado_em

full_shipments (cache local, populado por cron)
 └─ id, ml_account_id (FK), shipment_id, description, volumes,
    status, data_coleta, criado_em, atualizado_em

shipment_documents
 └─ id, shipment_id (FK), tipo (nota_fiscal | autorizacao_entrada),
    url_arquivo, obtido_em

collection_details (módulo Beta — campos mapeados do JSON real, ver §1.2)
 └─ id, shipment_id (FK),
    horario_de, horario_ate     (transportDetail.timeWindows)
    motorista                    (transportDetail.driverName)
    placa                        (transportDetail.vehicleLicencePlate)
    transportadora                (transportDetail.carrierName)
    local_coleta                 (appointment.extendedAttributes.pickup.userAddress)
    pickup_status                 (logisticDetail.pickupStatus)
    confiabilidade (fresh/stale), atualizado_em

daily_auth_codes (módulo Beta)
 └─ id, ml_account_id (FK), shipment_id (FK),
    codigo (logisticDetail.handshakeToken),
    obtido_em
    -- nota: validade declarada de 24h pela documentação do ML,
    -- ainda não confirmado empiricamente se o token é por envio
    -- ou por conta/dia — ver pendência §1.3

collaborator_sessions (módulo Beta — gestão da sessão não-oficial)
 └─ id, ml_account_id (FK), cookie_criptografado, csrf_token,
    ultima_validacao_ok, status (ativa/expirada/invalida),
    criado_em, atualizado_em

notification_log
 └─ id, user_id, tipo, enviado_em, lido
```

---

## 7. Segurança e compliance

- **Tokens:** `access_token`/`refresh_token` de cada conta ML (Módulo Core, OAuth) criptografados em repouso (D1/Supabase com coluna criptografada, ou uso do KV do Cloudflare com criptografia na aplicação)
- **Sessão do módulo Beta:** o cookie de sessão usado para autenticar contra `myaccount.mercadolivre.com.br` deve ser tratado com o mesmo nível de sigilo de uma senha — nunca logado em texto claro (nem em logs de erro, nem em ferramentas de observabilidade), nunca exposto ao app mobile diretamente. Só o backend guarda e usa essa sessão.
- **Conta dedicada para o Módulo Beta (recomendação forte):** em vez de usar seu login principal do Mercado Livre para manter essa sessão automatizada, crie um **usuário Colaborador** dentro de *Configurações → Colaboradores*, com o menor nível de permissão possível que ainda dê acesso à tela de Gestão de envios Full. Antes de apontar a automação pra essa conta, confirme manualmente quais telas esse colaborador realmente consegue acessar — o Mercado Livre pode não oferecer granularidade específica para essa seção, e isso só se descobre testando. Vantagens dessa separação:
  - Se a sessão vazar ou for comprometida, o dano fica limitado ao escopo do colaborador (não expõe faturamento, dados financeiros, configuração de anúncios, etc.)
  - Mantém o login principal (dono da conta) livre de sessão de longa duração mantida por automação
  - Facilita revogar o acesso de forma isolada (basta remover o colaborador) sem impactar o restante da operação
  - Esse padrão vale só para uso interno/pessoal (Fases 1 e 2) — não resolve o problema de acesso multi-tenant para outros sellers, que continua dependendo do Módulo Core (OAuth) como base do produto
- **LGPD:** como o app vai lidar com dados de terceiros (motorista, placa) quando for multi-tenant, é necessário ter política de privacidade clara e, futuramente, termo de uso para os sellers que conectarem suas contas
- **Escopos OAuth:** solicitar apenas os escopos mínimos necessários da API do Mercado Livre (leitura de shipments, orders — não pedir escopos de escrita/edição de anúncios, por exemplo)
- **Revisão de Termos de Uso do Mercado Livre e da Central de Desenvolvedores** antes de lançar o módulo Beta publicamente — isso é o maior risco jurídico do produto quando ele deixar de ser uso pessoal e virar oferta para terceiros
- **Gestão da sessão do Módulo Beta:** implementar um job que detecta expiração/invalidação da sessão (resposta 401/redirecionamento para login) e dispara alerta para reautenticação manual — não dá para assumir que a sessão dura indefinidamente (ver pendência sobre duração real na seção 1.3)

---

## 8. Fases de desenvolvimento

### Fase 1 — MVP interno (uso pessoal, 1 conta)
- Login OAuth com 1 conta Mercado Livre
- Lista de envios Full do dia (módulo Core)
- Detalhe do envio com NF-e
- Código de autorização em destaque (módulo Beta, validado manualmente contra a interface web para garantir confiabilidade)
- Push notification básica

**Critério de saída:** você usar por 2-3 semanas reais na operação e confirmar que os dados batem 100% com a tela do Mercado Livre, todo dia, sem falha.

### Fase 2 — Multi-conta (ainda uso interno/Bem Barato)
- Suporte a múltiplas contas ML na mesma instalação do app
- Seletor de conta, cache separado por conta
- Refinamento de UX baseado no uso real da Fase 1

### Fase 3 — Beta fechado com outros sellers
- Onboarding de conta de terceiros (fluxo OAuth deles, não o seu)
- Multi-tenant real no backend (isolamento de dados entre clientes)
- Política de privacidade, termos de uso
- Grupo pequeno (3-5 sellers) testando, coletando feedback

### Fase 4 — Produto (SaaS)
- Modelo de cobrança (ver seção 9)
- Onboarding self-service
- Suporte, monitoramento de erros do módulo Beta (alertas automáticos se a extração começar a falhar, para você não descobrir pelo cliente reclamando)
- App nas lojas (App Store / Google Play) com o módulo Beta bem sinalizado nos termos de uso do próprio app

---

## 9. Modelo de monetização (para quando abrir para outros sellers)

Algumas direções possíveis — vale decidir isso mais perto da Fase 3, mas já deixo mapeado:

- **Assinatura mensal por conta conectada** (ex: R$ X por CNPJ/conta ML ativa) — modelo mais simples e previsível
- **Assinatura por operador/usuário** com limite de contas incluídas, upsell para mais contas
- **Freemium:** módulo Core (API oficial) grátis ou barato, módulo Beta (código de autorização, motorista) como diferencial pago — isso também empurra o usuário a valorizar exatamente a parte mais arriscada tecnicamente, o que ajuda a justificar o investimento em mantê-la funcionando

---

## 10. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Mercado Livre muda a interface web e quebra o módulo Beta | Alto — código de autorização é o "destaque" do app | Isolar módulo Beta no backend, monitoramento automático, fallback para abrir a página oficial no navegador |
| Mercado Livre não permite oficialmente extração automatizada da interface (mesmo autenticado pelo próprio usuário) | Alto — risco de suspensão de conta do seller | Buscar contato oficial com Developers ML antes de escalar para outros sellers; ter o Core (100% API oficial) como produto viável isoladamente |
| Token OAuth expira e o app para de puxar dados sem avisar | Médio | Job de verificação de validade de token + notificação push "reconecte sua conta" |
| Multi-tenant expõe dados de uma conta para outra por bug de isolamento | Alto (segurança) | Testes automatizados de isolamento por `ml_account_id` em toda query, revisão de segurança antes da Fase 3 |
| App rejeitado nas lojas por comportamento de scraping | Médio | Deixar bem claro no fluxo que o usuário está autorizando acesso à própria conta dele; documentar isso na submissão para revisão da Apple/Google |

---

## 11. Métricas de sucesso

- **Fase 1:** zero divergência entre o que o app mostra e a tela oficial do Mercado Livre, em 100% dos dias testados
- **Fase 3:** tempo médio entre "código do dia disponível" e "operador consegue ver no app" < 2 minutos
- **Fase 4:** taxa de churn de sellers pagantes, número de contas conectadas ativas

---

## 12. Próximos passos recomendados

1. Validar tecnicamente o Plano A (contato com Mercado Livre Developers) antes de investir pesado no módulo Beta — isso pode mudar todo o resto do escopo
2. Criar a aplicação no [Central de Desenvolvedores do Mercado Livre](https://developers.mercadolivre.com.br) e configurar o fluxo OAuth para o módulo Core
3. Construir a Fase 1 (MVP interno) primeiro, sem multi-conta, para validar a hipótese central antes de investir em arquitetura multi-tenant
4. Documentar, durante o uso real da Fase 1, todo dado que só existe na tela e não na API — isso vira o backlog exato do módulo Beta
