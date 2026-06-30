import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PosService } from './pos.service.js';
import { TriggerVoucherDto } from './dto/trigger-voucher.dto.js';
import {
  PosApiKeyGuard,
  type RequestWithPosApiKey,
} from './guards/pos-api-key.guard.js';

/**
 * Endpoint untuk sistem POS (mesin kasir). Proteksi via header `x-api-key`
 * (BUKAN JWT). Lihat doc/POS_INTEGRATION.md §3 & §4.
 */
@ApiTags('POS')
@ApiSecurity('pos-api-key')
@UseGuards(PosApiKeyGuard)
@Controller('pos/v1')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('profiles')
  @ApiOperation({
    summary: 'Daftar paket WiFi pada server yang terikat ke API key (untuk kasir)',
  })
  @ApiResponse({ status: 200, description: 'Daftar profil server milik key' })
  @ApiResponse({ status: 401, description: 'API key tidak valid' })
  async listProfiles(@Req() req: RequestWithPosApiKey) {
    return this.posService.listProfiles(req.posApiKey);
  }

  @Post('trigger-voucher')
  @ApiOperation({
    summary: 'Trigger pembuatan voucher dari transaksi POS (idempoten)',
  })
  @ApiResponse({ status: 201, description: 'Voucher baru dibuat' })
  @ApiResponse({
    status: 200,
    description:
      'Transaksi sudah pernah diproses — voucher yang sama dikembalikan',
  })
  @ApiResponse({ status: 400, description: 'Body tidak valid' })
  @ApiResponse({ status: 401, description: 'API key tidak valid' })
  @ApiResponse({ status: 404, description: 'Server / profil tidak ditemukan' })
  @ApiResponse({ status: 502, description: 'Router tidak dapat dijangkau' })
  async triggerVoucher(
    @Body() dto: TriggerVoucherDto,
    @Req() req: RequestWithPosApiKey,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { isReplay, body } = await this.posService.triggerVoucher(
      dto,
      req.posApiKey,
    );
    res.status(isReplay ? 200 : 201);
    return body;
  }
}
