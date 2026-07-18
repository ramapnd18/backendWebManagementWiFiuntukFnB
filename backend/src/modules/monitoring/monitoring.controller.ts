import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MonitoringService } from './monitoring.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import { HealthLogDto, HealthSummaryDto } from './dto/health-log.dto.js';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Monitoring')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Histori healthcheck router (log penuh, ter-scope, pagination)',
    description:
      'Setiap hasil cek periodik (ONLINE & OFFLINE) yang dicatat health scheduler. Beda dari activity-log yang hanya mencatat kegagalan.',
  })
  @ApiResponse({ status: 200, description: 'Histori healthcheck berhasil diambil.' })
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  async getHealthLogs(
    @CurrentUser() user: AuthUser,
    @Query() query: HealthLogDto,
  ) {
    return this.monitoringService.getHealthLogs(user, query);
  }

  @Get('health/summary')
  @ApiOperation({
    summary: 'Agregat uptime healthcheck per hari (ter-scope)',
    description:
      'Ringkasan per hari: jumlah cek, kegagalan, persentase uptime, estimasi downtime (menit).',
  })
  @ApiResponse({ status: 200, description: 'Ringkasan uptime berhasil diambil.' })
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  async getHealthSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: HealthSummaryDto,
  ) {
    return this.monitoringService.getHealthSummary(user, query);
  }

  @Get('snapshot/:serverId')
  @ApiOperation({
    summary:
      'Snapshot monitoring (active users + resource + traffic) dalam SATU koneksi',
    description:
      'Optimasi beban router: 1 login + 3 perintah, menggantikan 3 endpoint terpisah. Dipakai auto-refresh dashboard.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot monitoring berhasil diambil.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan.' })
  @Roles('TEKNISI', 'SUPER_ADMIN')
  async getSnapshot(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
  ) {
    return this.monitoringService.getSnapshot(serverId, user);
  }

  @Get('active/:serverId')
  @ApiOperation({
    summary:
      'Mendapatkan daftar sesi pengguna hotspot aktif di router secara real-time',
    description:
      'Menarik data langsung dari MikroTik untuk memantau siapa saja yang sedang menggunakan WiFi.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar user aktif berhasil diambil secara real-time.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan.' })
  @Roles('TEKNISI', 'SUPER_ADMIN')
  async getActiveUsers(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
  ) {
    return this.monitoringService.getActiveUsers(serverId, user);
  }

  @Get('resources/:serverId')
  @ApiOperation({
    summary:
      'Mendapatkan data statistik performa hardware (CPU, RAM, HDD, Uptime) router',
    description:
      'Mengambil data performa CPU Load, Memori RAM, dan kapasitas penyimpanan harddisk langsung dari CHR.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data statistik hardware berhasil diambil secara real-time.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan.' })
  @Roles('TEKNISI', 'SUPER_ADMIN')
  async getRouterResources(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
  ) {
    return this.monitoringService.getRouterResources(serverId, user);
  }

  @Get('traffic/:serverId')
  @ApiOperation({
    summary:
      'Mendapatkan data statistik traffic (RX/TX bytes) dari seluruh interface router',
    description:
      'Mengambil data jumlah data masuk dan keluar pada masing-masing interface / outlet secara real-time dari CHR.',
  })
  @ApiResponse({
    status: 200,
    description: 'Data statistik traffic berhasil diambil secara real-time.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan.' })
  // Owner BOLEH lihat trafik TX/RX router miliknya (read-only)
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  async getRouterTraffic(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
  ) {
    return this.monitoringService.getRouterTraffic(serverId, user);
  }
}
