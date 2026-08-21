# Spec: Papel de administrador e síndico

> feature: papel-de-administrador
> status: rascunho

## Contexto

Não existe nenhum conceito de administrador no sistema. O CRUD de condomínio
exige apenas estar autenticado (`condominiums.controller.ts:31`): qualquer
morador cria, renomeia ou desativa o condomínio de qualquer outro. Vandalismo
trivial, e hoje nada impede.

Isso também é o que trava três itens que vêm depois: a fila de revisão manual
da verificação de morador precisa de quem revise, a moderação de conteúdo
precisa de quem modere, e o plano B2B precisa de um síndico a quem vender.

A feature introduz dois papéis distintos, e a distinção importa:

- **Administrador da plataforma** — quem opera o produto. Atravessa a
  fronteira do condomínio de propósito, porque precisa enxergar o todo.
- **Síndico** — vinculado a **um** condomínio. Administra o dele e só o dele.
  É morador com poderes adicionais, não um administrador reduzido.

A fronteira do condomínio construída na feature `integridade-do-mural` continua
valendo para todo mundo, com uma exceção deliberada e estreita: o
administrador da plataforma. O síndico não fura a fronteira — ele apenas tem
mais poder dentro dela.

## Histórias

### US-011 — Só quem tem poder administra o condomínio

Como morador, quero que ninguém de fora consiga alterar o meu condomínio,
para que o cadastro do meu prédio não seja vandalizado.

#### AC-021 — Morador comum não altera o condomínio

- **Dado** um morador autenticado, sem papel administrativo
- **Quando** ele tenta alterar ou desativar um condomínio
- **Então** a tela informa que ele não tem permissão e nada é alterado
  (backend: 403)

#### AC-022 — Síndico administra o próprio condomínio

- **Dado** um síndico do condomínio A
- **Quando** ele altera os dados do condomínio A
- **Então** a alteração é aplicada

#### AC-023 — Síndico não administra condomínio alheio

- **Dado** um síndico do condomínio A
- **Quando** ele tenta alterar o condomínio B
- **Então** a tela informa que ele só administra o próprio condomínio e nada
  é alterado (backend: 403)

#### AC-024 — Administrador da plataforma administra qualquer condomínio

- **Dado** um administrador da plataforma
- **Quando** ele altera qualquer condomínio
- **Então** a alteração é aplicada, porque operar o produto exige enxergar o
  todo

### US-012 — A criação de condomínio deixa de ser anônima

Como responsável pela plataforma, quero saber quem criou cada condomínio, para
poder limpar a base e responsabilizar quem a suja.

#### AC-025 — Quem cria um condomínio fica registrado

- **Dado** um usuário autenticado criando um condomínio
- **Quando** o condomínio é criado
- **Então** o registro guarda quem o criou

### US-013 — O síndico enxerga os moradores do prédio dele

Como síndico, quero ver quem está vinculado ao meu condomínio, para conseguir
revisar cadastros e cuidar da comunidade.

#### AC-026 — Síndico lista os moradores do próprio condomínio

- **Dado** um síndico do condomínio A
- **Quando** ele pede a lista de moradores do condomínio A
- **Então** recebe os moradores vinculados a esse condomínio

#### AC-027 — Síndico não lista moradores de outro condomínio

- **Dado** um síndico do condomínio A
- **Quando** ele pede a lista de moradores do condomínio B
- **Então** o pedido é recusado (backend: 403)

## Fora de escopo

- Interface de administração no frontend. Esta entrega é o modelo de
  autorização no backend; a tela vem depois, quando houver o que administrar.
- Fluxo de promoção a síndico (quem nomeia, como se comprova). Nesta entrega
  o papel é atribuído diretamente no banco — ver a pergunta em aberto.
- Moderação de conteúdo e fila de revisão da verificação, que dependem desta
  feature mas são entregas próprias.
- Auditoria de ações administrativas.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-016 | Um usuário é síndico de no máximo um condomínio — o mesmo ao qual está vinculado. Se um dia existir síndico profissional de vários prédios, o modelo precisa de uma tabela de associação, não de uma flag. | aberta | — |
| ASM-017 | Os papéis se acumulam em vez de se excluir: o síndico continua sendo morador e pode ser prestador. É coerente com o `isProvider`, que já é uma flag aditiva e não um papel exclusivo. | aberta | — |
| ASM-018 | Administrador da plataforma é papel raro, atribuído à mão no banco. Não vale construir tela de gestão de administradores para dois ou três registros. | aberta | — |
| ASM-019 | A criação de condomínio segue aberta a qualquer morador autenticado. Fechá-la agora quebraria o onboarding, que depende de criar o condomínio quando ele não existe. O que muda é passar a registrar o autor — a curadoria da base é a tarefa `P2-1`, separada. | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-015 | Como alguém vira síndico? As opções realistas são: atribuição manual pela plataforma, comprovação documental (ata de assembleia), ou o primeiro morador verificado do condomínio assumir. Cada uma tem um custo operacional muito diferente. | aberta | — |
| Q-016 | O síndico pode remover um morador do condomínio? É poder útil contra invasor, e perigoso contra desafeto. | aberta | — |
| Q-017 | O administrador da plataforma deve enxergar dado pessoal de morador, ou só metadado? Sob a LGPD, acesso amplo exige justificativa de finalidade. | aberta | — |
