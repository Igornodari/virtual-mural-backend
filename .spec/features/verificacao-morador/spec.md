# Spec: Verificação de morador

> feature: verificacao-morador
> status: rascunho

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - US-xxx = história de usuário · AC-xxx = critério de aceite
    ASM-xxx = suposição · Q-xxx = pergunta em aberto
  - Toda história de usuário precisa de pelo menos um critério de aceite.
  - Todo critério de aceite precisa de Dado/Quando/Então completos.
-->

## Contexto

Hoje qualquer pessoa autenticada escolhe (ou cria) um condomínio no onboarding e
passa a ser tratada como moradora dele. Não existe nenhuma checagem de que a
pessoa mora no endereço: `updateOnboarding` marca `addressCompleted = true` só
porque veio um `condominiumId` no corpo da requisição
(`src/users/users.service.ts:120-123`).

Isso quebra a promessa central do produto. O valor do mural é "são os vizinhos
do meu prédio" — sem isso o app é um classificado aberto com um filtro
cosmético. Um estranho entra no condomínio de qualquer pessoa, vê a lista de
moradores prestadores, os serviços, os horários e consegue agendar. Um
concorrente entra e derruba a nota dos rivais com avaliações falsas (avaliar não
exige agendamento concluído — `src/reviews/reviews.service.ts:32`).

Esta feature introduz **verificação de vínculo com o endereço**: a pessoa envia
um comprovante de residência, o sistema extrai nome e endereço do documento,
compara com o cadastro e com o endereço do condomínio, e só então concede o
status de morador verificado. Quem não verificou continua entrando no app, mas
com acesso restrito.

## Histórias

### US-001 — Morador comprova que mora no condomínio

Como morador de um condomínio, quero enviar um comprovante de residência no
meu nome, para que eu seja reconhecido como morador verificado e tenha acesso
completo ao mural do meu prédio.

#### AC-001 — Comprovante com nome e endereço compatíveis aprova o morador

- **Dado** um usuário autenticado, vinculado a um condomínio, com nome completo
  preenchido no perfil e sem verificação aprovada
- **Quando** ele envia um comprovante de residência cujo nome extraído casa com
  o nome do perfil e cujo endereço extraído casa com o endereço do condomínio
- **Então** a tela mostra a verificação como aprovada e ele passa a ver o mural
  completo do condomínio (backend: `residencyStatus = 'verified'`,
  `verifiedAt` preenchido)

#### AC-002 — Comprovante com endereço divergente não aprova

- **Dado** um usuário autenticado aguardando verificação
- **Quando** ele envia um comprovante cujo endereço extraído não casa com o
  endereço do condomínio escolhido
- **Então** a tela informa que o endereço do documento não confere com o
  condomínio e a verificação não é aprovada (backend: `residencyStatus`
  permanece diferente de `'verified'`)

#### AC-003 — Comprovante em nome de terceiro cai para revisão manual

- **Dado** um usuário autenticado aguardando verificação
- **Quando** ele envia um comprovante cujo endereço confere mas cujo nome não
  casa com o nome do perfil
- **Então** a tela informa que o documento está em análise e explica como
  comprovar vínculo com o titular (backend: `residencyStatus = 'manual_review'`)

#### AC-004 — Documento ilegível é recusado com orientação

- **Dado** um usuário autenticado aguardando verificação
- **Quando** ele envia um arquivo do qual não é possível extrair nem nome nem
  endereço
- **Então** a tela pede um novo envio explicando os requisitos de legibilidade
  e a verificação não é aprovada

### US-002 — Plataforma restringe quem não verificou

Como responsável pela plataforma, quero que usuários não verificados não
acessem os dados do condomínio, para que o mural continue sendo um espaço de
vizinhos reais.

#### AC-005 — Não verificado não enxerga os serviços do condomínio

- **Dado** um usuário autenticado cuja verificação não está aprovada
- **Quando** ele abre a lista de serviços do condomínio
- **Então** a tela mostra o aviso de verificação pendente no lugar da lista
  (backend: `GET /services` responde 403)

#### AC-006 — Não verificado não consegue agendar

