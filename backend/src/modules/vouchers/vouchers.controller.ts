import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VouchersService } from './vouchers.service.js';
import { GenerateSingleDto } from './dto/generate-single.dto.js';
import { GenerateBatchDto } from './dto/generate-batch.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import type { Response } from 'express';

@ApiTags('Vouchers')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Post('single')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Generate 1 voucher hotspot instant' })
  @ApiResponse({ status: 201, description: 'Voucher berhasil dibuat' })
  @ApiResponse({ status: 403, description: 'Owner dilarang / bukan router Anda' })
  async generateSingle(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateSingleDto,
  ) {
    return this.vouchersService.generateSingle(dto, user);
  }

  @Post('batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Generate voucher massal secara background' })
  @ApiResponse({
    status: 202,
    description: 'Batch dimasukkan ke antrean worker',
  })
  async generateBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateBatchDto,
  ) {
    return this.vouchersService.generateBatch(dto, user);
  }

  @Post('delete-bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Hapus voucher secara massal (hanya UNUSED)' })
  @ApiResponse({ status: 200, description: 'Voucher berhasil dihapus' })
  async deleteBulk(
    @CurrentUser() user: AuthUser,
    @Body() dto: { ids: string[] },
  ) {
    if (!dto.ids || dto.ids.length === 0) {
      return { success: false, message: 'Tidak ada voucher yang dipilih' };
    }
    return this.vouchersService.deleteBulk(dto.ids, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Ambil list semua voucher terbitan' })
  @ApiResponse({ status: 200, description: 'List voucher berhasil diambil' })
  async findAll(@CurrentUser() user: AuthUser) {
    return this.vouchersService.findAll(user);
  }

  @Get('pdf/filtered')
  @ApiOperation({
    summary: 'Download lembaran PDF voucher berdasarkan filter server dan profile',
  })
  @ApiResponse({ status: 200, description: 'File PDF voucher streamed' })
  async getPdfForFilter(
    @Query('serverId') serverId: string,
    @Query('profileId') profileId: string,
    @Query('status') status: string,
    @Res() res: Response,
  ) {
    const buffer = await this.vouchersService.getPdfForFilter(serverId, profileId, status);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=vouchers-filtered.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEKNISI', 'SUPER_ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Ambil detail voucher' })
  @ApiResponse({
    status: 200,
    description: 'Detail voucher berhasil diambil',
  })
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vouchersService.findOne(id, user);
  }

  @Get('pdf/batch/:batchId')
  @ApiOperation({
    summary: 'Download lembaran PDF voucher per batch (Public/Browser)',
  })
  @ApiResponse({ status: 200, description: 'File PDF voucher streamed' })
  async getPdfForBatch(
    @Param('batchId') batchId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.vouchersService.getPdfForBatch(batchId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=vouchers-${batchId}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('pdf/single/:id')
  @ApiOperation({ summary: 'Download PDF 1 voucher tunggal (Public/Browser)' })
  @ApiResponse({ status: 200, description: 'File PDF voucher streamed' })
  async getPdfForSingle(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.vouchersService.getPdfForSingle(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=voucher-${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
