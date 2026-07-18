import { ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service.js';

function makePrisma() {
  return {
    subscription: { findFirst: jest.fn() },
    plan: { findUnique: jest.fn() },
    mikrotikServer: { count: jest.fn() },
    user: { count: jest.fn() },
  };
}

describe('BillingService — limit & fitur paket', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: BillingService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new BillingService(prisma as any, null as any, null as any);
  });

  describe('getEffectiveLimit', () => {
    it('pakai langganan aktif (field paket baru diteruskan)', async () => {
      prisma.subscription.findFirst.mockResolvedValueOnce({
        expiredAt: null,
        plan: {
          code: 'STANDARD', name: 'Standar', maxRouters: 5,
          maxTeknisi: 3, aiAccess: true, apiKeyAccess: true,
        },
      });
      const limit = await service.getEffectiveLimit('owner1');
      expect(limit).toMatchObject({
        planCode: 'STANDARD', maxRouters: 5, maxTeknisi: 3,
        aiAccess: true, apiKeyAccess: true, expired: false,
      });
    });

    it('fallback ke FREE bila tak ada langganan aktif', async () => {
      prisma.subscription.findFirst
        .mockResolvedValueOnce(null) // active
        .mockResolvedValueOnce(null); // lapsed
      prisma.plan.findUnique.mockResolvedValue({
        maxRouters: 1, maxTeknisi: 1, aiAccess: false, apiKeyAccess: false, name: 'Gratis',
      });
      const limit = await service.getEffectiveLimit('owner1');
      expect(limit).toMatchObject({
        planCode: 'FREE', maxTeknisi: 1, aiAccess: false,
        apiKeyAccess: false, expired: false,
      });
    });
  });

  describe('assertCanAddTeknisi', () => {
    it('tolak bila kuota penuh (403)', async () => {
      jest.spyOn(service, 'getEffectiveLimit').mockResolvedValue({
        maxTeknisi: 1, expired: false,
      } as any);
      prisma.user.count.mockResolvedValue(1);
      await expect(service.assertCanAddTeknisi('o')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lolos bila masih ada slot', async () => {
      jest.spyOn(service, 'getEffectiveLimit').mockResolvedValue({
        maxTeknisi: 3, expired: false,
      } as any);
      prisma.user.count.mockResolvedValue(1);
      await expect(service.assertCanAddTeknisi('o')).resolves.toBeUndefined();
    });

    it('tolak bila langganan kadaluarsa', async () => {
      jest.spyOn(service, 'getEffectiveLimit').mockResolvedValue({
        maxTeknisi: 3, expired: true, expiredAt: new Date(), expiredPlanName: 'Standar',
      } as any);
      await expect(service.assertCanAddTeknisi('o')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertFeatureAccess', () => {
    it('tolak bila fitur tak termasuk paket (403)', async () => {
      jest.spyOn(service, 'getEffectiveLimit').mockResolvedValue({
        aiAccess: false, apiKeyAccess: false, planName: 'Gratis',
      } as any);
      await expect(service.assertFeatureAccess('o', 'aiAccess')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertFeatureAccess('o', 'apiKeyAccess')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lolos bila fitur termasuk paket', async () => {
      jest.spyOn(service, 'getEffectiveLimit').mockResolvedValue({
        aiAccess: true, apiKeyAccess: true, planName: 'Standar',
      } as any);
      await expect(service.assertFeatureAccess('o', 'aiAccess')).resolves.toBeUndefined();
    });
  });
});
