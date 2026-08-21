# Tasks: Integridade do mural do condomínio

> feature: integridade-do-mural

## T-011 — Fronteira do condomínio nos serviços [concluida]
- Refs: US-004, AC-010, AC-011, AC-012
- Arquivos: src/services/services.controller.ts, src/services/services.service.ts, src/services/services.service.spec.ts, src/services/services.controller.spec.ts
- Notas: Três pontos no mesmo módulo, por isso uma tarefa só.
  (a) `findAll` do controller: hoje faz `condominiumId ?? user.condominiumId`
  e aceita qualquer valor — passa a recusar quando o informado difere do
  condomínio do usuário (decisão registrada na pergunta Q-008).
  (b) `findOne`: passa a receber o usuário e recusar serviço de outro
  condomínio. Cuidado para não quebrar `recalcRating`, que também chama
  `findOne` internamente — a checagem fica numa função separada usada só
  pela rota, não no `findOne` cru.
  (c) `create`: para de aceitar `condominiumId` vindo do corpo quando ele
  difere do condomínio do prestador.
  Usuário sem condomínio é negado (ASM-009), e serviço com condomínio nulo
  também (ASM-008).

## T-012 — Fronteira do condomínio e data no passado no agendamento [concluida]
- Refs: US-004, US-006, AC-013, AC-016
- Arquivos: src/appointments/services/appointment-creation.service.ts, src/appointments/services/appointment-creation.service.spec.ts
- Notas: Duas checagens no mesmo ponto de entrada.
  (a) Depois de carregar o serviço dentro da transação, comparar
  `service.condominiumId` com `customer.condominiumId` e recusar se
  divergirem.
  (b) A função `hasAppointmentDateTimePassed` já existe em
  `appointment-date.util.ts:38` e é usada pelos serviços de disponibilidade e
  de status — este arquivo importa apenas `toDateKey` e `toTimeKey`. Basta
  importar e aplicar; não escrever lógica de data nova.
  Ordem importa: recusar data passada antes de tocar no banco, para não
  segurar trava à toa.

## T-013 — Avaliação exige atendimento concluído [concluida]
- Refs: US-005, AC-014, AC-015
- Arquivos: src/reviews/reviews.service.ts, src/reviews/reviews.service.spec.ts, src/reviews/reviews.module.ts
- Notas: Antes de criar a avaliação, exigir ao menos um agendamento do próprio
  autor para aquele serviço com status `completed` (ASM-010). Precisa injetar
  o repositório de `Appointment` no módulo de avaliações, que hoje não o
  conhece. Manter a trava de avaliação duplicada que já existe. A mensagem de
  erro deve explicar o motivo — "conclua um atendimento antes de avaliar" — e
  não apenas negar.
