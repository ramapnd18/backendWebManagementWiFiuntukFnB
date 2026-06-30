import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Daftar paket langganan aktif' })
  @ApiResponse({ status: 200, description: 'Daftar paket berhasil diambil' })
  async getPlans() {
    return this.billingService.getPlans();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'TEKNISI')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Status langganan & pemakaian kuota router (Owner/Teknisi)',
  })
  @ApiResponse({ status: 200, description: 'Status langganan berhasil diambil' })
  async getMyStatus(@CurrentUser() user: AuthUser) {
    return this.billingService.getMyStatus(user);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Buat pembayaran upgrade paket via Duitku' })
  @ApiResponse({ status: 201, description: 'Invoice dibuat, kembalikan paymentUrl' })
  @ApiResponse({ status: 400, description: 'Paket gratis tidak perlu bayar' })
  @ApiResponse({ status: 403, description: 'Hanya Owner yang dapat checkout' })
  @ApiResponse({ status: 404, description: 'Paket tidak ditemukan' })
  @ApiResponse({ status: 503, description: 'Duitku belum dikonfigurasi / tidak tersedia' })
  async checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.billingService.checkout(user, dto.planCode);
  }

  /**
   * Webhook Duitku — TANPA JwtAuthGuard (dipanggil server Duitku).
   * Keamanan via validasi signature di service. Body form-urlencoded dari Duitku.
   */
  @Post('duitku/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Webhook] Callback pembayaran dari Duitku' })
  @ApiResponse({ status: 200, description: 'Callback diterima' })
  @ApiResponse({ status: 403, description: 'Signature tidak valid' })
  async duitkuCallback(@Body() body: Record<string, any>) {
    return this.billingService.handleCallback(body);
  }
}
