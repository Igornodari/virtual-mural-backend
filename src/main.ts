import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  if (process.env.NODE_ENV !== 'production') {
    app.useLogger(['error', 'warn', 'log', 'debug', 'verbose']);
  }

  app.setGlobalPrefix('api/v1', {
    exclude: [
      {
        path: 'api/stripe/webhook',
        method: RequestMethod.POST,
      },
    ],
  });

  // Health check endpoint — deve vir ANTES do bodyParser para funcionar corretamente
  app.use('/health', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  });

  app.use('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Servidor rodando em http://localhost:${port}/api/v1`);
}
void bootstrap();
