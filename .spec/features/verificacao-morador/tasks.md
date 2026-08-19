# Tasks: Verificação de morador

> feature: verificacao-morador

<!--
  T-xxx = tarefa. Toda tarefa referencia US-xxx ou AC-xxx em `Refs:` e lista
  os arquivos que cria/altera em `Arquivos:` (é o que decide o paralelismo).
  Status: pendente | em-andamento | concluida
-->

## T-001 — Modelo de dados da verificação de residência [pendente]

- Refs: US-001, AC-001, AC-002, AC-003
- Arquivos: src/users/entities/residency-verification.entity.ts, src/users/entities/user.entity.ts, src/database/migrations/1790000000000-CreateResidencyVerification.ts
- Notas: Entidade `ResidencyVerification` (userId, condominiumId, documentType,
  storageKey, extractedName, extractedAddress, nameScore, addressScore, status,
  reviewedBy, reviewedAt, createdAt, purgedAt). No `User`, trocar o booleano
  cego `addressCompleted` por `residencyStatus` enum
  (`unverified | pending | verified | manual_review | rejected`) + `verifiedAt`.
  Manter `addressCompleted` por uma release para não quebrar o frontend, com a
  migration preenchendo `residencyStatus` a partir de Q-007 (decisão de
  grandfathering ainda em aberto — implementar como flag de configuração).
  Adicionar também `unitNumber` (apartamento/bloco): hoje o sistema não sabe em
  qual unidade a pessoa mora, o que impede tanto a verificação quanto a
  comparação com a lista oficial do síndico.

## T-002 — Normalização e comparação de nome e endereço [pendente]

- Refs: AC-001, AC-002, AC-003
- Arquivos: src/users/verification/address-match.util.ts, src/users/verification/address-match.util.spec.ts, src/users/verification/name-match.util.ts, src/users/verification/name-match.util.spec.ts
- Notas: Núcleo da feature e a parte mais fácil de errar. Normalizar
  maiúsculas/acentos, abreviações de logradouro (R./Rua, Av./Avenida),
  "apto/ap/apartamento", zeros à esquerda no número, e comparar por
  similaridade (Jaro-Winkler ou Levenshtein normalizado). CEP casando é o sinal
  mais forte; rua+número é o segundo. Nome: comparar tokens ignorando
  preposições (de, da, dos), aceitar abreviação de nome do meio.
  Os limiares vêm de Q-002 — deixar configuráveis, não hardcoded.
  Tarefa puramente funcional: dá para testar exaustivamente sem banco e sem OCR.

## T-003 — Porta de extração de documento (OCR) com implementação mock [pendente]

- Refs: AC-001, AC-004
- Arquivos: src/users/verification/document-extraction.interface.ts, src/users/verification/mock-document-extraction.service.ts, src/users/verification/textract-document-extraction.service.ts
- Notas: Mesmo padrão já usado em `payment-gateway.interface.ts` +
  `mock-payment-gateway.service.ts` — interface + mock para dev/teste e
  implementação real por trás de env var. Isola Q-001: dá para construir e
  testar todo o fluxo antes de decidir o motor de OCR. A implementação real
  (AWS Textract `AnalyzeDocument`) fica como esqueleto até a decisão.

## T-004 — Upload seguro do comprovante [pendente]

- Refs: US-001, AC-004, AC-009
- Arquivos: src/users/verification/verification-upload.controller.ts, src/users/verification/document-storage.service.ts, src/users/verification/verification-upload.controller.spec.ts
- Notas: Upload direto para S3 via presigned URL (o arquivo não passa pela API).
  Validar tipo (PDF/JPG/PNG) e tamanho (máx. 10 MB) — validar por magic bytes,
  não por extensão nem por `Content-Type` do cliente. Bucket privado, sem
  listagem pública, criptografia em repouso. Rate limit agressivo no endpoint:
  é um alvo óbvio de abuso. AC-009 exige que o acesso ao arquivo seja sempre
  mediado pelo backend com checagem de dono.

## T-005 — Serviço de decisão da verificação [pendente]

