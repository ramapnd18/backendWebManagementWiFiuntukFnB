import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

/**
 * E2E: RBAC guard + enforcement paket untuk endpoint FE 2026-07-18.
 * Butuh DB up + seed (admin/owner/teknisi + paket FREE/STANDARD).
 * Bootstrap meniru main.ts (prefix /api + ValidationPipe).
 */
describe('RBAC & Enforcement (e2e)', () => {
  let app: INestApplication;
  let saToken = '';
  let ownerToken = '';

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    saToken = (await login('admin@wifimanagement.local', 'admin123')).body.accessToken;
    ownerToken = (await login('owner@wifimanagement.local', 'owner123')).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RBAC /plans (SUPER_ADMIN only)', () => {
    it('tanpa token → 401', () =>
      request(app.getHttpServer()).get('/api/plans').expect(401));

    it('OWNER → 403', () =>
      request(app.getHttpServer())
        .get('/api/plans')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403));

    it('SUPER_ADMIN → 200 (list paket dgn field baru)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/plans')
        .set('Authorization', `Bearer ${saToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const free = res.body.find((p: any) => p.code === 'FREE');
      expect(free).toHaveProperty('maxTeknisi');
      expect(free).toHaveProperty('aiAccess');
      expect(free).toHaveProperty('apiKeyAccess');
    });
  });

  describe('RBAC /admin/owners (SUPER_ADMIN only)', () => {
    it('OWNER → 403', () =>
      request(app.getHttpServer())
        .get('/api/admin/owners')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403));

    it('SUPER_ADMIN → 200 { data, meta }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/owners')
        .set('Authorization', `Bearer ${saToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta.total');
    });
  });

  describe('Enforcement paket FREE (owner demo)', () => {
    it('AI chat → 403 (aiAccess=false)', () =>
      request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ question: 'halo' })
        .expect(403));

    it('buat teknisi melebihi kuota → 403', () =>
      request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: `tek_${Date.now()}@x.com`, password: 'secret123', name: 'Tek Uji' })
        .expect(403));

    it('buat POS API key → 403 (apiKeyAccess=false, bila owner punya server)', async () => {
      const servers = await request(app.getHttpServer())
        .get('/api/servers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const list = servers.body?.data ?? servers.body;
      if (!Array.isArray(list) || list.length === 0) {
        console.warn('skip: owner belum punya server');
        return;
      }
      await request(app.getHttpServer())
        .post('/api/pos-keys')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Kasir E2E', serverId: list[0].id })
        .expect(403);
    });
  });
});
