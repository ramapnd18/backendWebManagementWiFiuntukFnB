import { IsNotEmpty, IsString } from 'class-validator';

export class CheckoutDto {
  @IsString({ message: 'planCode harus berupa teks' })
  @IsNotEmpty({ message: 'planCode wajib diisi (mis. STANDARD)' })
  planCode!: string;
}
