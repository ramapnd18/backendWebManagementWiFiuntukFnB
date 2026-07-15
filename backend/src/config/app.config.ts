import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // Google OAuth: Client ID untuk verifikasi ID token (login Google). Kosong → login Google nonaktif.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
}));
