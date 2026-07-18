import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // selaras dengan main.ts
    await app.init();
  });

  // Catatan: AppModule tidak mendaftarkan AppController (tak ada route root).
  // Smoke test: app boot + JwtAuthGuard aktif → endpoint terproteksi balas 401 tanpa token.
  it('GET /api/billing/me tanpa token → 401', () => {
    return request(app.getHttpServer()).get('/api/billing/me').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
