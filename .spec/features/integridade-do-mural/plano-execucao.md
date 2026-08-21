# Plano de execução — integridade-do-mural

> gerado por `onp-spec plano` em 2026-08-21 15:55 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano integridade-do-mural`

## Resumo — o que vai acontecer

- **3 tarefa(s) pendente(s)**: 3 em 3 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- tudo acontece na branch de trabalho `spec/integridade-do-mural`; mesclagens voltam para ela; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/integridade-do-mural-faixa-1` — worktree `../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-1`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-011 | Fronteira do condomínio nos serviços | `claude-sonnet-5` | medium | `src/services/services.controller.ts`, `src/services/services.service.ts`, `src/services/services.service.spec.ts`, `src/services/services.controller.spec.ts` |

#### faixa-2 — branch `spec/integridade-do-mural-faixa-2` — worktree `../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-2`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-012 | Fronteira do condomínio e data no passado no agendamento | `claude-sonnet-5` | medium | `src/appointments/services/appointment-creation.service.ts`, `src/appointments/services/appointment-creation.service.spec.ts` |

#### faixa-3 — branch `spec/integridade-do-mural-faixa-3` — worktree `../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-3`

| tarefa | título | modelo | esforço | arquivos |
|---|---|---|---|---|
| T-013 | Avaliação exige atendimento concluído | `claude-sonnet-5` | medium | `src/reviews/reviews.service.ts`, `src/reviews/reviews.service.spec.ts`, `src/reviews/reviews.module.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/integridade-do-mural` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify integridade-do-mural` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Automático — Claude Code headless (recomendado)

```bash
bash .spec/features/integridade-do-mural/executar-tarefas.sh
```

Ou abra `.spec/features/integridade-do-mural/plano-execucao.html` no navegador e use o botão
**“Executar todas as tarefas em janelas limpas e paralelas”** (copia o comando acima).

Cada faixa roda `claude -p` com **janela de contexto limpa**, `--model` e `--effort` já
definidos por tarefa, permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/virtual-mural-backend-integridade-do-mural-logs/`.

### 👀 Acompanhe ao vivo, sem digitar comandos

```bash
onp-spec painel integridade-do-mural
```

Abre um painel no navegador com as faixas em tempo real, o log de cada uma
rolando ao vivo, o veredito do gate — e o botão **"Executar todas as tarefas
em janelas limpas e paralelas"** que aqui executa DE VERDADE (o servidor é
local, então pode disparar o script por você).

