# Sistema de Notificações — Virtual Mural

Sistema unificado que entrega notificações por **3 canais** para cada evento de agendamento/pagamento:

1. **In-app** — persistência em Postgres + entrega em tempo real via SSE
2. **Web Push** — notificação nativa no celular/desktop mesmo com app fechado
3. **Email + WhatsApp** (legado, mantido) — para eventos críticos

i18n: o backend nunca persiste texto traduzido. Armazena `type` + `payload` (variáveis). O frontend resolve a tradução no idioma escolhido pelo usuário, mesmo no Service Worker do push.

---

## Arquivos principais

### Backend

| Arquivo | Responsabilidade |
|---|---|
| `entities/notification.entity.ts` | Entidade `notifications` + enum `NotificationType` (15 tipos) |
| `entities/push-subscription.entity.ts` | Subscriptions Web Push por device |
| `in-app-notifications.service.ts` | CRUD + Subject SSE + dispara push |
| `web-push.service.ts` | Envia via VAPID; remove subs 404/410 |
| `notifications.controller.ts` | REST + SSE em `/notifications/*` |
| `messaging/consumers/mural-events.consumer.ts` | Mapeia eventos RabbitMQ → notificações |
| `appointments/schedulers/appointment-reminder.scheduler.ts` | Cron @5min de hora, lembrete 1–4h antes |

### Frontend

| Arquivo | Responsabilidade |
|---|---|
| `core/services/notification-api.service.ts` | Wrapper REST |
| `core/services/notification-center.service.ts` | Estado (signals) + SSE com reconexão |
| `core/services/push-subscription.service.ts` | Registro Web Push |
| `components/notifications/notification-bell.component.ts` | Sino no topbar |
| `components/notifications/notification-panel.component.{ts,html,scss}` | Painel/lista (bottom sheet mobile) |
| `public/sw-push.js` | Service Worker que mostra push |
| `assets/i18n/{pt,en}/notifications.json` | Dicionários pt/en |

---

## Configuração (.env)

```bash
# VAPID — gerar uma vez por ambiente
# $ npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=BNo...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:noreply@virtual-mural.com
```

Se VAPID não for configurado, o sistema continua funcionando — só o canal push é desativado (in-app + SSE seguem normalmente).

## Dependências NPM

Backend:
```bash
npm install web-push @nestjs/schedule
npm install -D @types/web-push
```

Frontend: nenhuma nova dependência — usamos a API nativa do navegador (Notification, PushManager, EventSource).

---

## Cobertura por cenário

| # | Cenário | Tipo | Destinatário | Disparado em |
|---|---|---|---|---|
| 1 | Morador agenda serviço | `NEW_APPOINTMENT_REQUEST` | Prestador | `appointments.service.create()` |
| 2 | Prestador confirma | `APPOINTMENT_CONFIRMED` | Morador | `updateStatus(confirmed)` |
| 3 | Prestador rejeita | `APPOINTMENT_REJECTED` ou `PROVIDER_CANCELLED` | Morador | `updateStatus(cancelled)` com actor=provider |
| 4 | Pagamento confirmado | `PAYMENT_CONFIRMED` | Prestador | Stripe webhook `checkout.session.completed` + `handleStripePaymentSucceeded` |
| 5 | Pagamento falhou | `PAYMENT_FAILED` + `PAYMENT_PENDING_PROVIDER` | Morador (+ Prestador) | `handleStripePaymentFailed`, `handleStripeCheckoutSessionExpired` |
| 6 | Morador cancela | `CUSTOMER_CANCELLED` | Prestador | `cancelByCustomer()` com actor=customer |
| 7 | Prestador cancela | `PROVIDER_CANCELLED` | Morador | `updateStatus(cancelled)` com actor=provider |
| 8 | Reagendamento | `RESCHEDULE_REQUESTED/ACCEPTED/REJECTED` | Contraparte | Eventos prontos no consumer — endpoints REST do reschedule pendentes |
| 9 | Lembrete | `APPOINTMENT_REMINDER` | Ambos | `AppointmentReminderScheduler` @5min/h, janela 1–4h |
| 10 | Concluído | `APPOINTMENT_COMPLETED` | Morador | `updateStatus(completed)` — `actionUrl` inclui `&review=1` |
| extra | Novo serviço no condomínio | `NEW_SERVICE_AVAILABLE` | Moradores | `SERVICE_CREATED` |
| extra | Nova avaliação | `NEW_REVIEW` | Prestador | `REVIEW_SUBMITTED` |

---

## Fluxo de uma notificação

```
[Appointment Service]                  [Consumer]                       [Cliente]
       │                                    │                                │
       ├── publish(STATUS_CHANGED) ───────► │                                │
       │   { status:'paid', actor,          │                                │
       │     customerId, providerId, ...}   │                                │
       │                                    │                                │
       │                          ┌─────────┴─────────┐                      │
       │                          │ inApp.create({    │                      │
       │                          │  type: PAYMENT_CONFIRMED,                │
       │                          │  recipientId: providerId,                │
       │                          │  payload: {...}   │                      │
       │                          │ })                │                      │
       │                          └─────────┬─────────┘                      │
       │                                    │                                │
       │                          (1) INSERT notifications                   │
       │                          (2) stream$.next() ──── SSE ───────────►  │ EventSource
       │                          (3) webPush.sendToUser() ── HTTPS ──────► │ Service Worker
       │                          (4) email/WhatsApp legados                 │
```

---

## Smoke test manual

1. **Backend**: rodar com VAPID keys + DB synchronize.
2. **Frontend**: `ng serve`, autenticar.
3. **Sino**: deve aparecer no topbar. Badge zerado.
4. **Ativar push**: clicar no painel → "Ativar notificações" → permitir no navegador.
5. **Cenário 1**: como morador A, agendar serviço do morador B → o sino do B mostra badge "1".
6. **Cenário 4**: pagar via Stripe Checkout → quando webhook chega, o sino do prestador atualiza em tempo real (SSE) e o push notification dispara.
7. **Cenário 9**: criar appointment para daqui 2h, aguardar minuto 5 da próxima hora — lembrete dispara.

---

## Próximos passos sugeridos

- **Endpoints REST de reagendamento** (Cenário 8): hoje os eventos `RESCHEDULE_*` estão prontos, mas falta o controller de propor/aceitar reagendamento. Quando implementado, basta chamar `messagingService.publish(MuralEvents.RESCHEDULE_REQUESTED, payload)`.
- **Preferências de notificação por canal**: tabela `notification_preferences (userId, type, channel, enabled)` para o usuário desligar push/email para tipos específicos.
- **iOS PWA**: documentar para o usuário que precisa adicionar à tela inicial para push funcionar no Safari/iOS.
- **Redis pub/sub**: hoje o `stream$` é in-process. Em deploy multi-instância, trocar `Subject` por adapter Redis para entregar SSE em qualquer instância.
- **Migration**: gerar migration TypeORM para `notifications`, `push_subscriptions`, e coluna `appointments.reminderSentAt` quando rodar com `DB_SYNC=false`.
