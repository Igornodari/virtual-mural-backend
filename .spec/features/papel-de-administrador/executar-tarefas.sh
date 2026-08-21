#!/usr/bin/env bash
# executar-tarefas.sh — gerado por `onp-spec plano papel-de-administrador` em 2026-08-21 17:34
# NÃO edite à mão: mudou tasks.md ou a config, regenere o plano.
#
# O que este script faz, na ordem:
#   1. valida o ambiente (git limpo, claude CLI, node, spec commitada)
#   2. garante a branch de trabalho spec/papel-de-administrador
#   3. por onda: 1 worktree + 1 branch por faixa, e `claude -p` em
#      paralelo — cada faixa numa janela de contexto LIMPA
#   4. mescla cada faixa de volta (--no-ff) e marca as tarefas [concluida]
#   5. tarefas sem Arquivos: rodam uma a uma na árvore principal
#   6. gate final: onp-spec verify papel-de-administrador + onp-spec audit --ci
set -u
set -o pipefail

FEATURE='papel-de-administrador'
BASE_BRANCH='spec/papel-de-administrador'
ENGINE='.claude/skills/onp-spec-driven/scripts/onp-spec.mjs'
CLAUDE_FLAGS=(--permission-mode acceptEdits --allowedTools 'Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(npm:*)')
FALHAS=""

verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
info()     { printf '· %s\n' "$*"; }
falhar()   { vermelho "✘ $*"; exit 1; }
# trilha de eventos para o painel ao vivo (`onp-spec painel <feature>`)
evento()   { [ -n "${EVENTOS:-}" ] && printf '%s|%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$EVENTOS"; }

# ── 1. ambiente ──────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || falhar "git não encontrado"
command -v node >/dev/null 2>&1 || falhar "node não encontrado"
command -v claude >/dev/null 2>&1 || falhar "Claude Code CLI (claude) não encontrado — instale-o ou siga o modo manual em plano-execucao.md"
TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null) || falhar "fora de um repositório git"
cd "$TOPLEVEL" || exit 1
# artefatos recém-gerados pelo `onp-spec plano` são sujeira esperada:
# se forem a ÚNICA sujeira, o script mesmo commita; qualquer outra, aborta
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$(git status --porcelain | grep -v -e 'plano-execucao\.' -e 'plano\.json' -e 'executar-tarefas\.sh')" ]; then
    git add -A
    git commit -q -m "plano de execução: $FEATURE (artefatos gerados)"
    info "artefatos do plano commitados"
  else
    falhar "árvore suja além dos artefatos do plano — commite ou faça git stash antes (os worktrees partem do último commit)"
  fi
fi
git ls-files --error-unmatch -- '.spec/features/papel-de-administrador/spec.md' >/dev/null 2>&1 || falhar "spec.md não está commitada — os worktrees das faixas precisam dela no git"
ATUAL=$(git rev-parse --abbrev-ref HEAD)
[ "$ATUAL" != "HEAD" ] || falhar "HEAD destacado — troque para uma branch"

# ── 2. branch de trabalho ────────────────────────────────────────
if [ "$ATUAL" != "$BASE_BRANCH" ]; then
  if git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
    git checkout -q "$BASE_BRANCH" || falhar "não consegui trocar para $BASE_BRANCH"
  else
    git checkout -q -b "$BASE_BRANCH" || falhar "não consegui criar $BASE_BRANCH"
  fi
  info "branch de trabalho: $BASE_BRANCH (a partir de $ATUAL)"
fi
git worktree prune
LOG_DIR="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-papel-de-administrador-logs"
mkdir -p "$LOG_DIR"
EVENTOS="$LOG_DIR/plano-eventos.log"
: > "$EVENTOS"
evento "inicio|$FEATURE"
info "logs por faixa em: $LOG_DIR"
info "acompanhe ao vivo: onp-spec painel papel-de-administrador"

