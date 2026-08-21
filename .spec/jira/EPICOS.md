# Épicos e tarefas — projeto SCRUM

> Gerado a partir de `.spec/PLANO-DESENVOLVIMENTO.md` em 21/08/2026.
> Para importar: Jira → Configurações do projeto → Importar → CSV,
> usando `jira-import.csv` nesta mesma pasta.

**6 épicos · 36 tarefas**

As chaves entre colchetes (`P0-1`, `P4-13`) são os identificadores do plano de desenvolvimento, mantidos na descrição para rastrear de volta. Elas não são chaves do Jira — o Jira vai gerar as suas próprias na importação.

---

## E1 — Isolamento e confiança do condomínio

*Garantir que o mural seja de fato do condomínio: ninguém lê nem escreve dados de um condomínio ao qual não pertence, e a reputação exibida corresponde a serviços realmente contratados.*

**6 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🔴 Highest | `P0-1` | Story | Isolar dados por condomínio nas rotas de serviço, agendamento e avaliação | 3d |
| 🔴 Highest | `P0-2` | Story | Criar papel de administrador e proteger o CRUD de condomínio | 5d |
| 🔴 Highest | `P0-3` | Story | Exigir agendamento concluído para avaliar um serviço | 2d |
| 🟠 High | `P0-4` | Bug | Bloquear criação de agendamento com data no passado | 2h |
| 🟠 High | `P2-1` | Task | Deduplicar e curar a base de condomínios | 5d |
| 🟠 High | `P2-2` | Task | Adicionar número da unidade (apartamento e bloco) ao cadastro | 1d |

---

## E2 — Integridade do dinheiro

*Existir caminho de volta para o dinheiro, e a comissão cobrada virar margem conhecida e configurável num único lugar.*

**5 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🔴 Highest | `P1-1` | Story | Implementar estorno e política de cancelamento | 1sem |
| 🟠 High | `P1-2` | Bug | Unificar a taxa da plataforma numa única fonte de configuração | 1d |
| 🟠 High | `P1-3` | Story | Rever o modelo de cobrança para a comissão virar margem | 5d |
| 🟠 High | `P1-4` | Story | Tratar o saldo do prestador sem conta Connect | 3d |
| 🟠 High | `P0-5` | Bug | Adicionar idempotência ao webhook do Stripe | 1d |

---

## E3 — Verificação de morador

*Transformar a premissa do produto em fato verificável: o morador comprova que mora no endereço antes de ter acesso completo ao mural.*

**3 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🔴 Highest | `P2-3` | Story | Verificação de morador — Fase 1 (envio e revisão manual) | 3sem |
| 🟡 Medium | `P2-4` | Task | Liberar a câmera na Permissions-Policy | 15min |
| 🟡 Medium | `P2-5` | Story | Verificação de morador — Fase 2 (OCR e comparação automática) | 2sem |

---

## E4 — Receita e distribuição

*Criar fonte de receita que não dependa da comissão por serviço e levar o app para a Play Store.*

**5 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🟠 High | `P3-1` | Story | Destaque pago para prestador | 1sem |
| 🟡 Medium | `P3-2` | Task | Service worker de cache e app instalável | 3d |
| 🟡 Medium | `P3-3` | Story | Publicar na Play Store como TWA | 5d |
| 🟠 High | `P3-4` | Story | Plano do condomínio (B2B) | 4sem |
| 🟠 High | `P1-5` | Story | Canal de denúncia e moderação de conteúdo | 4d |

---

## E5 — Qualidade, UX e dívida técnica

*Responsividade do funil, cobertura de teste com piso, e a dívida acumulada que não bloqueia mas incomoda.*

**12 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🟠 High | `P4-1` | Task | Criar tokens e mixins de breakpoint e convergir os valores órfãos | 3d |
| 🟠 High | `P4-2` | Story | Responsividade do funil que converte em receita | 1sem |
| 🟡 Medium | `P4-3` | Story | Responsividade das telas de conta | 5d |
| 🟠 High | `P4-4` | Task | Definir piso de cobertura e remover --passWithNoTests | 1d |
| 🟡 Medium | `P4-5` | Task | Promover a CSP de Report-Only para bloqueante | 1d |
| 🟡 Medium | `P4-6` | Story | Completar o dark mode | 5d |
| 🟢 Low | `P4-7` | Task | Cache HTTP no frontend | 3d |
| 🟢 Low | `P4-8` | Task | Revisar chaves de i18n faltantes | 4h |
| 🟡 Medium | `P4-9` | Story | Foto de perfil: importar do Google e permitir upload | 3d |
| 🟡 Medium | `P4-10` | Task | Remover snackbars de erro global | 4h |
| 🟢 Low | `P4-11` | Bug | Corrigir alinhamento do label de WhatsApp | 1h |
| 🟢 Low | `P4-12` | Task | Atualizar a versão do app | 15min |

---

## E6 — Observabilidade e segurança operacional

*Enxergar o que quebra em produção e fechar as exposições operacionais conhecidas.*

**5 tarefas**

| Prio | ID | Tipo | Tarefa | Est. |
|---|---|---|---|---|
| 🔴 Highest | `P0-6` | Bug | Religar o Sentry no frontend | 2h |
| 🟡 Medium | `P0-7` | Task | Remover a criptografia decorativa do navegador | 2h |
| 🟡 Medium | `P0-8` | Bug | Remover console.log de produção | 15min |
| 🟠 High | `P0-9` | Task | Rotacionar a senha do RabbitMQ | 2h |
| 🟡 Medium | `P4-13` | Task | Adicionar verificador de segredos na esteira de CI | 15min |

---

## Ordem de execução

A prioridade dentro do Jira não expressa dependência. A sequência do plano é:

```
1º  P0-8, P0-6, P0-4, P0-7, P0-5, P0-9   itens de horas, alto retorno
2º  P0-1, P0-3                            fecha o vazamento entre condomínios
3º  P0-2, P1-2                            papel de admin e taxa unificada
4º  P1-1, P1-4                            caminho de volta do dinheiro
5º  P2-1, P2-2, P2-4                      prepara a verificação
6º  P2-3                                  verificação de morador
7º  P3-1, P3-2, P3-3                      receita e loja
```

O épico E5 (qualidade e UX) corre em paralelo — não bloqueia nem é bloqueado.

## Dependências que importam

| Tarefa | Depende de | Por quê |
|---|---|---|
| `P2-3` verificação | `P0-1`, `P2-1`, `P2-2` | Sem isolamento o dado vaza de qualquer jeito; sem base limpa a comparação valida contra endereço errado |
| `P3-4` plano B2B | `P0-2`, `P2-3` | O síndico precisa existir como papel, e a verificação é a substância da proposta comercial |
| `P3-3` Play Store | `P1-1`, `P3-2` | App que cobra sem estorno vira alvo de remoção |
| `P1-5` moderação | `P0-2` | Precisa existir quem modere |
| `P1-3` modelo de cobrança | `P1-2` | Unificar a taxa antes de mexer em como ela é cobrada |
| `P4-2`, `P4-3` responsividade | `P4-1` | Os tokens de breakpoint são a fundação |

## Decisões de produto em aberto

Estas travam o desenho de `P2-3` e não são técnicas:

1. Os usuários já cadastrados entram como verificados, ou todos passam pelo fluxo?
2. Quem faz a revisão manual — a plataforma, o síndico, ou vizinhos já verificados?
3. Por quanto tempo o comprovante fica guardado?

Estão registradas como `Q-001` a `Q-007` em `.spec/features/verificacao-morador/spec.md`.
