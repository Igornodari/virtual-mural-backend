# Plano de execução — papel-de-administrador

> gerado por `onp-spec plano` em 2026-08-21 17:34 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano papel-de-administrador`

## Resumo — o que vai acontecer

- **4 tarefa(s) pendente(s)**: 4 em 4 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- tudo acontece na branch de trabalho `spec/papel-de-administrador`; mesclagens voltam para ela; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/papel-de-administrador-faixa-1` — worktree `../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-016 | Papéis no modelo de usuário | `claude-sonnet-5` | medium | `src/users/entities/user.entity.ts`, `src/condominiums/entities/condominium.entity.ts`, `src/database/migrations/1790200000000-AddAdminRoles.ts` |

#### faixa-2 — branch `spec/papel-de-administrador-faixa-2` — worktree `../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-017 | Serviço de autorização administrativa | `claude-sonnet-5` | medium | `src/common/authorization/admin-authorization.service.ts`, `src/common/authorization/admin-authorization.service.spec.ts` |

#### faixa-3 — branch `spec/papel-de-administrador-faixa-3` — worktree `../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-018 | Proteção do CRUD de condomínio | `claude-sonnet-5` | medium | `src/condominiums/condominiums.controller.ts`, `src/condominiums/condominiums.service.ts`, `src/condominiums/condominiums.controller.spec.ts`, `src/condominiums/condominiums.service.spec.ts`, `src/condominiums/condominiums.module.ts` |

### Onda 2 — faixa-4

#### faixa-4 — branch `spec/papel-de-administrador-faixa-4` — worktree `../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-4`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-019 | Listagem de moradores pelo síndico | `claude-sonnet-5` | medium | `src/users/users.controller.ts`, `src/users/users.service.ts`, `src/users/users.controller.spec.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/papel-de-administrador` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify papel-de-administrador` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Automático — Claude Code headless (recomendado)

```bash
bash .spec/features/papel-de-administrador/executar-tarefas.sh
```

Ou abra `.spec/features/papel-de-administrador/plano-execucao.html` no navegador e use o botão
**“Executar todas as tarefas em janelas limpas e paralelas”** (copia o comando acima).

Cada faixa roda `claude -p` com **janela de contexto limpa**, `--model` e `--effort` já
definidos por tarefa, permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/virtual-mural-backend-papel-de-administrador-logs/`.

### 👀 Acompanhe ao vivo, sem digitar comandos

```bash
onp-spec painel papel-de-administrador
```

Abre um painel no navegador com as faixas em tempo real, o log de cada uma
rolando ao vivo, o veredito do gate — e o botão **"Executar todas as tarefas
em janelas limpas e paralelas"** que aqui executa DE VERDADE (o servidor é
local, então pode disparar o script por você).

