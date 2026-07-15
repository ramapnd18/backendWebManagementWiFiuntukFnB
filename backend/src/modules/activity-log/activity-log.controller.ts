import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LogAction } from '@prisma/client';

// Owner BOLEH lihat log (riwayat router offline/bermasalah) router miliknya — read-only, ter-scope.
@ApiTags('Activity Logs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @ApiOperation({
    summary:
      'Daftar log aktivitas umum (tanpa riwayat koneksi router — lihat /router-connections)',
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'serverId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, enum: LogAction })
  @ApiResponse({ status: 200, description: 'Berhasil mengambil data log.' })
  async getLogs(
    @CurrentUser() user: AuthUser,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('serverId') serverId?: string,
    @Query('action') action?: LogAction,
  ) {
    return this.activityLogService.getLogs({ skip, take, serverId, action }, user);
  }

  @Get('router-connections')
  @ApiOperation({
    summary: 'Riwayat koneksi router (router offline/gagal terhubung), ter-scope',
  })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'serverId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Berhasil mengambil riwayat koneksi.' })
  async getRouterConnectionLogs(
    @CurrentUser() user: AuthUser,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('serverId') serverId?: string,
  ) {
    return this.activityLogService.getRouterConnectionLogs(
      { skip, take, serverId },
      user,
    );
  }
}
