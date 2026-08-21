# Spec: Estorno e cancelamento de agendamento pago

> feature: estorno-de-agendamento
> status: rascunho

## Contexto

Não existe uma única chamada de reembolso em todo o backend. Depois do
pagamento confirmado, cancelar devolve a mensagem de que o assunto "deve ser
tratado diretamente com o prestador"
(`appointment-status.service.ts:114`). A máquina de status confirma: de `paid`
só se sai para `completed`.

Isso é mais grave do que uma funcionalidade faltando. O split já transferiu o
valor para a conta Connect do prestador, então a plataforma deve ao cliente um
dinheiro que não tem mais — e, como comerciante do registro, é ela quem
responde no chargeback. O cliente sem saída pelo app vai à bandeira do cartão,
que é o caminho mais caro possível para todo mundo.

Também bloqueia a publicação em loja de aplicativos e tem implicação de
direito de arrependimento (CDC, Art. 49).

**O detalhe técnico que decide a conta:** o pagamento usa cobrança com destino
(`transfer_data.destination`). Um estorno simples devolve ao cliente **do
bolso da plataforma**, enquanto o prestador continua com os 95% que já
recebeu. Para o dinheiro voltar de onde foi, o estorno precisa reverter
também a transferência e a taxa da plataforma. Errar isso não dá erro em
lugar nenhum — só aparece no extrato, depois.

## Histórias

### US-014 — O morador cancela um serviço pago e recebe o dinheiro de volta

Como morador que pagou por um serviço e não vai mais precisar dele, quero
cancelar pelo app e receber o valor de volta, para não depender de negociar
com o prestador nem abrir contestação no cartão.

#### AC-028 — Cancelar antes do horário devolve o valor

- **Dado** um agendamento pago cujo horário ainda não chegou
- **Quando** o morador que o solicitou cancela
- **Então** a tela confirma o cancelamento e informa que o estorno foi
  solicitado, e o agendamento fica cancelado

#### AC-029 — O estorno reverte a transferência e a taxa da plataforma

- **Dado** um agendamento pago com split para a conta do prestador
- **Quando** o estorno é solicitado
- **Então** o pedido enviado ao provedor de pagamento reverte também a
  transferência ao prestador e a taxa retida pela plataforma, para que o valor
  volte de quem o recebeu

#### AC-030 — Depois do horário o cancelamento não devolve automaticamente

- **Dado** um agendamento pago cujo horário já passou
- **Quando** o morador tenta cancelar
- **Então** a tela informa que o horário já passou e que o caso precisa ser
  tratado com o prestador, e nenhum estorno automático acontece

#### AC-031 — Só quem solicitou pode cancelar

- **Dado** um agendamento pago de outro morador
- **Quando** alguém que não é o solicitante tenta cancelar
- **Então** o pedido é recusado e nada é alterado

### US-015 — O estado do pagamento reflete o estorno

Como responsável pela plataforma, quero que um pagamento estornado fique
registrado como tal, para que o extrato do app bata com o do provedor.

#### AC-032 — Pagamento estornado fica marcado

- **Dado** um estorno concluído com sucesso
- **Quando** o registro do pagamento é consultado
- **Então** ele consta como estornado

#### AC-033 — Falha no estorno não cancela o agendamento

- **Dado** um agendamento pago cujo estorno falha no provedor de pagamento
- **Quando** o morador tenta cancelar
- **Então** o agendamento **permanece pago** e o erro é informado, para não
  existir agendamento cancelado com dinheiro retido

## Fora de escopo

- Estorno parcial, e política de multa por cancelamento em cima da hora. Esta
  entrega é tudo ou nada; a régua fina depende de decisão comercial.
- Cancelamento pelo prestador com estorno, que tem regras próprias e merece
  entrega separada.
- Fluxo de disputa e mediação entre morador e prestador.
- Tela de histórico de estornos.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-020 | Cancelamento antes do horário devolve o valor **integral**. É a política mais conservadora do ponto de vista do consumidor e a mais simples de explicar; qualquer retenção precisa estar nos termos de uso antes de ser cobrada. | aberta | — |
| ASM-021 | A régua é o horário do agendamento, não uma janela em horas antes dele. Uma janela ("até 24h antes") é mais justa com o prestador, mas exige decisão comercial sobre o tamanho dela. | aberta | — |
| ASM-022 | A plataforma abre mão da comissão no cancelamento, revertendo também a taxa. Cobrar comissão sobre serviço não prestado é difícil de defender e convida à contestação. | aberta | — |
| ASM-023 | O estorno é solicitado ao provedor e considerado bem-sucedido quando ele aceita o pedido. A liquidação efetiva leva dias e chega por webhook — esta entrega não espera por ela. | aberta | — |
| ASM-024 | Pagamento por Pix e por cartão são estornados pelo mesmo caminho, já que ambos viram um pagamento no provedor. | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-018 | Qual é a política oficial de cancelamento? Prazo, retenção e quem arca com a taxa de processamento precisam estar nos termos de uso — implementar sem isso escrito é assumir risco de consumidor. | aberta | — |
| Q-019 | A taxa de processamento do provedor não volta no estorno. Quem absorve essa perda: a plataforma, o prestador, ou ela é descontada do valor devolvido? Descontar precisa estar nos termos. | aberta | — |
| Q-020 | O prestador deve poder recusar um cancelamento, ou ser apenas notificado? Recusa exige fluxo de disputa. | aberta | — |
| Q-021 | Cancelamento em excesso pelo mesmo morador deve ser limitado? Sem trava, o app vira reserva gratuita. | aberta | — |
