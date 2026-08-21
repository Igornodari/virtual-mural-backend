# Plano de Desenvolvimento — Mural Virtual

> Consolidação de todas as fontes de trabalho pendente em um plano único.
> Gerado em 21/08/2026 a partir da leitura do código na branch `master`.

## Fontes consolidadas

| Fonte | Data | O que trouxe |
|---|---|---|
| `BACKLOG.md` do projeto | 08/06/2026 | Itens L1–L4, B2–B13, SEC1, OBS1, M6 |
| `analiselancamento.md` | 19/05/2026 | Bloqueadores de lançamento e conformidade LGPD |
| `RESPONSIVEAUDIT.md` | 08/06/2026 | Responsividade e UX por tela |
| Auditoria de código | 19/08/2026 | BL-01 a BL-18 (segurança, dinheiro, multi-tenancy) |

Este documento **substitui** os quatro como fonte de verdade. Cada item carrega
sua origem entre colchetes.

---

## Itens fechados na consolidação

Verificados no código e **já resolvidos** — saem do backlog:

| Item | Origem | Como está hoje |
|---|---|---|
| Colunas de onboarding sem migration | B3 | `EnsureUserOnboardingColumns` e `EnsureUserMissingColumns` existem |
| CSP bloqueando Google Fonts | B6 | `vercel.json` libera `fonts.googleapis.com` e `fonts.gstatic.com` |
| Documentar arquitetura | L4 | `docs/*.html` no repositório do frontend, atualizados |
| Aceite de termos, páginas legais, `termsAcceptedAt` | B1 (mai/26) | Implementado |
| Stripe live | B2 (mai/26) | `pk_live` em produção, split validado |
| `DB_SYNC` default `false` | B3 (mai/26) | Confirmado em `app.module.ts:48` |
| PWA manifest, meta tags iOS, spinner inline | A1, A2, M1 | Implementados |
| Página 404 | A5 | `features/pages/not-found` |
| VAPID em produção | A3 | Configurado |
| Double-booking de horário | B5 (parcial) | Resolvido com transação + trava pessimista |

---

## Achados novos desta consolidação

Não estavam em nenhuma das listas anteriores:

| ID | Achado | Onde |
|---|---|---|
| **N-01** | `hasAppointmentDateTimePassed` existe e é usada por availability e status, mas **o serviço de criação não a importa** — dá para criar agendamento com data no passado | `appointment-creation.service.ts:16` |
| **N-02** | A CSP está em `Content-Security-Policy-Report-Only` — ela **relata mas não bloqueia** nada | `vercel.json` |
| **N-03** | `Permissions-Policy: camera=()` bloqueia a câmera — vai colidir com a foto do comprovante da verificação de morador | `vercel.json` |
| **N-04** | `CONTRIBUTING.md` recomendava prefixos de branch que a CI rejeita | corrigido nesta sessão |
| **N-05** | `CI-CD-SETUP.md` documentava deploy em S3/CloudFront que nunca existiu | corrigido nesta sessão |

---

## Ondas

As ondas são sequenciais: cada uma destrava a seguinte. Dentro de uma onda os
itens podem ser paralelos, salvo dependência anotada.

### 🌊 Onda 0 — Fundação de confiança

**Objetivo:** parar o vazamento de dados e fazer a avaliação significar algo.
Nada aqui é funcionalidade nova; é fechar o que está aberto.

| ID | Item | Origem | Esforço | Dependência |
|---|---|---|---|---|
| P0-1 | Isolar dados por condomínio nas rotas de serviço, agendamento e avaliação | BL-01 | 2-3 d | — |
| P0-2 | Criar papel de administrador e proteger o CRUD de condomínio | BL-02 | 3-5 d | — |
| P0-3 | Avaliação exige agendamento concluído do próprio autor | BL-04 | 1-2 d | — |
| P0-4 | Bloquear criação de agendamento com data no passado | N-01 | 2 h | — |
| P0-5 | Idempotência no webhook do Stripe por `event.id` | BL-08 | 1 d | — |
| P0-6 | Religar o Sentry no frontend | BL-09 / OBS1 | 2 h | — |
| P0-7 | Remover a criptografia decorativa do navegador | BL-16 | 2 h | — |
| P0-8 | Remover `console.log` de produção | B4 | 15 min | — |
| P0-9 | Rotacionar a senha do RabbitMQ (credencial vazou em log) | SEC1 | 2 h | — |

**Pronto quando:** um usuário do condomínio A não consegue ler nem escrever nada
do condomínio B por nenhuma rota; avaliação sem agendamento concluído responde 403;
erro no frontend em produção aparece no Sentry.

### 🌊 Onda 1 — Integridade do dinheiro

**Objetivo:** existir caminho de volta para o dinheiro e a comissão virar margem.

| ID | Item | Origem | Esforço | Dependência |
|---|---|---|---|---|
| P1-1 | Estorno e política de cancelamento | BL-03 | 1 sem | — |
| P1-2 | Unificar a taxa da plataforma numa única fonte de configuração | BL-06 / B2 | 1 d | — |
| P1-3 | Decidir e implementar o modelo de cobrança (direta vs. destino) ou incentivo ao Pix | BL-06 | 3-5 d | P1-2 |
| P1-4 | Tratar o saldo do prestador sem conta Connect | BL-07 | 2-3 d | — |
| P1-5 | Canal de denúncia e moderação de conteúdo | BL-11 | 3-4 d | P0-2 |

