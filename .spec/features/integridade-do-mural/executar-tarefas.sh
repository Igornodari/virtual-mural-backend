#!/usr/bin/env bash
# executar-tarefas.sh — gerado por `onp-spec plano integridade-do-mural` em 2026-08-21 15:55
# NÃO edite à mão: mudou tasks.md ou a config, regenere o plano.
#
# O que este script faz, na ordem:
#   1. valida o ambiente (git limpo, claude CLI, node, spec commitada)
#   2. garante a branch de trabalho spec/integridade-do-mural
#   3. por onda: 1 worktree + 1 branch por faixa, e `claude -p` em
#      paralelo — cada faixa numa janela de contexto LIMPA
#   4. mescla cada faixa de volta (--no-ff) e marca as tarefas [concluida]
#   5. tarefas sem Arquivos: rodam uma a uma na árvore principal
#   6. gate final: onp-spec verify integridade-do-mural + onp-spec audit --ci
set -u
set -o pipefail

FEATURE='integridade-do-mural'
BASE_BRANCH='spec/integridade-do-mural'
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
git ls-files --error-unmatch -- '.spec/features/integridade-do-mural/spec.md' >/dev/null 2>&1 || falhar "spec.md não está commitada — os worktrees das faixas precisam dela no git"
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
LOG_DIR="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-integridade-do-mural-logs"
mkdir -p "$LOG_DIR"
EVENTOS="$LOG_DIR/plano-eventos.log"
: > "$EVENTOS"
evento "inicio|$FEATURE"
info "logs por faixa em: $LOG_DIR"
info "acompanhe ao vivo: onp-spec painel integridade-do-mural"

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

# ── onda 1: faixa-1 (T-011) ∥ faixa-2 (T-012) ∥ faixa-3 (T-013) ──
evento "onda|1|inicio"
info "onda 1: faixa-1 ∥ faixa-2 ∥ faixa-3 — janelas limpas em paralelo"
WT_FAIXA_1="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-1"
git worktree add "$WT_FAIXA_1" -b 'spec/integridade-do-mural-faixa-1' >/dev/null || falhar "worktree da faixa-1 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-1)"
evento "faixa|faixa-1|executando"
(
  cd "$WT_FAIXA_1" || exit 9
  claude -p 'Você executa UMA tarefa da feature "integridade-do-mural" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/integridade-do-mural/spec.md, .spec/features/integridade-do-mural/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-011 — "Fronteira do condomínio nos serviços"
  critérios/refs: AC-010 (Listar serviços de outro condomínio é negado), AC-011 (Abrir um serviço de outro condomínio é negado), AC-012 (Publicar serviço em condomínio alheio é negado)
  arquivos permitidos (e seus testes): src/services/services.controller.ts, src/services/services.service.ts, src/services/services.service.spec.ts, src/services/services.controller.spec.ts
  mensagem de commit: "T-011 integridade-do-mural: Fronteira do condomínio nos serviços"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-1.log" 2>&1 &
PID_FAIXA_1=$!
WT_FAIXA_2="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-2"
git worktree add "$WT_FAIXA_2" -b 'spec/integridade-do-mural-faixa-2' >/dev/null || falhar "worktree da faixa-2 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-2)"
evento "faixa|faixa-2|executando"
(
  cd "$WT_FAIXA_2" || exit 9
  claude -p 'Você executa UMA tarefa da feature "integridade-do-mural" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/integridade-do-mural/spec.md, .spec/features/integridade-do-mural/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-012 — "Fronteira do condomínio e data no passado no agendamento"
  critérios/refs: AC-013 (Agendar serviço de outro condomínio é negado), AC-016 (Agendamento com data e hora já passadas é recusado)
  arquivos permitidos (e seus testes): src/appointments/services/appointment-creation.service.ts, src/appointments/services/appointment-creation.service.spec.ts
  mensagem de commit: "T-012 integridade-do-mural: Fronteira do condomínio e data no passado no agendamento"

Regras inegociáveis:
- Todo critério de aceite referenciado vira teste com @spec:AC-xxx no título.
- NUNCA enfraqueça, pule (skip/todo) ou apague um teste para passar — teste pulado não é prova e o audit acusa.
- Rode os testes localmente com `npm test -- --json --outputFile=.spec/verification/raw.json` até passarem.
- NÃO edite tasks.md, NÃO rode onp-spec verify/audit e NÃO toque em outras tarefas — o orquestrador cuida disso.
- Ao final de CADA tarefa: `git add` só no que você tocou e um commit próprio.' --model 'claude-sonnet-5' --effort medium "${CLAUDE_FLAGS[@]}"
) > "$LOG_DIR/faixa-2.log" 2>&1 &
PID_FAIXA_2=$!
WT_FAIXA_3="$(dirname "$TOPLEVEL")/onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-3"
git worktree add "$WT_FAIXA_3" -b 'spec/integridade-do-mural-faixa-3' >/dev/null || falhar "worktree da faixa-3 (sobrou de uma execução anterior? git worktree prune + apague ../onp-worktrees/virtual-mural-backend-integridade-do-mural-faixa-3)"
evento "faixa|faixa-3|executando"
(
  cd "$WT_FAIXA_3" || exit 9
  claude -p 'Você executa UMA tarefa da feature "integridade-do-mural" (fluxo onp-spec, spec-anchored).
Leia primeiro: .spec/features/integridade-do-mural/spec.md, .spec/features/integridade-do-mural/tasks.md e .spec/constituicao.md.

Sua tarefa (somente ela):
T-013 — "Avaliação exige atendimento concluído"
  critérios/refs: AC-014 (Avaliar sem ter contratado é negado), AC-015 (Avaliar depois de um atendimento concluído é permitido)
  arquivos permitidos (e seus testes): src/reviews/reviews.service.ts, src/reviews/reviews.service.spec.ts, src/reviews/reviews.module.ts
  mensagem de commit: "T-013 integridade-do-mural: Avaliação exige atendimento concluído"

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
if mesclar_faixa 'faixa-1' 'spec/integridade-do-mural-faixa-1' "$WT_FAIXA_1" "$ST_FAIXA_1"; then
  node "$ENGINE" tarefa "$FEATURE" T-011 concluida || true
  evento "tarefa|T-011|concluida"
fi
if mesclar_faixa 'faixa-2' 'spec/integridade-do-mural-faixa-2' "$WT_FAIXA_2" "$ST_FAIXA_2"; then
  node "$ENGINE" tarefa "$FEATURE" T-012 concluida || true
  evento "tarefa|T-012|concluida"
fi
if mesclar_faixa 'faixa-3' 'spec/integridade-do-mural-faixa-3' "$WT_FAIXA_3" "$ST_FAIXA_3"; then
  node "$ENGINE" tarefa "$FEATURE" T-013 concluida || true
  evento "tarefa|T-013|concluida"
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
