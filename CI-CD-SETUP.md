# CI/CD — Guia de configuração e Git Flow

## Estrutura de branches (Git Flow)

```
main          ← produção (protegida, merge apenas via PR de release/* ou hotfix/*)
develop       ← integração contínua (protegida, merge via PR de feature/*)
release/x.y.z ← preparação de release (criada a partir de develop)
feature/*     ← novas funcionalidades (criadas a partir de develop)
bugfix/*      ← correções em develop (criadas a partir de develop)
hotfix/*      ← correções urgentes em produção (criadas a partir de main)
chore/*       ← tarefas técnicas, configs, docs
```

---

## Fluxo de trabalho

### Nova feature
```bash
git checkout develop
git pull origin develop
git checkout -b feature/nome-da-feature

# ... desenvolve ...

git add .
git commit -m "feat: descrição da mudança"
git push origin feature/nome-da-feature
# Abrir PR: feature/nome-da-feature → develop
```

### Release
```bash
git checkout develop
git pull origin develop
git checkout -b release/1.2.0

# Ajustes finais, bump de versão em package.json...
git commit -m "chore: bump version to 1.2.0"
git push origin release/1.2.0

# PR 1: release/1.2.0 → main   (dispara deploy produção)
# PR 2: release/1.2.0 → develop (sincroniza develop)

# Após merge na main, criar tag:
git checkout main && git pull
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

### Hotfix
```bash
git checkout main
git pull origin main
git checkout -b hotfix/descricao-do-bug

git commit -m "fix: corrige bug crítico em produção"
git push origin hotfix/descricao-do-bug

# PR 1: hotfix/* → main   (deploy emergencial)
# PR 2: hotfix/* → develop (sincroniza)
```

---

## Pipelines por evento

| Evento | Workflow disparado | Jobs executados |
|---|---|---|
| Push em `feature/*` | — | Nenhum |
| PR aberto para `develop` ou `main` | `pr-validation.yml` | lint, test, build, valida nome da branch |
| Push em `develop` | `ci-cd.yml` | lint → test → build → push ECR (tag `develop-SHA`) |
| Push em `release/*` | `ci-cd.yml` | lint → test → build → push ECR (tag `release-X.Y.Z`) |
| Push em `main` | `ci-cd.yml` | lint → test → build → push ECR (`latest`) → **deploy ECS Fargate** |

---

## Secrets necessários no GitHub

Vá em: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Descrição | Como obter |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Access key de um IAM User com permissões de CI | AWS Console → IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Secret da access key acima | Gerado junto com a access key |

### Política IAM mínima para o CI

Crie um usuário `virtual-mural-ci` no IAM e anexe esta política inline:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:us-east-1:*:repository/virtual-mural-api"
    },
    {
      "Sid": "ECRLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECSAccess",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/virtual-mural-ecs-task-role"
    }
  ]
}
```

---

## Variáveis a ajustar no ci-cd.yml

```yaml
env:
  AWS_REGION: us-east-1            # sua região AWS
  ECR_REPOSITORY: virtual-mural-api  # nome do repositório ECR
  ECS_CLUSTER: virtual-mural-cluster # nome do cluster ECS
  ECS_SERVICE: virtual-mural-api-service # nome do serviço ECS
  CONTAINER_NAME: virtual-mural-api  # nome do container na task definition
```

---

## Proteção de branches recomendada

Em **Settings → Branches → Add rule**:

**Para `main`:**
- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks to pass: `Lint & Test`
- ✅ Do not allow bypassing the above settings

**Para `develop`:**
- ✅ Require a pull request before merging
- ✅ Require status checks to pass: `Lint & Test`
