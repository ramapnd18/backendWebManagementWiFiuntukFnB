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
import { Role } from '@prisma/client';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';

// Manajemen user — hanya OWNER (kelola Teknisi-nya) & SUPER_ADMIN (kelola semua).
// TEKNISI tidak boleh mengelola user → 403.
@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'SUPER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary:
      'Buat user baru (OWNER → Teknisi miliknya; SUPER_ADMIN → Owner/Teknisi)',
  })
  @ApiResponse({ status: 201, description: 'User berhasil dibuat' })
  @ApiResponse({ status: 400, description: 'Email duplikat / role/ownerId tidak valid' })
  @ApiResponse({ status: 403, description: 'Teknisi dilarang mengelola user' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Daftar user (SUPER_ADMIN semua; OWNER hanya Teknisi miliknya)',
  })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiResponse({ status: 200, description: 'Daftar user berhasil diambil' })
  async findAll(@CurrentUser() user: AuthUser, @Query('role') role?: Role) {
    return this.usersService.findAll(user, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail user' })
  @ApiResponse({ status: 200, description: 'Detail user berhasil diambil' })
  @ApiResponse({ status: 403, description: 'Bukan user yang Anda kelola' })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user (nama / password / aktif-nonaktif)' })
  @ApiResponse({ status: 200, description: 'User berhasil diupdate' })
  @ApiResponse({ status: 400, description: 'Tidak bisa menonaktifkan diri sendiri' })
  @ApiResponse({ status: 403, description: 'Bukan user yang Anda kelola' })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus user (Owner: hanya Teknisi-nya)' })
  @ApiResponse({ status: 200, description: 'User berhasil dihapus' })
  @ApiResponse({ status: 400, description: 'Tidak bisa menghapus diri sendiri' })
  @ApiResponse({ status: 403, description: 'Bukan user yang Anda kelola' })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.remove(id, user);
  }
}