mesclar_faixa() { # $1=faixa $2=branch $3=worktree $4=exit-da-faixa
  if [ "$4" -ne 0 ]; then
    evento "faixa|$1|falhou"
    vermelho "✘ $1 falhou (log: $LOG_DIR/$1.log) — worktree mantido para inspeção: $3"
    FALHAS="$FALHAS $1"; return 1
  fi
  if git merge --no-ff "$2" -m "merge $1 ($FEATURE)"; then
    git worktree remove --force "$3" >/dev/null 2>&1
    git branch -d "$2" >/dev/null 2>&1
    evento "faixa|$1|mesclada"
    verde "✔ $1 mesclada em $BASE_BRANCH"
  else
    git merge --abort >/dev/null 2>&1
    evento "faixa|$1|conflito"
    vermelho "✘ conflito ao mesclar $1 — resolva na mão: git merge $2 (worktree mantido: $3)"
    FALHAS="$FALHAS $1"; return 1
  fi
}

# ── onda 1: faixa-1 (T-016) ∥ faixa-2 (T-017) ∥ faixa-3 (T-018) ──
evento "onda|1|inicio"
info "onda 1: faixa-1 ∥ faixa-2 ∥ faixa-3 — janelas limpas em paralelo"
WT_FAIXA_1="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-1"
git worktree add "$WT_FAIXA_1" -b 'spec/papel-de-administrador-faixa-1' >/dev/null || falhar "worktree da faixa-1 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-1)"
evento "faixa|faixa-1|executando"
(
  cd "$WT_FAIXA_1" || exit 9
  claude -p 'Você executa UMA tarefa da feature "papel-de-administrador" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/papel-de-administrador/spec.md, .spec/features/papel-de-administrador/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-016 — "Papéis no modelo de usuário"
  critérios/refs: AC-021 (Morador comum não altera o condomínio), AC-025 (Quem cria um condomínio fica registrado)
  arquivos permitidos (e seus testes): src/users/entities/user.entity.ts, src/condominiums/entities/condominium.entity.ts, src/database/migrations/1790200000000-AddAdminRoles.ts
  mensagem de commit: "T-016 papel-de-administrador: Papéis no modelo de usuário"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-1.log" 2>&1 &
PID_FAIXA_1=$!
WT_FAIXA_2="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-2"
git worktree add "$WT_FAIXA_2" -b 'spec/papel-de-administrador-faixa-2' >/dev/null || falhar "worktree da faixa-2 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-2)"
evento "faixa|faixa-2|executando"
(
  cd "$WT_FAIXA_2" || exit 9
  claude -p 'Você executa UMA tarefa da feature "papel-de-administrador" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/papel-de-administrador/spec.md, .spec/features/papel-de-administrador/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-017 — "Serviço de autorização administrativa"
  critérios/refs: AC-021 (Morador comum não altera o condomínio), AC-022 (Síndico administra o próprio condomínio), AC-023 (Síndico não administra condomínio alheio), AC-024 (Administrador da plataforma administra qualquer condomínio)
  arquivos permitidos (e seus testes): src/common/authorization/admin-authorization.service.ts, src/common/authorization/admin-authorization.service.spec.ts
  mensagem de commit: "T-017 papel-de-administrador: Serviço de autorização administrativa"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-2.log" 2>&1 &
PID_FAIXA_2=$!
WT_FAIXA_3="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-3"
git worktree add "$WT_FAIXA_3" -b 'spec/papel-de-administrador-faixa-3' >/dev/null || falhar "worktree da faixa-3 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-3)"
evento "faixa|faixa-3|executando"
(
  cd "$WT_FAIXA_3" || exit 9
  claude -p 'Você executa UMA tarefa da feature "papel-de-administrador" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/papel-de-administrador/spec.md, .spec/features/papel-de-administrador/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-018 — "Proteção do CRUD de condomínio"
  critérios/refs: AC-021 (Morador comum não altera o condomínio), AC-022 (Síndico administra o próprio condomínio), AC-023 (Síndico não administra condomínio alheio), AC-024 (Administrador da plataforma administra qualquer condomínio), AC-025 (Quem cria um condomínio fica registrado)
  arquivos permitidos (e seus testes): src/condominiums/condominiums.controller.ts, src/condominiums/condominiums.service.ts, src/condominiums/condominiums.controller.spec.ts, src/condominiums/condominiums.service.spec.ts, src/condominiums/condominiums.module.ts
  mensagem de commit: "T-018 papel-de-administrador: Proteção do CRUD de condomínio"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-3.log" 2>&1 &
PID_FAIXA_3=$!
wait "$PID_FAIXA_1"; ST_FAIXA_1=$?
evento "faixa|faixa-1|exit|$ST_FAIXA_1"
wait "$PID_FAIXA_2"; ST_FAIXA_2=$?
evento "faixa|faixa-2|exit|$ST_FAIXA_2"
wait "$PID_FAIXA_3"; ST_FAIXA_3=$?
evento "faixa|faixa-3|exit|$ST_FAIXA_3"
if mesclar_faixa 'faixa-1' 'spec/papel-de-administrador-faixa-1' "$WT_FAIXA_1" "$ST_FAIXA_1"; then
  node "$ENGINE" tarefa "$FEATURE" T-016 concluida || true
  evento "tarefa|T-016|concluida"
fi
if mesclar_faixa 'faixa-2' 'spec/papel-de-administrador-faixa-2' "$WT_FAIXA_2" "$ST_FAIXA_2"; then
  node "$ENGINE" tarefa "$FEATURE" T-017 concluida || true
  evento "tarefa|T-017|concluida"
fi
if mesclar_faixa 'faixa-3' 'spec/papel-de-administrador-faixa-3' "$WT_FAIXA_3" "$ST_FAIXA_3"; then
  node "$ENGINE" tarefa "$FEATURE" T-018 concluida || true
  evento "tarefa|T-018|concluida"
fi

# ── onda 2: faixa-4 (T-019) ──
evento "onda|2|inicio"
info "onda 2: faixa-4 — janelas limpas em paralelo"
WT_FAIXA_4="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-4"
git worktree add "$WT_FAIXA_4" -b 'spec/papel-de-administrador-faixa-4' >/dev/null || falhar "worktree da faixa-4 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-papel-de-administrador-faixa-4)"
evento "faixa|faixa-4|executando"
(
  cd "$WT_FAIXA_4" || exit 9
  claude -p 'Você executa UMA tarefa da feature "papel-de-administrador" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/papel-de-administrador/spec.md, .spec/features/papel-de-administrador/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-019 — "Listagem de moradores pelo síndico"
  critérios/refs: AC-026 (Síndico lista os moradores do próprio condomínio), AC-027 (Síndico não lista moradores de outro condomínio)
  arquivos permitidos (e seus testes): src/users/users.controller.ts, src/users/users.service.ts, src/users/users.controller.spec.ts
  mensagem de commit: "T-019 papel-de-administrador: Listagem de moradores pelo síndico"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-4.log" 2>&1 &
PID_FAIXA_4=$!
wait "$PID_FAIXA_4"; ST_FAIXA_4=$?
evento "faixa|faixa-4|exit|$ST_FAIXA_4"
if mesclar_faixa 'faixa-4' 'spec/papel-de-administrador-faixa-4' "$WT_FAIXA_4" "$ST_FAIXA_4"; then
  node "$ENGINE" tarefa "$FEATURE" T-019 concluida || true
  evento "tarefa|T-019|concluida"
fi

# ── gate final: quem decide é a máquina ──────────────────────────
echo
info "gate final: verify + audit --ci"
evento "gate|inicio"
node "$ENGINE" verify "$FEATURE"
evento "gate|verify|$?"
node "$ENGINE" audit --ci
AUDIT=$?
evento "gate|audit|$AUDIT"
# fecha a contabilidade: status das tarefas + prova do verify no git
if [ -n "$(git status --porcelain -- '.spec')" ]; then
  git add -A -- '.spec'
  git commit -q -m "$FEATURE: status das tarefas + prova do verify (plano)"
  info "status das tarefas e prova do verify commitados"
fi
echo
if [ -n "$FALHAS" ]; then vermelho "faixas/tarefas com falha:$FALHAS"; fi
if [ "$AUDIT" -eq 0 ] && [ -z "$FALHAS" ]; then
  evento "fim|0"
  verde "✔ plano concluído — especificação e código alinhados (audit exit 0) na branch $BASE_BRANCH"
  info "próximo passo: revise e leve para a main quando quiser (git merge $BASE_BRANCH)"
  exit 0
fi
evento "fim|1"
vermelho "plano terminou com pendências — leia a saída do audit acima e os logs em $LOG_DIR"
exit 1
