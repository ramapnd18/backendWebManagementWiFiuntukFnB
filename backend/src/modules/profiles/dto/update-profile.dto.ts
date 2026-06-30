import { PartialType } from '@nestjs/swagger';
import { CreateProfileDto } from './create-profile.dto.js';

export class UpdateProfileDto extends PartialType(CreateProfileDto) {}
