import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import { PosKeysService } from './pos-keys.service.js';
import { CreatePosKeyDto } from './dto/create-pos-key.dto.js';
import { UpdatePosKeyDto } from './dto/update-pos-key.dto.js';

// API key POS terikat ke server (outlet) milik Owner → di-scope per-owner.
@ApiTags('POS')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
@Controller('pos-keys')
export class PosKeysController {
  constructor(private readonly posKeysService: PosKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Buat API key POS baru (key mentah hanya tampil sekali)',
  })
  @ApiResponse({ status: 201, description: 'API key berhasil dibuat' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Bukan router Anda' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePosKeyDto) {
    return this.posKeysService.create(dto.label, dto.serverId, user);
  }

  @Get()
  @ApiOperation({ summary: 'List API key POS (ter-mask)' })
  @ApiQuery({
    name: 'serverId',
    required: false,
    description: 'Filter API key untuk satu server (outlet)',
  })
  @ApiResponse({ status: 200, description: 'List API key berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('serverId') serverId?: string,
  ) {
    return this.posKeysService.findAll(user, serverId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aktifkan / nonaktifkan API key POS' })
  @ApiResponse({ status: 200, description: 'Status API key diperbarui' })
  @ApiResponse({ status: 404, description: 'API key tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Bukan router Anda' })
  async setActive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePosKeyDto,
  ) {
    return this.posKeysService.setActive(id, dto.isActive, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus (revoke permanen) API key POS' })
  @ApiResponse({ status: 200, description: 'API key berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'API key tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Bukan router Anda' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posKeysService.remove(id, user);
  }
}
