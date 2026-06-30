import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProfilesService } from './profiles.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';

// Profile = konfigurasi teknis → hanya TEKNISI & SUPER_ADMIN. Owner → 403.
@ApiTags('Profiles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEKNISI', 'SUPER_ADMIN')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @ApiOperation({
    summary: 'Buat profil hotspot baru dan sinkronkan ke MikroTik',
  })
  @ApiResponse({
    status: 201,
    description: 'Profil berhasil dibuat & disinkronkan',
  })
  @ApiResponse({
    status: 400,
    description: 'Data input tidak valid atau duplikat',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Owner dilarang / bukan router Anda' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    return this.profilesService.create(createProfileDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Ambil semua profil hotspot' })
  @ApiResponse({ status: 200, description: 'Profil berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUser) {
    return this.profilesService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ambil detail profil hotspot' })
  @ApiResponse({ status: 200, description: 'Profil berhasil ditemukan' })
  @ApiResponse({ status: 404, description: 'Profil tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.profilesService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update data profil hotspot dan sinkronkan kembali ke MikroTik',
  })
  @ApiResponse({ status: 200, description: 'Profil berhasil diupdate' })
  @ApiResponse({ status: 404, description: 'Profil tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profilesService.update(id, updateProfileDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Hapus profil hotspot dan singkirkan dari MikroTik',
  })
  @ApiResponse({ status: 200, description: 'Profil berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'Profil tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.profilesService.remove(id, user);
  }

  @Post('sync/:serverId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sinkronkan (impor) profil hotspot yang sudah ada dari MikroTik ke DB local',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil berhasil disinkronkan dari router',
  })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async syncFromRouter(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
  ) {
    return this.profilesService.syncFromRouter(serverId, user);
  }
}
