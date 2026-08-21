# Spec: Webhook do Stripe idempotente

> feature: webhook-idempotente
> status: rascunho

## Contexto

A Stripe reenvia o mesmo evento por desenho — em timeout, falha de rede,
resposta lenta ou retentativa manual pelo painel. A documentação dela é
explícita: o receptor precisa tolerar entrega duplicada.

Hoje o `stripe-webhooks.controller.ts` valida a assinatura corretamente, mas
processa **todo evento que chega**, sem nunca olhar o `event.id`. Um
`payment_intent.succeeded` reentregue roda
`handleStripePaymentSucceeded` de novo; um `checkout.session.completed`
reentregue reprocessa a confirmação do agendamento.

O efeito varia de inofensivo a caro dependendo do handler, e essa incerteza é
o próprio problema: a corretude do fluxo de dinheiro está apoiada em "espero
que reprocessar não faça mal", em vez de numa garantia.

A correção é a padrão para esta classe: registrar o identificador do evento
antes de agir e recusar o que já foi visto.

## Histórias

### US-007 — A plataforma processa cada evento de pagamento uma única vez

Como responsável pela plataforma, quero que um evento reentregue pela Stripe
não seja processado duas vezes, para que o estado do agendamento e do
pagamento não dependa de quantas vezes a Stripe tentou entregar.

#### AC-017 — Evento novo é processado e registrado

- **Dado** um evento válido da Stripe que nunca foi recebido antes
- **Quando** ele chega no webhook
- **Então** o evento é processado normalmente e passa a constar como já
  processado (backend: responde 200)

#### AC-018 — Evento repetido não é processado de novo

- **Dado** um evento que já foi processado com sucesso
- **Quando** a Stripe reentrega o mesmo evento
- **Então** nenhum processamento acontece de novo e a resposta continua sendo
  de sucesso, para a Stripe parar de reentregar (backend: 200)

#### AC-019 — Evento com assinatura inválida não é registrado

- **Dado** uma requisição cuja assinatura não confere com nenhuma das chaves
- **Quando** ela chega no webhook
- **Então** ela é recusada e o identificador não entra no registro de
  processados — senão um atacante marcaria eventos legítimos como já vistos
  (backend: 400)

#### AC-020 — Falha no processamento não marca o evento como processado

- **Dado** um evento novo cujo processamento lança erro
- **Quando** a Stripe reentregar esse mesmo evento
- **Então** ele é processado de novo, porque a primeira tentativa não
  completou

## Fora de escopo

- Idempotência dos handlers em si. Esta feature garante que o evento não é
  processado duas vezes; não reescreve `handleStripePaymentSucceeded` e
  companhia para serem idempotentes por conta própria.
- Limpeza automática do registro de eventos antigos. A tabela cresce devagar e
  a poda pode esperar — anotado como pergunta em aberto.
- Idempotência de eventos vindos de outras origens (RabbitMQ já tem o próprio
  mecanismo de retry com `x-retry-count`).

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-012 | O `event.id` da Stripe é único e estável entre reentregas do mesmo evento. É garantia documentada da Stripe: a reentrega carrega o mesmo `evt_…`. | confirmada | Comportamento documentado da Stripe |
| ASM-013 | Registrar o evento **depois** do processamento bem-sucedido é preferível a registrar antes. Registrar antes protegeria contra entregas concorrentes, mas perderia o evento para sempre se o processamento falhasse — e evento de pagamento perdido é pior que evento processado duas vezes. | aberta | — |
| ASM-014 | Entregas concorrentes do mesmo evento são raras o suficiente para que a restrição de unicidade no banco baste como desempate, sem precisar de trava distribuída. | aberta | — |
| ASM-015 | O volume de eventos não torna a tabela um problema de armazenamento no horizonte próximo. | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-011 | Por quanto tempo guardar o registro de eventos processados? A Stripe reentrega por até alguns dias, então a proteção real precisa de poucos dias — mas o registro também serve de trilha de auditoria do fluxo de dinheiro, o que sugere guardar mais. | aberta | — |
| Q-012 | Evento repetido deve gerar alerta? Repetição isolada é normal; repetição em volume indica que a plataforma está demorando a responder e a Stripe está desistindo. | aberta | — |
