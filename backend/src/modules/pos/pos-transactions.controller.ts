import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import { PosService } from './pos.service.js';
import { ListPosTransactionsDto } from './dto/list-pos-transactions.dto.js';

/**
 * Riwayat transaksi POS untuk panel admin (JWT). Terpisah dari `PosController`
 * (yang memakai `x-api-key` untuk mesin kasir). Data ter-scope per Owner.
 */
@ApiTags('POS')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
@Controller('pos/transactions')
export class PosTransactionsController {
  constructor(private readonly posService: PosService) {}

  @Get()
  @ApiOperation({
    summary: 'Riwayat transaksi POS (ter-scope, filter & pagination)',
  })
  @ApiResponse({ status: 200, description: 'List transaksi POS berhasil diambil' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPosTransactionsDto,
  ) {
    return this.posService.listTransactions(user, query);
  }
}
