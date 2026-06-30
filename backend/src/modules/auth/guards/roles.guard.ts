import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * RolesGuard — menegakkan RBAC berbasis dekorator @Roles().
 *
 * Pasang SETELAH JwtAuthGuard: `@UseGuards(JwtAuthGuard, RolesGuard)`,
 * karena guard ini membaca `request.user.role` yang diisi oleh JwtStrategy.
 *
 * - Tanpa @Roles → izinkan (endpoint tidak dibatasi role).
 * - Role user tidak termasuk yang diizinkan → 403 Forbidden (BUKAN 401).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Anda tidak punya hak akses untuk resource ini',
      );
    }

    return true;
  }
}
