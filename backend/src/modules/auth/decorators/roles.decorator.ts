import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Kunci metadata untuk menyimpan daftar role yang diizinkan pada sebuah handler/controller.
 */
export const ROLES_KEY = 'roles';

/**
 * Dekorator @Roles(...) — menandai endpoint hanya boleh diakses role tertentu.
 * Dibaca oleh RolesGuard. Tanpa dekorator ini, endpoint tidak dibatasi role
 * (tetap butuh JWT bila JwtAuthGuard terpasang).
 *
 * Contoh: @Roles('TEKNISI', 'SUPER_ADMIN')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
