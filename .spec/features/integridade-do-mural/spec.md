# Spec: Integridade do mural do condomínio

> feature: integridade-do-mural
> status: rascunho

## Contexto

O mural promete duas coisas ao morador: que as pessoas do outro lado são
vizinhas do prédio dele, e que a nota exibida foi dada por quem realmente
contratou. Hoje o código não sustenta nenhuma das duas.

Qualquer usuário autenticado lê e escreve dados de qualquer condomínio — basta
passar o identificador na URL (`services.controller.ts:44`) ou no corpo da
requisição (`services.service.ts:44`). A criação de agendamento exige que o
usuário tenha um condomínio, mas não que seja o mesmo do serviço
(`appointment-creation.service.ts:42`). E avaliar não exige ter contratado nada:
a única trava é contra avaliação duplicada do mesmo autor
(`reviews.service.ts:32`).

Somando: um estranho entra no condomínio alheio, vê os moradores prestadores,
os serviços e a agenda, contrata, e ainda derruba a nota de quem quiser.

Esta feature fecha a fronteira do condomínio e dá lastro à reputação. É
pré-requisito da verificação de morador — sem ela, verificar não adianta,
porque o dado continua acessível por quem não passou pela verificação.

## Histórias

### US-004 — Morador só enxerga e usa o mural do próprio condomínio

Como morador vinculado a um condomínio, quero que o mural mostre apenas o meu
condomínio, para que o espaço continue sendo o do meu prédio e os meus dados
não fiquem visíveis para estranhos.

#### AC-010 — Listar serviços de outro condomínio é negado

- **Dado** um morador autenticado e vinculado ao condomínio A
- **Quando** ele pede a lista de serviços informando o condomínio B
- **Então** a tela informa que ele só tem acesso ao próprio condomínio e
  nenhum serviço do condomínio B é devolvido (backend: 403)

#### AC-011 — Abrir um serviço de outro condomínio é negado

- **Dado** um morador autenticado e vinculado ao condomínio A
- **Quando** ele abre o detalhe de um serviço publicado no condomínio B
- **Então** a tela informa que o serviço não está disponível para ele e nenhum
  dado do serviço é devolvido (backend: 403)

#### AC-012 — Publicar serviço em condomínio alheio é negado

- **Dado** um prestador autenticado e vinculado ao condomínio A
- **Quando** ele tenta publicar um serviço informando o condomínio B
- **Então** a tela informa que ele só pode publicar no próprio condomínio e
  nenhum serviço é criado (backend: 403)

#### AC-013 — Agendar serviço de outro condomínio é negado

- **Dado** um morador autenticado e vinculado ao condomínio A
- **Quando** ele tenta agendar um serviço publicado no condomínio B
- **Então** a tela informa que o serviço não pertence ao condomínio dele e
  nenhum agendamento é criado (backend: 403)

### US-005 — A nota do serviço reflete quem realmente contratou

Como morador que escolhe um serviço pela nota, quero que só quem contratou
possa avaliar, para que a reputação exibida signifique alguma coisa.

#### AC-014 — Avaliar sem ter contratado é negado

- **Dado** um morador autenticado que nunca teve agendamento concluído para
  um determinado serviço
- **Quando** ele tenta avaliar esse serviço
- **Então** a tela informa que é preciso ter concluído um atendimento antes de
  avaliar e nenhuma avaliação é criada (backend: 403)

#### AC-015 — Avaliar depois de um atendimento concluído é permitido

- **Dado** um morador autenticado com um agendamento concluído para um serviço
  e que ainda não avaliou esse serviço
- **Quando** ele envia a avaliação
- **Então** a avaliação é registrada e passa a contar na média do serviço

### US-006 — O agendamento não acontece no passado

Como prestador, quero que ninguém consiga marcar um horário que já passou,
para que a minha agenda continue confiável.

#### AC-016 — Agendamento com data e hora já passadas é recusado

- **Dado** um morador autenticado e vinculado ao mesmo condomínio do serviço
- **Quando** ele tenta agendar para uma data e hora anteriores ao momento atual
- **Então** a tela informa que o horário já passou e nenhum agendamento é
  criado (backend: 400)

## Fora de escopo

- Papel de administrador e de síndico, que precisam poder atravessar a
  fronteira do condomínio de propósito. É a tarefa P0-2 do plano, separada.
- Verificação de que o morador de fato mora no endereço — é a feature
  `verificacao-morador`.
- Moderação e denúncia de avaliação abusiva vinda de quem contratou de verdade.
- Deduplicação da base de condomínios (P2-1 do plano).

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-007 | Um usuário pertence a no máximo um condomínio por vez. O modelo de dados hoje tem um único `condominiumId` no usuário, então a fronteira é uma comparação simples. Se um dia existir morador com duas casas, esta regra precisa mudar. | aberta | — |
| ASM-008 | Serviço sem condomínio (`condominiumId` nulo) não deve existir. O código já exige o vínculo na criação; a checagem trata o caso nulo como negado, e não como liberado. | aberta | — |
| ASM-009 | Usuário sem condomínio não tem acesso ao mural. É o estado de quem ainda não concluiu o onboarding, e ele é redirecionado antes de chegar às telas do mural. | aberta | — |
| ASM-010 | Só agendamento com status `completed` conta como atendimento concluído para liberar a avaliação. Status pago mas não concluído não basta — o serviço ainda não foi prestado. | aberta | — |
| ASM-011 | A avaliação continua permitida mesmo depois de o prestador desativar o serviço, desde que o atendimento tenha sido concluído antes. | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-008 | Quando o morador pede a lista de serviços informando outro condomínio, o certo é recusar com 403 ou simplesmente ignorar o parâmetro e devolver o próprio condomínio? Recusar é mais honesto e mais fácil de testar; ignorar é mais silencioso e não quebra cliente antigo. | respondida | Recusar com 403. Um parâmetro ignorado em silêncio esconde tentativa de acesso indevido e dificulta detectar abuso. |
| Q-009 | O prazo para avaliar depois do atendimento é ilimitado? Hoje não há prazo, e avaliação muito posterior tem valor informativo baixo. | aberta | — |
| Q-010 | Avaliações já existentes que não têm agendamento concluído por trás devem ser removidas, ocultadas ou mantidas? Manter preserva a nota atual mas carrega o problema adiante. | aberta | — |
