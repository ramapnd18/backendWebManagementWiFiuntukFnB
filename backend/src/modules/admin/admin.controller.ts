import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { ListOwnersDto } from './dto/list-owners.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('owners')
  @ApiOperation({ summary: 'Daftar Owner + agregat (teknisi/router/pos/plan) — SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Daftar owner berhasil diambil' })
  async listOwners(@Query() query: ListOwnersDto) {
    return this.adminService.listOwners(query);
  }

  @Get('owners/:id')
  @ApiOperation({ summary: 'Detail Owner (langganan, kuota, monitoring) — SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Detail owner berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Owner tidak ditemukan' })
  async getOwnerDetail(@Param('id') id: string) {
    return this.adminService.getOwnerDetail(id);
  }
}
