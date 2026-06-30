import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Bentuk minimal user yang berasal dari JWT (request.user) untuk keperluan scoping data.
 */
export interface AuthUser {
  id: string;
  role: Role;
  ownerId?: string | null;
}

/**
 * Filter `where` Prisma untuk membatasi akses MikrotikServer berdasarkan role:
 * - SUPER_ADMIN → semua router (tanpa filter).
 * - OWNER       → hanya router miliknya (ownerId = id Owner).
 * - TEKNISI     → router milik Owner yang dia layani (ownerId = ownerId Teknisi).
 */
export function serverScopeWhere(user: AuthUser): { ownerId?: string } {
  switch (user.role) {
    case 'SUPER_ADMIN':
      return {};
    case 'OWNER':
      return { ownerId: user.id };
    case 'TEKNISI':
      if (!user.ownerId) {
        throw new ForbiddenException('Akun Teknisi tidak terhubung ke Owner');
      }
      return { ownerId: user.ownerId };
    default:
      throw new ForbiddenException('Role tidak dikenali');
  }
}

/**
 * ID Owner efektif sebagai pemilik resource yang dibuat user ini.
 * Hanya OWNER (dirinya sendiri) & TEKNISI (Owner-nya) yang boleh memiliki router.
 */
export function effectiveOwnerId(user: AuthUser): string {
  if (user.role === 'OWNER') return user.id;
  if (user.role === 'TEKNISI' && user.ownerId) return user.ownerId;
  throw new ForbiddenException(
    'Hanya Owner atau Teknisi yang dapat menambah/memiliki router',
  );
}

/**
 * Apakah user boleh mengakses resource milik Owner `ownerId`?
 * SUPER_ADMIN: selalu. OWNER: bila dirinya pemilik. TEKNISI: bila Owner-nya pemilik.
 */
export function canAccessOwner(user: AuthUser, ownerId: string): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'OWNER') return user.id === ownerId;
  if (user.role === 'TEKNISI') return user.ownerId === ownerId;
  return false;
}

/**
 * Lempar 403 bila user tidak berhak mengakses resource milik Owner `ownerId`.
 * Dipakai setelah memuat record (server/profile/voucher) untuk cek kepemilikan.
 */
export function assertOwnerAccess(user: AuthUser, ownerId: string): void {
  if (!canAccessOwner(user, ownerId)) {
    throw new ForbiddenException('Anda tidak punya akses ke resource ini');
  }
}
