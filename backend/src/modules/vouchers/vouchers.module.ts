import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service.js';
import { VouchersController } from './vouchers.controller.js';
import { VoucherQueueService } from './voucher-queue.service.js';

@Module({
  controllers: [VouchersController],
  providers: [VouchersService, VoucherQueueService],
  exports: [VouchersService, VoucherQueueService],
})
export class VouchersModule {}
