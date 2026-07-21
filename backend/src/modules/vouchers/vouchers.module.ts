import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service.js';
import { VouchersController } from './vouchers.controller.js';
import { VoucherBatchWorker } from './voucher-batch.worker.js';

@Module({
  controllers: [VouchersController],
  providers: [VouchersService, VoucherBatchWorker],
  exports: [VouchersService],
})
export class VouchersModule {}
