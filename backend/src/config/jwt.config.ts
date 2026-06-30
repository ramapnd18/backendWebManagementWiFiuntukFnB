import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Tanpa fallback demi keamanan — gagal cepat bila env belum diset.
    throw new Error(
      'JWT_SECRET wajib diset di environment (tidak ada nilai default).',
    );
  }
  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  };
});
