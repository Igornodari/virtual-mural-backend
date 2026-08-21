# Tasks: Webhook do Stripe idempotente

> feature: webhook-idempotente

## T-014 — Registro de eventos processados [concluida]
- Refs: US-007, AC-017, AC-018
- Arquivos: src/appointments/entities/processed-webhook-event.entity.ts, src/database/migrations/1790100000000-CreateProcessedWebhookEvents.ts
- Notas: Entidade `ProcessedWebhookEvent` com `eventId` (chave primária, o
  `evt_…` da Stripe), `eventType`, `processedAt`. A unicidade é do banco, não
  da aplicação — é ela que desempata entregas concorrentes (ASM-014).
  Migration idempotente (`CREATE TABLE IF NOT EXISTS`), seguindo o padrão das
  migrations `Ensure...` que já existem no projeto.

## T-015 — Guarda de idempotência no webhook [concluida]
- Refs: US-007, AC-017, AC-018, AC-019, AC-020
- Arquivos: src/appointments/webhooks/stripe-webhooks.controller.ts, src/appointments/webhooks/stripe-webhooks.controller.spec.ts, src/appointments/appointments.module.ts
- Notas: Ordem das operações importa e é o núcleo desta tarefa.
  (1) Validar assinatura primeiro — evento não autenticado nunca toca o
  registro, senão vira vetor para envenenar o registro com IDs legítimos
  (AC-019).
  (2) Consultar se o `event.id` já foi processado; se sim, responder 200 sem
  fazer nada. Responder 200 e não 4xx é deliberado: erro faz a Stripe
  reentregar de novo, que é exatamente o que queremos evitar (AC-018).
  (3) Processar.
  (4) Registrar **depois** do processamento dar certo, para que falha não
  marque o evento como visto (AC-020, ASM-013).
  O registro precisa tolerar violação de unicidade sem derrubar a resposta —
  em corrida, o segundo a chegar simplesmente perde.
