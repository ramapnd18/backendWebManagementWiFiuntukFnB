import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── Security Headers (helmet) ────────────────────────────────────────────
  app.use(helmet());

  // ─── Global Prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // ─── Global Validation Pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true, // auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger / OpenAPI ────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('WiFi Management API')
    .setDescription(
      'REST API untuk sistem manajemen WiFi FnB — MikroTik Hotspot Voucher + POS + AI Analysis',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    // API key untuk endpoint POS (header x-api-key) — dipakai mesin kasir
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'pos-api-key',
    )
    .addTag('Auth', 'Autentikasi admin')
    .addTag('Servers', 'Manajemen server MikroTik')
    .addTag('Profiles', 'Hotspot user profile')
    .addTag('Vouchers', 'Generate dan kelola voucher WiFi')
    .addTag('POS', 'Integrasi Point of Sale')
    .addTag('Monitoring', 'Monitoring user hotspot aktif')
    .addTag('AI Analysis', 'Analisis konfigurasi MikroTik dengan AI')
    .addTag('Logs', 'Log aktivitas sistem')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ─── Start Server ─────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  console.log(
    `\n🚀 WiFi Management API berjalan di: http://localhost:${port}/api`,
  );
  console.log(`📚 Swagger Docs: http://localhost:${port}/api/docs\n`);
}

bootstrap();
