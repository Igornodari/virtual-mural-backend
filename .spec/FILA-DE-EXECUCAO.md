# Fila de execução

> Fonte de verdade **operacional** desta sessão e das próximas.
> Formato desenhado para o agente executar, não para humano importar.
>
> O `.spec/jira/` continua existindo caso um dia o conector do Atlassian
> funcione, mas **não é mais o mecanismo** — nada aqui depende dele.

## Como esta fila funciona

Cada item vira uma feature do onp-spec no momento em que entra em execução —
não antes. Especificar tudo de uma vez encheria o `audit --ci` de critérios de
aceite sem teste, e o gate perderia o sentido: ele passaria a acusar trabalho
planejado em vez de trabalho quebrado.

O ciclo por item é sempre o mesmo:

```
onp-spec new <feature>   →  escrever histórias e critérios de aceite
                         →  implementar até os testes passarem
                         →  onp-spec verify <feature>   (o runner decide)
                         →  onp-spec audit              (o gate decide)
                         →  commit + push
```

Um item só sai da fila com prova PASS registrada. "Achei que funcionou" não
tira nada daqui.

## Estado

| Onda | Item | Feature onp-spec | Estado |
|---|---|---|---|
| 0 | Fronteira do condomínio nos serviços | `integridade-do-mural` | ✅ provado (AC-010..012) |
| 0 | Fronteira e data no agendamento | `integridade-do-mural` | ✅ provado (AC-013, AC-016) |
| 0 | Avaliação exige atendimento concluído | `integridade-do-mural` | ✅ provado (AC-014, AC-015) |
| 0 | Idempotência do webhook do Stripe | `webhook-idempotente` | ✅ provado (AC-017..020) |
| 0 | Sentry do frontend religado | `observabilidade-do-frontend` | ✅ provado (AC-021..024) — falta só o valor do DSN |
| 0 | Remover criptografia decorativa | constituição `P-003` | ✅ removida e proibida |
| 0 | Remover `console.log` de produção | constituição `P-004` | ✅ removido e proibido |
| 0 | Papel de administrador e síndico | `papel-de-administrador` | ✅ provado (AC-021..027) |
| 1 | Estorno e cancelamento | `estorno-de-agendamento` | ⬜ fila |
| 1 | Taxa da plataforma numa fonte só | `taxa-unica` | ⬜ fila |
| 1 | Saldo do prestador sem conta Connect | `saldo-sem-connect` | ⬜ fila |
| 1 | Denúncia e moderação | `moderacao-de-conteudo` | 🔜 desbloqueada — reusa AdminAuthorizationService |
| 2 | Base de condomínios deduplicada | `curadoria-de-condominios` | ⬜ fila |
| 2 | Número da unidade no cadastro | `verificacao-morador` (T-001) | ⬜ fila |
| 2 | Verificação de morador — fase 1 | `verificacao-morador` | ⬜ especificada, não construída |
| 3 | Destaque pago para prestador | `destaque-pago` | ⬜ fila |
| 3 | Service worker de cache | `pwa-instalavel` | ⬜ fila |
| 3 | Publicar como TWA | `pwa-instalavel` | ⬜ fila (depende de estorno) |
| 4 | Tokens de breakpoint | `fundacao-responsiva` | ⬜ fila |
| 4 | Responsividade do funil | `fundacao-responsiva` | ⬜ fila |
| 4 | Piso de cobertura na CI | — (config, sem feature) | ⬜ fila |
| 4 | CSP de Report-Only para bloqueante | — (config, sem feature) | ⬜ fila |
| 4 | Verificador de segredos na CI | — (config, sem feature) | ⬜ fila |
| 4 | **Baseline das migrations** — hoje um banco zerado não sobe pela cadeia | `baseline-de-migrations` | ⬜ fila |

## Achado que ainda não virou feature

**As migrations não reconstroem um banco do zero.** Descoberto ao montar o
ambiente local para testar o estorno:

- Migrations puras falham na primeira — não existe migration que crie as
  tabelas base. O schema nasceu de `synchronize: true` e o histórico só tem
  alterações incrementais a partir dali.
- `synchronize` seguido das migrations também falha: `AddIsProviderToUsers`
  referencia `roleInCondominium`, coluna que uma migration posterior removeu e
  que não existe mais nas entidades.

Consequência: o banco de produção não pode ser recriado a partir do código, e
ambiente novo só sobe com `DB_SYNC=true`, ignorando o histórico. As migrations
`Ensure...` e `Fix...` que existem no repositório são provavelmente sintoma
disso.

A saída provável é gerar uma migration de baseline a partir do schema atual e
marcar as antigas como já aplicadas — mas é mudança de risco sobre o banco de
produção e precisa de decisão consciente, não de efeito colateral.

## Fora do meu alcance

Itens que dependem de acesso que eu não tenho neste ambiente. Ficam
registrados para não sumirem, mas não entram na fila:

| Item | Por quê | Quem resolve |
|---|---|---|
| Rotacionar a senha do RabbitMQ | Precisa do painel do CloudAMQP e do Railway | Pessoa com acesso à infraestrutura |
| Configurar `SENTRY_DSN` no backend | Variável de ambiente no Railway | idem |
| WhatsApp via Twilio | Aprovação do sandbox | idem |

Nota: o Sentry do **frontend** não está nesta lista — lá o DSN é embutido no
build, então é mudança de código e eu consigo fazer.

## Decisões de produto pendentes

Nenhuma delas bloqueia a fila atual. Quando o item que depende delas chegar,
eu implemento a alternativa mais conservadora e registro a suposição na spec,
em vez de parar e esperar.

| Pergunta | Trava qual item | Alternativa conservadora que eu adoto |
|---|---|---|
| Avaliações antigas sem agendamento: remover, ocultar ou manter? | nenhum (a trava nova só vale para novas) | manter, e registrar como suposição |
| Prazo para avaliar após o atendimento | nenhum | sem prazo |
| Grandfathering da base atual na verificação | `verificacao-morador` | flag de configuração, default: exige verificação só de cadastros novos |
| Quem faz a revisão manual | `verificacao-morador` | allowlist de e-mails em variável de ambiente, como ponte temporária |
| Prazo de retenção do comprovante | `verificacao-morador` | 90 dias, configurável |
