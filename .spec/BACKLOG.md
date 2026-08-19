# Backlog priorizado — Virtual Mural

Levantado em 19/08/2026 a partir da auditoria dos dois repositórios
(`virtual-mural-backend` e `virtual-mural-aws-project`, branch `master`).

A análise completa — incluindo a parte de monetização, Play Store e riscos
legais — está no PDF `analise-virtual-mural.pdf`.

Ordenado por impacto sobre a viabilidade do negócio dividido pelo esforço.
BL-05 e BL-17 estão detalhadas em tarefas executáveis em
`.spec/features/verificacao-morador/tasks.md`.

## Crítico — travam o produto

| ID | Item | Tipo | Esforço | Onde |
|---|---|---|---|---|
| BL-01 | **Isolar dados por condomínio.** `GET /services?condominiumId=` aceita qualquer ID; `findOne` de serviço não checa nada; agendamento exige ter condomínio mas não que seja o mesmo do serviço. | Segurança | 2-3 dias | `services.controller.ts:44`, `services.service.ts:44`, `appointment-creation.service.ts:42` |
| BL-02 | **Criar papel de administrador/síndico.** Hoje qualquer usuário autenticado cria, edita e desativa qualquer condomínio. Não existe conceito de admin no sistema. | Segurança | 3-5 dias | `condominiums.controller.ts:31` |
| BL-03 | **Estorno e política de cancelamento.** Não existe uma única chamada de reembolso no backend. Depois de pago, o cancelamento "deve ser tratado com o prestador" — mas o split já transferiu o dinheiro e é a plataforma que responde no chargeback. | Negócio | 1 semana | `appointment-status.service.ts:114` |
| BL-04 | **Avaliação só após serviço concluído.** Hoje só há trava de avaliação duplicada. Qualquer usuário avalia qualquer serviço sem nunca ter contratado. | Confiança | 1-2 dias | `reviews.service.ts:32` |
| BL-05 | **Verificação de morador — Fase 1.** Envio de comprovante, fila de revisão manual, descarte automático. Extração atrás de interface, com implementação simulada. | Produto | 2-3 semanas | `.spec/features/verificacao-morador/` |

## Alto — margem, operação e conformidade

| ID | Item | Tipo | Esforço | Onde |
|---|---|---|---|---|
| BL-06 | **Corrigir a economia da comissão.** O split usa cobrança com destino (`transfer_data.destination`), então a plataforma paga a taxa de processamento: dos 5% cobrados sobra ~0,6% do valor transacionado. Avaliar cobrança direta, incentivo ao Pix, ou comissão maior. Unificar também as duas fontes de verdade da taxa. | Negócio | 3-5 dias | `stripe-payment-gateway.service.ts:9` e `stripe-connect.service.ts:31` |
| BL-07 | **Saldo do prestador sem conta Connect.** Se o prestador não concluiu o cadastro na Stripe, a plataforma coleta 100% e nenhuma transferência acontece depois. Não há rotina que quite esse saldo. Bloquear a cobrança ou criar o repasse. | Negócio | 2-3 dias | `stripe-payment-gateway.service.ts:63` |
| BL-08 | **Idempotência nos webhooks da Stripe.** O `event.id` não é registrado nem consultado. A Stripe reenvia eventos por desenho. | Correção | 1 dia | `stripe-webhooks.controller.ts:78` |
| BL-09 | **Religar o Sentry no frontend.** `sentryDsn` está vazio em `environments.prod.ts` com um comentário mandando configurar por variável na Vercel — mas o Angular embute o arquivo no build e nada lê variável de ambiente ali. Erro de usuário em produção hoje é invisível. | Operação | 2 horas | `environments.prod.ts:5` |
| BL-10 | **Limpar e curar a base de condomínios.** O onboarding busca por CEP e adota o **primeiro** resultado — e um CEP brasileiro cobre uma rua inteira com vários prédios. Quem não encontra, cria outro. A base tende a virar duplicata e agrupamento errado. É pré-requisito da BL-05: a comparação de endereço bate contra esse dado. | Dado | 3-5 dias | `onboarding.service.ts:160` |
| BL-11 | **Denúncia e moderação de conteúdo.** Conteúdo gerado por usuário (serviço, avaliação) sem caminho de denúncia e remoção. Exigido pelas lojas de aplicativo e proteção sob o Marco Civil. | Jurídico | 3-4 dias | — |
| BL-12 | **Destaque pago para prestador.** Primeira receita recorrente. As métricas de engajamento por serviço já existem no código, o que permite provar o retorno ao prestador com dado real. | Receita | 1 semana | `services.service.ts` (trackMetric) |

## Médio — distribuição e qualidade

| ID | Item | Tipo | Esforço | Onde |
|---|---|---|---|---|
| BL-13 | **Service worker de cache e app instalável.** Existe só o `sw-push.js` (push). Sem cache, o app abre em branco sem rede. | Play Store | 2-3 dias | `public/sw-push.js` |
| BL-14 | **Publicar como TWA.** Empacota o site como app Android via Bubblewrap, sem criar uma segunda base de código. | Play Store | 3-5 dias | — |
| BL-15 | **Piso de cobertura na esteira de CI.** Jest sem `coverageThreshold` e CI rodando com `--passWithNoTests` — a esteira aprova um pacote sem nenhum teste. | Qualidade | 1 dia | `package.json`, `.github/workflows/ci-cd.yml:55` |
| BL-16 | **Remover a criptografia decorativa do navegador.** Chave AES gerada com `Math.random()` e guardada no mesmo `localStorage` do texto cifrado — zero proteção real, com aparência de proteção. | Segurança | 2 horas | `crypto.service.ts:14` |
| BL-17 | **Verificação de morador — Fase 2 (OCR).** Liga a extração automática, comparação de nome e endereço, aprovação instantânea no caminho feliz. | Produto | 2 semanas | `.spec/features/verificacao-morador/` |
| BL-18 | **Plano do condomínio (B2B).** Assinatura paga pelo síndico ou administradora. É o item de maior retorno da análise — e o que mais demora a maturar. Depende da BL-02 e da BL-05. | Receita | 3-4 semanas | — |

## Observações sobre o onp-spec neste repositório

O `onp-spec audit` marca quase todo arquivo existente como "código órfão"
(`ARQUIVO_ORFAO`), porque o código é anterior à especificação. Isso é o
esperado num retrofit. A recomendação é mapear os módulos aos poucos, feature
por feature, e só ligar o `audit --ci` como porta obrigatória de CI quando a
base estiver mapeada — senão a esteira quebra por dívida histórica, não por
regressão.

Os critérios de aceite de `verificacao-morador` também aparecem como
`AC_SEM_TESTE`, o que está correto: a feature ainda é especificação, não
implementação. `onp-spec scaffold verificacao-morador` gera os testes que
falham quando começar a construção.
