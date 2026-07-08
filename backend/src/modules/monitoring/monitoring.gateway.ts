import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { MonitoringPollerService } from './monitoring-poller.service.js';
import {
  canAccessOwner,
  type AuthUser,
} from '../../common/scope.util.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
  ownerId: string | null;
}

const room = (serverId: string) => `server:${serverId}`;

/**
 * Gateway WebSocket monitoring (B7) — namespace `/monitoring`.
 *
 * Alur:
 * 1. Klien konek dengan JWT (`auth.token` saat handshake) → diverifikasi, user disimpan
 *    di `socket.data.user`. Gagal auth → langsung disconnect.
 * 2. Klien emit `subscribe` `{ serverId }` → dicek kepemilikannya (scope owner), lalu join
 *    room `server:<id>` & didaftarkan ke poller terpusat. Snapshot terakhir langsung dikirim.
 * 3. Poller mem-*push* event `snapshot` (saat data berubah) & `status` (saat konektivitas
 *    router berubah) ke room. Klien TIDAK perlu polling.
 * 4. `unsubscribe` / disconnect → subscriber dikurangi; saat 0, router berhenti di-poll.
 */
@WebSocketGateway({
  namespace: '/monitoring',
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' },
})
export class MonitoringGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MonitoringGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly poller: MonitoringPollerService,
  ) {}

  afterInit() {
    // Daftarkan cara poller mem-push ke room (hindari circular dependency).
    this.poller.setEmitter((serverId, event, payload) => {
      this.server.to(room(serverId)).emit(event, payload);
    });
    this.logger.log('Gateway monitoring siap di namespace /monitoring.');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Token tidak ada');

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, ownerId: true, isActive: true },
      });
      if (!user || !user.isActive) throw new Error('User tidak valid/nonaktif');

      client.data.user = {
        id: user.id,
        role: user.role,
        ownerId: user.ownerId,
      } satisfies AuthUser;
      client.data.servers = new Set<string>();
    } catch (err) {
      this.logger.warn(
        `WS ditolak: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.emit('unauthorized', { message: 'Autentikasi WebSocket gagal' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const servers = client.data.servers as Set<string> | undefined;
    if (servers) {
      for (const serverId of servers) this.poller.removeSubscriber(serverId);
    }
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { serverId?: string },
  ) {
    const user = client.data.user as AuthUser | undefined;
    const serverId = body?.serverId;
    if (!user || !serverId) {
      return { ok: false, error: 'serverId wajib diisi' };
    }

    // Scope: hanya boleh memantau router milik sendiri.
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!server || !canAccessOwner(user, server.ownerId)) {
      return { ok: false, error: 'Router tidak ditemukan / bukan milik Anda' };
    }

    const servers = client.data.servers as Set<string>;
    if (servers.has(serverId)) {
      return { ok: true, alreadySubscribed: true };
    }

    await client.join(room(serverId));
    servers.add(serverId);
    this.poller.addSubscriber(serverId, server.name);

    // Kirim snapshot terakhir (bila ada) langsung ke klien yang baru join, tanpa
    // menunggu perubahan berikutnya.
    const last = this.poller.getLast(serverId);
    if (last) client.emit('snapshot', last);

    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { serverId?: string },
  ) {
    const serverId = body?.serverId;
    const servers = client.data.servers as Set<string> | undefined;
    if (serverId && servers?.has(serverId)) {
      void client.leave(room(serverId));
      servers.delete(serverId);
      this.poller.removeSubscriber(serverId);
    }
    return { ok: true };
  }

  /** Ambil token dari handshake: `auth.token`, query `?token=`, atau header Authorization. */
  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token.replace(/^Bearer\s+/i, '');

    const q = client.handshake.query?.token;
    if (typeof q === 'string' && q) return q.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers?.authorization;
    if (header) return header.replace(/^Bearer\s+/i, '');

    return null;
  }
}
