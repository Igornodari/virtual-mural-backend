# Tasks: Estorno e cancelamento de agendamento pago

> feature: estorno-de-agendamento

## T-020 — Estorno na porta de pagamento [concluida]
- Refs: US-014, AC-029
- Arquivos: src/appointments/payment/payment-gateway.interface.ts, src/appointments/payment/stripe-payment-gateway.service.ts, src/appointments/payment/mock-payment-gateway.service.ts, src/appointments/payment/stripe-payment-gateway.service.spec.ts
- Notas: `refundPayment(externalPaymentId)` entra na interface e nas duas
  implementações.
  O ponto crítico está na implementação real: como a cobrança é com destino
  (`transfer_data.destination`), o estorno precisa de `reverse_transfer: true`
  e `refund_application_fee: true`. Sem o primeiro, a plataforma devolve do
  próprio bolso e o prestador fica com os 95%; sem o segundo, a plataforma
  cobra comissão por serviço não prestado.
  Nada disso dá erro — só aparece no extrato depois. É por isso que o teste
  assere os dois campos explicitamente, e não só que a chamada aconteceu.

## T-021 — Estado de estornado no pagamento [concluida]
- Refs: US-015, AC-032
- Arquivos: src/appointments/entities/payment.entity.ts, src/database/migrations/1790300000000-AddRefundedPaymentStatus.ts
- Notas: `refunded` entra no enum de status do pagamento. O enum é do Postgres,
  então a migration precisa de `ALTER TYPE ... ADD VALUE IF NOT EXISTS` — e
  esse comando não roda dentro de transação em versões mais antigas, o que
  vale conferir no ambiente antes de aplicar.

## T-022 — Cancelamento com estorno [concluida]
- Refs: US-014, US-015, AC-028, AC-030, AC-031, AC-032, AC-033
- Arquivos: src/appointments/services/appointment-status.service.ts, src/appointments/services/appointment-status.service.spec.ts, src/appointments/constants/appointment-status.contants.ts
- Notas: `paid` passa a poder ir para `cancelled` na máquina de transições, e
  `cancelByCustomer` ganha o caminho de estorno.
  Ordem obrigatória: **estornar primeiro, cancelar depois**. Se o provedor
  recusar, o agendamento permanece pago (AC-033) — cancelar antes criaria
  agendamento cancelado com dinheiro retido, que é exatamente o problema que
  esta feature existe para resolver.
  A régua de prazo é o horário do agendamento, reusando
  `hasAppointmentDateTimePassed` do util em vez de escrever comparação nova.