**Pronto quando:** um agendamento pago pode ser cancelado com devolução rastreável;
a comissão efetiva da plataforma é conhecida e configurável num lugar só.

### 🌊 Onda 2 — Verificação de morador

**Objetivo:** transformar a premissa do produto em fato verificável.
Especificação completa em `.spec/features/verificacao-morador/`.

| ID | Item | Origem | Esforço | Dependência |
|---|---|---|---|---|
| P2-1 | Limpar e curar a base de condomínios (deduplicar; parar de adotar o primeiro CEP) | BL-10 | 3-5 d | — |
| P2-2 | Adicionar número da unidade ao cadastro | BL-05 / T-001 | 1 d | — |
| P2-3 | Verificação — Fase 1: envio, revisão manual, descarte | BL-05 | 2-3 sem | P2-1, P2-2, P0-1 |
| P2-4 | Liberar a câmera na `Permissions-Policy` | N-03 | 15 min | — |
| P2-5 | Verificação — Fase 2: OCR e comparação automática | BL-17 | 2 sem | P2-3 |

**Pronto quando:** o app consegue afirmar com honestidade que o morador foi verificado.

### 🌊 Onda 3 — Receita e distribuição

| ID | Item | Origem | Esforço | Dependência |
|---|---|---|---|---|
| P3-1 | Destaque pago para prestador | BL-12 | 1 sem | P1-2 |
| P3-2 | Service worker de cache e app instalável | BL-13 | 2-3 d | — |
| P3-3 | Publicar como TWA na Play Store | BL-14 | 3-5 d | P3-2, P1-1 |
| P3-4 | Plano do condomínio (B2B) | BL-18 | 3-4 sem | P0-2, P2-3 |

**Pronto quando:** existe receita recorrente que não depende da comissão por serviço.

### 🌊 Onda 4 — Qualidade, UX e dívida

Pode correr em paralelo às demais; não bloqueia nada.

| ID | Item | Origem | Esforço |
|---|---|---|---|
| P4-1 | Tokens e mixins de breakpoint; convergir os valores órfãos | RESPONSIVE F0 | 2-3 d |
| P4-2 | Responsividade do funil: explorar → detalhe → agendar → agenda | RESPONSIVE F1 | 1 sem |
| P4-3 | Responsividade de conta: perfil, dashboard do prestador, analytics | RESPONSIVE F2 | 3-5 d |
| P4-4 | Piso de cobertura na CI; remover `--passWithNoTests` | BL-15 | 1 d |
| P4-5 | Promover a CSP de `Report-Only` para bloqueante | N-02 | 1 d |
| P4-6 | Dark mode completo | L2 | 3-5 d |
| P4-7 | Cache HTTP no frontend (ETag) | L1 | 2-3 d |
| P4-8 | Revisar chaves de i18n faltantes | L3 | 4 h |
| P4-9 | Foto de perfil: importar do Google e permitir upload | B12 | 2-3 d |
| P4-10 | Remover snackbars de erro global | B13 | 4 h |
| P4-11 | Corrigir alinhamento do label de WhatsApp | B11 | 1 h |
| P4-12 | Atualizar a versão para `1.0.0` nos environments e no `package.json` | M4 | 15 min |
| P4-13 | Verificador de segredos na esteira de CI | Auditoria | 15 min |

**Bloqueado por dependência externa:** WhatsApp via Twilio (M6) depende de
aprovação do sandbox.

---

## Critérios de pronto (todas as ondas)

Todo item só é considerado concluído quando:

1. Tem teste automatizado cobrindo o comportamento — anotado com `@spec:AC-xxx`
   quando a tarefa vier de uma especificação em `.spec/features/`.
2. `npm run lint` e `npm test` passam nos dois repositórios afetados.
3. A alteração está atrás de PR com a esteira verde.
4. Quando muda comportamento visível, a documentação em `docs/` acompanha.

Para as features especificadas, o veredito é mecânico: `onp-spec verify <feature>`
grava a prova de cada critério de aceite a partir do resultado do test runner —
quem decide se passou é o teste, não quem escreveu o código.

---

## Sequência recomendada

Se houver uma pessoa desenvolvedora só, esta é a ordem que maximiza redução de
risco por semana investida:

```
Semana 1   P0-8, P0-6, P0-4, P0-7, P0-5, P0-9   ← itens de horas, alto retorno
Semana 2   P0-1, P0-3                            ← fecha o vazamento
Semana 3   P0-2, P1-2                            ← papel de admin e taxa unificada
Semana 4-5 P1-1, P1-4                            ← caminho de volta do dinheiro
Semana 6   P2-1, P2-2, P2-4                      ← prepara a verificação
Semana 7-9 P2-3                                  ← verificação de morador
Semana 10+ P3-1, P3-2, P3-3                      ← receita e loja
```

A Onda 4 entra nos intervalos, conforme a responsividade for incomodando.
