import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

import { InAppNotificationsService } from './in-app-notifications.service';
import { WebPushService } from './web-push.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { RegisterPushSubscriptionDto } from './dto/register-push-subscription.dto';
import { ConfigService } from '@nestjs/config';

/**
 * API de notificações in-app.
 *
 * Endpoints REST:
 *  - GET    /notifications                  → lista paginada
 *  - GET    /notifications/unread-count     → contador para o badge
 *  - GET    /notifications/vapid-public-key → chave pública p/ subscribe
 *  - PATCH  /notifications/:id/read         → marca uma como lida
 *  - PATCH  /notifications/read-all         → marca todas como lidas
 *  - POST   /notifications/push-subscription → registra device para push
 *  - DELETE /notifications/push-subscription?endpoint=... → remove device
 *
 * Endpoint SSE (Server-Sent Events):
 *  - GET /notifications/stream → push tempo real enquanto app aberto
 */
@ApiTags('notifications')
@ApiBearerAuth('cognito-jwt')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly inApp: InAppNotificationsService,
    private readonly webPush: WebPushService,
    private readonly config: ConfigService,
  ) {}

  // ── REST ──────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Lista notificações do usuário autenticado.' })
  async list(@CurrentUser() user: User, @Query() query: ListNotificationsDto) {
    return this.inApp.findForUser(user.id, {
      unreadOnly: query.unread === 'true',
      limit: query.limit,
      offset: query.offset,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  @ApiOperation({ summary: 'Retorna o número de notificações não lidas.' })
  async unreadCount(@CurrentUser() user: User) {
    const count = await this.inApp.unreadCount(user.id);
    return { count };
  }

  /**
   * Chave pública VAPID — o frontend precisa para gerar a subscription
   * no Service Worker. Liberamos sem auth para evitar deadlock no
   * primeiro registro (mas a chave é pública por design).
   */
  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Chave pública VAPID para inscrição Web Push.' })
  vapidPublicKey() {
    return {
      publicKey: this.config.get<string>('VAPID_PUBLIC_KEY', ''),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  @ApiOperation({ summary: 'Marca uma notificação como lida.' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.inApp.markAsRead(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  @ApiOperation({ summary: 'Marca todas as notificações como lidas.' })
  markAllRead(@CurrentUser() user: User) {
    return this.inApp.markAllAsRead(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('push-subscription')
  @ApiOperation({
    summary: 'Registra uma inscrição Web Push para o usuário atual.',
  })
  async registerPush(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushSubscriptionDto,
    @Req() req: Request,
  ) {
    const userAgent = dto.userAgent ?? req.headers['user-agent'] ?? undefined;

    const saved = await this.webPush.registerSubscription({
      userId: user.id,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent as string | undefined,
    });

    return { id: saved.id };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('push-subscription')
  @ApiOperation({
    summary: 'Remove uma inscrição Web Push pelo endpoint.',
  })
  async removePush(@Query('endpoint') endpoint: string) {
    if (!endpoint) {
      return { removed: false };
    }
    await this.webPush.removeSubscriptionByEndpoint(endpoint);
    return { removed: true };
  }

  // ── SSE (tempo real) ──────────────────────────────────────────────────

  /**
   * Stream de notificações em tempo real para o usuário autenticado.
   *
   * Por que SSE e não WebSocket:
   *  - tráfego é unidirecional (server → client)
   *  - usa HTTP comum (atravessa proxy/load balancer sem ginástica)
   *  - reconexão automática nativa no browser (EventSource)
   *
   * O auth é via JWT no query/header. Como EventSource do browser não
   * envia headers, o frontend deve mandar `?access_token=...` ou usar
   * cookies. Aqui aceitamos ambos via JwtAuthGuard customizado.
   */
  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(@CurrentUser() user: User): Observable<MessageEvent> {
    return this.inApp.streamForUser(user.id).pipe(
      map(
        (n) =>
          ({
            data: {
              id: n.id,
              type: n.type,
              severity: n.severity,
              payload: n.payload,
              actionUrl: n.actionUrl,
              read: n.read,
              createdAt: n.createdAt,
            },
            type: 'notification',
          }) as unknown as MessageEvent,
      ),
    );
  }
}