- **Dado** um usuário autenticado cuja verificação não está aprovada
- **Quando** ele tenta agendar um serviço
- **Então** a tela informa que é preciso concluir a verificação antes de
  agendar e nenhum agendamento é criado

#### AC-007 — Não verificado não consegue publicar serviço

- **Dado** um usuário autenticado cuja verificação não está aprovada
- **Quando** ele tenta publicar um serviço como prestador
- **Então** a tela informa que é preciso concluir a verificação antes de
  publicar e nenhum serviço é criado

### US-003 — Morador controla seus dados sensíveis

Como morador, quero que meu comprovante de residência não fique guardado para
sempre, para que meus dados pessoais não fiquem expostos além do necessário.

#### AC-008 — Comprovante é descartado após a decisão

- **Dado** um comprovante enviado e já processado (aprovado ou recusado)
- **Quando** o prazo de retenção configurado expira
- **Então** o arquivo original não está mais acessível e restam apenas os
  metadados da decisão (status, data, campos que casaram)

#### AC-009 — Ninguém além do dono e da revisão manual acessa o comprovante

- **Dado** um comprovante enviado pelo usuário A
- **Quando** o usuário B tenta acessar esse comprovante
- **Então** o acesso é negado (backend: 403 ou 404, sem vazar existência)

## Fora de escopo

- Verificação de identidade com documento oficial + selfie (biometria facial) —
  fica para uma feature separada, se a fraude justificar o custo.
- Integração com sistema de gestão condominial / API do síndico para bater a
  lista oficial de moradores — depende de parceria comercial, ver Q-004.
- Verificação de CNPJ / alvará para prestadores externos ao condomínio.
- Reverificação periódica (morador que se muda) — ver Q-005.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-001 | O usuário tem nome completo preenchido no perfil antes de enviar o comprovante. Hoje `givenName`/`familyName` vêm do Cognito e são nullable, então o fluxo precisa exigir o preenchimento antes do upload. | aberta | — |
| ASM-002 | Contas de consumo (luz, água, gás, telefone, internet) e faturas de cartão cobrem a maioria dos moradores brasileiros como comprovante aceito. | aberta | — |
| ASM-003 | O endereço do condomínio cadastrado está correto. Hoje ele é criado pelo próprio usuário no onboarding, sem curadoria — se a base de condomínios estiver suja, a comparação de endereço compara contra lixo. | aberta | — |
| ASM-004 | Uma fatia relevante dos moradores (locatários, dependentes, cônjuges, filhos) NÃO tem comprovante no próprio nome. O fluxo de revisão manual não é exceção rara — é caminho comum. | aberta | — |
| ASM-005 | O volume inicial de verificações cabe em revisão manual humana sem equipe dedicada. | aberta | — |
| ASM-006 | A comparação de endereço pode ser feita por normalização + similaridade textual, sem serviço externo de geocoding. | aberta | — |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-001 | Qual motor de extração de texto do documento? (Textract da AWS — já estamos na AWS; Google Document AI; Tesseract self-hosted; ou upload manual + revisão 100% humana no MVP) | aberta | — |
| Q-002 | Qual o limiar de similaridade para considerar que nome e endereço "casaram"? Falso positivo deixa entrar estranho; falso negativo trava morador legítimo. | aberta | — |
| Q-003 | Quem faz a revisão manual? Síndico do condomínio, equipe da plataforma, ou o próprio morador que já está verificado (endosso de vizinho)? | aberta | — |
| Q-004 | O síndico entra como papel no produto? Ele é o verificador natural e também o comprador natural do plano B2B — mas hoje não existe nenhum conceito de admin no sistema. | aberta | — |
| Q-005 | O que acontece com quem se muda? Reverificação periódica, ou verificação vale até alguém contestar? | aberta | — |
| Q-006 | Onde o comprovante fica armazenado e por quanto tempo? (S3 com criptografia + lifecycle rule é o candidato natural, mas o prazo de retenção é decisão de negócio/jurídica sob a LGPD) | aberta | — |
| Q-007 | Usuários já cadastrados hoje entram como verificados (grandfathering) ou todos passam pelo fluxo? Barrar a base atual pode esvaziar o app; não barrar mantém o problema. | aberta | — |
