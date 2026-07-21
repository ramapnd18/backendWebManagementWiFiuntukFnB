import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

/**
 * Health check aplikasi — SENGAJA TANPA GUARD.
 *
 * Dipakai platform deploy untuk menentukan container sehat/tidak, jadi harus
 * bisa diakses tanpa JWT. Jangan bingung dengan `/api/monitoring/health` yang
 * merupakan histori healthcheck ROUTER dan tetap terproteksi.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Status aplikasi (publik, untuk healthcheck platform deploy)',
  })
  @ApiResponse({ status: 200, description: 'Aplikasi hidup.' })
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  @ApiOperation({
    summary: 'Diagnostik koneksi database (publik)',
    description:
      'Menguji DNS + TCP ke host database dari DALAM container, plus satu query ringan. ' +
      'Host/port diambil dari DATABASE_URL — bukan dari input klien. ' +
      'Kredensial tidak pernah ditampilkan.',
  })
  @ApiResponse({ status: 200, description: 'Hasil diagnostik.' })
  async checkDb() {
    const [network, internet, custom] = await Promise.all([
      this.healthService.diagnoseDb(),
      this.healthService.probeInternet(),
      this.healthService.probeCustomTargets(),
    ]);

    let query: { ok: boolean; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      query = { ok: true };
    } catch (err) {
      query = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return {
      network,
      internet,
      custom,
      query,
      env: this.healthService.envPresence(),
    };
  }
}
