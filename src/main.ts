import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ThrottleExceptionFilter } from './common/filters/throttle-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isDev = process.env.NODE_ENV !== 'production';

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: isDev ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn', 'log'],
  });

  // ── Segurança: headers HTTP ───────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ── Prefixo e rotas ───────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  app.use('/health', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  });

  // Webhook Stripe precisa do raw body para validação de assinatura
  app.use('/api/v1/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origem não permitida — ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Validação global ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Filtros e interceptors globais ────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter(), new ThrottleExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger (apenas fora de produção) ─────────────────────────────────────
  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('Virtual Mural API')
      .setDescription(
        'API do Mural Virtual de Condomínio — gerencia usuários, condomínios, serviços, agendamentos e avaliações.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'cognito-jwt',
      )
      .addTag('auth', 'Autenticação e perfil do usuário')
      .addTag('users', 'Gestão de usuários e onboarding')
      .addTag('condominiums', 'Gestão de condomínios')
      .addTag('services', 'Serviços oferecidos por prestadores')
      .addTag('appointments', 'Agendamentos de serviços')
      .addTag('reviews', 'Avaliações de serviços')
      .addTag('notifications', 'Notificações in-app e push')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger disponível em /api/docs');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Servidor rodando em http://localhost:${port}/api/v1`);
}

void bootstrap();