- Refs: AC-001, AC-002, AC-003, AC-004
- Arquivos: src/users/verification/residency-verification.service.ts, src/users/verification/residency-verification.service.spec.ts
- Notas: Orquestra T-002 + T-003: recebe o documento, extrai, compara com o
  perfil e com o endereço do condomínio, decide entre
  `verified | manual_review | rejected`, persiste a decisão e os scores.
  Registrar sempre os scores mesmo quando aprova — sem isso não há como
  calibrar os limiares de Q-002 depois. Publicar evento no RabbitMQ
  (`VERIFICATION_DECIDED`) seguindo o padrão de `mural.events.ts`.

## T-006 — Guard de morador verificado nas rotas do condomínio [pendente]

- Refs: US-002, AC-005, AC-006, AC-007
- Arquivos: src/common/guards/verified-resident.guard.ts, src/common/guards/verified-resident.guard.spec.ts, src/services/services.controller.ts, src/appointments/appointments.controller.ts
- Notas: Guard que exige `residencyStatus = 'verified'`. Aplicar em
  `GET /services`, `POST /services` e `POST /appointments`. Cuidado: NÃO
  aplicar nas rotas de perfil, termos e da própria verificação, senão o usuário
  fica preso sem conseguir se verificar.

## T-007 — Fila de revisão manual [pendente]

- Refs: AC-003, AC-009
- Arquivos: src/users/verification/manual-review.controller.ts, src/users/verification/manual-review.service.ts, src/users/verification/manual-review.service.spec.ts
- Notas: Bloqueada por Q-003 e Q-004 — quem revisa não está decidido. Depende
  de existir um papel de admin/síndico, que hoje o sistema não tem
  (ver backlog BL-002). Enquanto a decisão não vem, expor apenas listagem e
  ação de aprovar/recusar protegidas por uma allowlist de e-mails em env var,
  como ponte deliberada e temporária.

## T-008 — Retenção e expurgo do comprovante (LGPD) [pendente]

- Refs: US-003, AC-008
- Arquivos: src/users/verification/document-retention.scheduler.ts, src/users/verification/document-retention.scheduler.spec.ts
- Notas: Scheduler no mesmo padrão de `appointment-reminder.scheduler.ts`.
  Apaga o arquivo do S3 após o prazo (Q-006) e preenche `purgedAt`, mantendo
  só os metadados da decisão. Também incluir o comprovante no fluxo de
  `deleteAccount` de `users.service.ts` — hoje a anonimização não sabe que ele
  existe. Minimização de dados é Art. 6, III da LGPD: guardar o documento
  além do necessário é passivo jurídico, não recurso.

## T-009 — Tela de verificação no frontend [pendente]

- Refs: US-001, AC-001, AC-002, AC-003, AC-004
- Arquivos: virtual-mural-aws-project/src/app/features/onboarding/verification/verification.component.ts, virtual-mural-aws-project/src/app/features/onboarding/verification/verification.component.html, virtual-mural-aws-project/src/app/core/services/verification-api.service.ts
- Notas: Repositório do frontend. Upload com preview, estados
  (enviando / em análise / aprovado / recusado com motivo), e texto explicando
  por que o documento é pedido e por quanto tempo fica guardado — a
  transparência aqui reduz abandono e é exigência da LGPD. Cobrir o caso
  ASM-004 (comprovante em nome de terceiro) com um caminho explícito na
  interface, não como erro.

## T-010 — Guard de rota e estado de verificação no frontend [pendente]

- Refs: US-002, AC-005, AC-006, AC-007
- Arquivos: virtual-mural-aws-project/src/app/core/guards/verified.guard.ts, virtual-mural-aws-project/src/app/core/guards/verified.guard.spec.ts, virtual-mural-aws-project/src/app/core/services/onboarding.service.ts
- Notas: Repositório do frontend. Estender `OnboardingProfile` com
  `residencyStatus`. Importante: o guard é só UX — a decisão real é a do
  backend (T-006). Hoje `onboarding.service.ts` confia no `localStorage` para
  decidir se o onboarding terminou, o que é manipulável pelo usuário; a
  verificação NÃO pode herdar esse padrão.
