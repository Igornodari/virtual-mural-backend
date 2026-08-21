# Tasks: Papel de administrador e síndico

> feature: papel-de-administrador

## T-016 — Papéis no modelo de usuário [concluida]
- Refs: US-011, US-012, AC-021, AC-025
- Arquivos: src/users/entities/user.entity.ts, src/condominiums/entities/condominium.entity.ts, src/database/migrations/1790200000000-AddAdminRoles.ts
- Notas: Duas flags aditivas no usuário — `isPlatformAdmin` e `isCondoManager` —
  e não um enum de papel exclusivo. O projeto já removeu por migration um
  `roleInCondominium` exclusivo justamente porque papéis se acumulam: síndico
  continua sendo morador e pode ser prestador (ASM-017).
  O síndico é sempre do condomínio ao qual já está vinculado — não há coluna
  separada de condomínio administrado (ASM-016).
  No condomínio, `createdById` registra quem criou (AC-025), nullable para os
  registros que já existem.
  Migration idempotente (`ADD COLUMN IF NOT EXISTS`), no padrão das `Ensure...`
  do projeto.

## T-017 — Serviço de autorização administrativa [concluida]
- Refs: US-011, AC-021, AC-022, AC-023, AC-024
- Arquivos: src/common/authorization/admin-authorization.service.ts, src/common/authorization/admin-authorization.service.spec.ts
- Notas: Uma função só, `assertPodeAdministrarCondominio(user, condominiumId)`,
  com a regra inteira num lugar:
  administrador da plataforma passa sempre; síndico passa se o condomínio for o
  dele; todo o resto é recusado.
  Fica isolado do controller para poder ser testado exaustivamente sem HTTP, e
  para que a moderação e a fila de revisão reusem a mesma regra depois em vez
  de reimplementá-la.
  Ausência de dado nega: usuário sem condomínio, condomínio nulo, síndico sem
  vínculo — todos recusados, nunca liberados por omissão.

## T-018 — Proteção do CRUD de condomínio [concluida]
- Refs: US-011, US-012, AC-021, AC-022, AC-023, AC-024, AC-025
- Arquivos: src/condominiums/condominiums.controller.ts, src/condominiums/condominiums.service.ts, src/condominiums/condominiums.controller.spec.ts, src/condominiums/condominiums.service.spec.ts, src/condominiums/condominiums.module.ts
- Notas: `update` e `remove` passam a exigir autorização administrativa.
  `create` continua aberta a morador autenticado (ASM-019) — fechá-la agora
  quebraria o onboarding, que cria o condomínio quando ele não existe — mas
  passa a gravar `createdById`.
  Cuidado: `condominiums.service.ts` é chamado pelo onboarding; a checagem
  entra no caminho da rota, não dentro dos métodos que o onboarding reusa.

## T-019 — Listagem de moradores pelo síndico [concluida]
- Refs: US-013, AC-026, AC-027
- Arquivos: src/users/users.controller.ts, src/users/users.service.ts, src/users/users.controller.spec.ts
- Notas: Expor a listagem de moradores por condomínio, protegida pela mesma
  regra do T-017. O `findAllByCondominium` já existe em `users.service.ts` e
  hoje não tem rota — é só expor com a proteção certa.
  Devolver o mínimo necessário: identificação e vínculo, não o registro
  completo do usuário. Acesso amplo a dado pessoal precisa de justificativa de
  finalidade sob a LGPD (Q-017 segue em aberto).
