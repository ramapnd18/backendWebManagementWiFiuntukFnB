import {
  Body,
  Controller,
  Delete,
  Get,
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
import { PlansService } from './plans.service.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('Plans')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar semua paket (termasuk non-aktif) — SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Daftar paket berhasil diambil' })
  async findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail paket — SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Detail paket berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Paket tidak ditemukan' })
  async findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Buat paket baru — SUPER_ADMIN' })
  @ApiResponse({ status: 201, description: 'Paket berhasil dibuat' })
  @ApiResponse({ status: 409, description: 'Kode paket sudah dipakai' })
  async create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update paket (partial) — SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Paket berhasil diperbarui' })
  @ApiResponse({ status: 404, description: 'Paket tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Kode paket sudah dipakai' })
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Hapus paket (soft-delete bila masih dipakai) — SUPER_ADMIN',
  })
  @ApiResponse({ status: 200, description: 'Paket dihapus / dinonaktifkan' })
  @ApiResponse({ status: 400, description: 'Paket FREE tidak boleh dihapus' })
  @ApiResponse({ status: 404, description: 'Paket tidak ditemukan' })
  async remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
