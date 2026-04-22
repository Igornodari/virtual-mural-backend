# Virtual Mural — Backend API

API REST do **Mural Virtual de Condomínio**, construída com **NestJS**, **TypeORM**, **PostgreSQL** e **RabbitMQ**. Autenticação via **AWS Cognito** (JWT RS256).

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular Frontend                         │
│              (virtual-mural-aws-project)                    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS + JWT (Cognito ID Token)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  NestJS API (Port 3000)                     │
│  /auth  /users  /condominiums  /services                    │
│  /appointments  /reviews                                    │
│  MessagingService (publica/consome eventos RabbitMQ)        │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
  ┌─────────────────┐           ┌──────────────────┐
  │  PostgreSQL/RDS │           │  RabbitMQ/AmazonMQ│
  └─────────────────┘           └──────────────────┘
```

### Módulos

| Módulo | Responsabilidade |
|---|---|
| `auth` | Estratégia JWT Cognito, guard, endpoint `/auth/me` |
| `users` | Perfil do usuário, onboarding (condomínio + role) |
| `condominiums` | CRUD de condomínios, busca por CEP |
| `services` | CRUD de serviços do prestador |
| `appointments` | Agendamentos entre moradores e prestadores |
| `reviews` | Avaliações de serviços com recálculo automático de rating |
| `messaging` | Publicação e consumo de eventos via RabbitMQ |

---

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Conta AWS com Cognito User Pool configurado

---

## Configuração

```bash
cp .env.example .env
# Preencha AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID
```

---

## Rodando localmente

```bash
# Sobe PostgreSQL + RabbitMQ + API
docker-compose up -d

# Apenas o banco e o broker (API em modo dev)
docker-compose up -d postgres rabbitmq
npm install && npm run start:dev
```

- **API:** http://localhost:3000/api/v1
- **Swagger:** http://localhost:3000/api/docs
- **RabbitMQ UI:** http://localhost:15672 (guest/guest)

---

## Endpoints principais

### Autenticação
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/v1/auth/me` | Perfil do usuário autenticado |

### Usuários
| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/v1/users/me` | Perfil completo com condomínio e role |
| `PATCH` | `/api/v1/users/me/profile` | Atualiza nome, telefone e avatar |
| `PATCH` | `/api/v1/users/me/onboarding` | Salva condomínio e/ou role (onboarding) |

### Condomínios
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/condominiums` | Cria um condomínio |
| `GET` | `/api/v1/condominiums?zipCode=01310100` | Lista/busca por CEP |
| `PATCH` | `/api/v1/condominiums/:id` | Atualiza dados |

### Serviços
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/services` | Cria um serviço (prestador) |
| `GET` | `/api/v1/services` | Lista serviços do condomínio |
| `GET` | `/api/v1/services?mine=true` | Meus serviços (prestador) |
| `PATCH` | `/api/v1/services/:id` | Edita serviço |
| `DELETE` | `/api/v1/services/:id` | Remove serviço (soft delete) |

### Agendamentos
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/appointments` | Solicita agendamento |
| `GET` | `/api/v1/appointments/mine` | Meus agendamentos |
| `PATCH` | `/api/v1/appointments/:id/status` | Confirma/cancela/conclui |

### Avaliações
| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/reviews` | Envia avaliação |
| `GET` | `/api/v1/reviews/service/:id` | Lista avaliações de um serviço |

---

## Eventos RabbitMQ

| Evento | Disparado quando |
|---|---|
| `service.created` | Prestador publica um novo serviço |
| `appointment.requested` | Morador solicita um agendamento |
| `appointment.status_changed` | Status de agendamento é alterado |
| `review.submitted` | Morador envia uma avaliação |

---

## Deploy na AWS

| Serviço | Uso |
|---|---|
| **ECS Fargate** | Execução do container NestJS |
| **RDS PostgreSQL** | Banco de dados gerenciado |
| **Amazon MQ (RabbitMQ)** | Broker de mensagens gerenciado |
| **Cognito User Pool** | Autenticação de usuários |
| **ECR** | Registro de imagens Docker |
| **ALB** | Load balancer com HTTPS |

```bash
# Build e push para o ECR
docker build -t virtual-mural-api .
docker tag virtual-mural-api:latest <account>.dkr.ecr.us-east-1.amazonaws.com/virtual-mural-api:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/virtual-mural-api:latest
```
