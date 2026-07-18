import { PartialType } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto.js';

/**
 * Update paket — semua field opsional (partial). `code` boleh diubah tapi
 * tetap harus unik; sebaiknya stabil karena dipakai lookup billing.
 */
export class UpdatePlanDto extends PartialType(CreatePlanDto) {}
