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
| 0 | Idempotência do webhook do Stripe | `webhook-idempotente` | 🔄 em execução |
| 0 | Sentry do frontend religado | `observabilidade-do-frontend` | ⬜ próximo |
| 0 | Remover criptografia decorativa | `observabilidade-do-frontend` | ⬜ próximo |
| 0 | Remover `console.log` de produção | `observabilidade-do-frontend` | ⬜ próximo |
| 0 | Papel de administrador e síndico | `papel-de-administrador` | ⬜ fila |
| 1 | Estorno e cancelamento | `estorno-de-agendamento` | ⬜ fila |
| 1 | Taxa da plataforma numa fonte só | `taxa-unica` | ⬜ fila |
| 1 | Saldo do prestador sem conta Connect | `saldo-sem-connect` | ⬜ fila |
| 1 | Denúncia e moderação | `moderacao-de-conteudo` | ⬜ fila (depende de admin) |
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
