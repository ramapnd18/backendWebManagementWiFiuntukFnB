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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PosKeysService } from './pos-keys.service.js';
import { CreatePosKeyDto } from './dto/create-pos-key.dto.js';
import { UpdatePosKeyDto } from './dto/update-pos-key.dto.js';

@ApiTags('POS')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('pos-keys')
export class PosKeysController {
  constructor(private readonly posKeysService: PosKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Buat API key POS baru (key mentah hanya tampil sekali)',
  })
  @ApiResponse({ status: 201, description: 'API key berhasil dibuat' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() dto: CreatePosKeyDto) {
    return this.posKeysService.create(dto.label, dto.serverId);
  }

  @Get()
  @ApiOperation({ summary: 'List API key POS (ter-mask)' })
  @ApiResponse({ status: 200, description: 'List API key berhasil diambil' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll() {
    return this.posKeysService.findAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Aktifkan / nonaktifkan API key POS' })
  @ApiResponse({ status: 200, description: 'Status API key diperbarui' })
  @ApiResponse({ status: 404, description: 'API key tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setActive(@Param('id') id: string, @Body() dto: UpdatePosKeyDto) {
    return this.posKeysService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus (revoke permanen) API key POS' })
  @ApiResponse({ status: 200, description: 'API key berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'API key tidak ditemukan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id') id: string) {
    return this.posKeysService.remove(id);
  }
}
