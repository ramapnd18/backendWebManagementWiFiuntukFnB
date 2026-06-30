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
import { ServersService } from './servers.service.js';
import { CreateServerDto } from './dto/create-server.dto.js';
import { UpdateServerDto } from './dto/update-server.dto.js';
import { TestConnectionDto } from './dto/test-connection.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { effectiveOwnerId, type AuthUser } from '../../common/scope.util.js';

@ApiTags('Servers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Post()
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Daftarkan router MikroTik baru' })
  @ApiResponse({ status: 201, description: 'Router berhasil didaftarkan' })
  @ApiResponse({
    status: 400,
    description: 'Data input tidak valid atau router sudah terdaftar',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Owner dilarang membuat router' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() createServerDto: CreateServerDto,
  ) {
    // ownerId diturunkan dari user: OWNER → dirinya; TEKNISI → Owner-nya
    return this.serversService.create(createServerDto, effectiveOwnerId(user));
  }

  @Get()
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ambil semua router MikroTik yang terdaftar' })
  @ApiResponse({ status: 200, description: 'List router berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: AuthUser) {
    return this.serversService.findAll(user);
  }

  @Post('refresh-status')
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh status koneksi SEMUA router (sinkronisasi terpusat)',
  })
  @ApiResponse({ status: 200, description: 'Status semua router diperbarui' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refreshStatus(@CurrentUser() user: AuthUser) {
    return this.serversService.refreshAllStatus(user);
  }

  @Get(':id')
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ambil detail router MikroTik berdasarkan ID' })
  @ApiResponse({ status: 200, description: 'Detail router berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Bukan router milik Anda' })
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serversService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update data router MikroTik' })
  @ApiResponse({ status: 200, description: 'Router berhasil diupdate' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Owner dilarang / bukan router Anda' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() updateServerDto: UpdateServerDto,
  ) {
    return this.serversService.update(id, updateServerDto, user);
  }

  @Delete(':id')
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Hapus router MikroTik dari database' })
  @ApiResponse({ status: 200, description: 'Router berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Owner dilarang / bukan router Anda' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serversService.remove(id, user);
  }

  @Post(':id/test-connection')
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uji koneksi real-time ke router MikroTik' })
  @ApiResponse({ status: 200, description: 'Koneksi berhasil diuji' })
  @ApiResponse({ status: 404, description: 'Router tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Owner dilarang / bukan router Anda' })
  async testConnection(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serversService.testConnection(id, user);
  }

  @Post('test-connection-custom')
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uji koneksi ke router MikroTik dengan kredensial kustom' })
  @ApiResponse({ status: 200, description: 'Koneksi berhasil diuji' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testCustomConnection(@Body() testDto: TestConnectionDto) {
    return this.serversService.testCustomConnection(testDto);
  }
}
