import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PosApiKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashApiKey } from '../pos.util.js';

/** Request yang sudah lolos guard akan membawa data API key. */
export interface RequestWithPosApiKey extends Request {
  posApiKey: PosApiKey;
}

/**
 * Guard untuk endpoint POS (mesin kasir).
 *
 * Validasi header `x-api-key`:
 *  1. Ambil header → kosong → 401.
 *  2. sha256(key) → cari PosApiKey yang isActive by keyHash → tak ada → 401.
 *  3. Update lastUsedAt (audit) & tempel record ke request.
 *
 * Lihat doc/POS_INTEGRATION.md §2.
 */
@Injectable()
export class PosApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPosApiKey>();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('API key tidak valid');
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await this.prisma.posApiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('API key tidak valid');
    }

    // Catat pemakaian terakhir (best-effort, tidak memblok request).
    await this.prisma.posApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    request.posApiKey = apiKey;
    return true;
  }
}
