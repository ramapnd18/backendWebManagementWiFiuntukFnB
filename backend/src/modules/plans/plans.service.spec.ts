import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service.js';

// Unit murni: PrismaService di-mock, tanpa DB nyata.
function makePrisma() {
  return {
    plan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subscription: { count: jest.fn() },
    paymentTransaction: { count: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('PlansService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PlansService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PlansService(prisma as any);
  });

  it('findOne lempar 404 bila tak ada', async () => {
    prisma.plan.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create lempar 409 bila code sudah dipakai', async () => {
    prisma.plan.findUnique.mockResolvedValue({ id: 'p1', code: 'STANDARD' });
    await expect(
      service.create({ code: 'STANDARD' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.plan.create).not.toHaveBeenCalled();
  });

  it('create default isActive=true & durationDays null bila kosong', async () => {
    prisma.plan.findUnique.mockResolvedValue(null);
    prisma.plan.create.mockImplementation(({ data }: any) => ({ id: 'p2', ...data }));
    await service.create({
      code: 'PREMIUM', name: 'Premium', price: 250000,
      maxRouters: 10, maxTeknisi: 8, aiAccess: true, apiKeyAccess: true,
    } as any);
    const data = prisma.plan.create.mock.calls[0][0].data;
    expect(data.isActive).toBe(true);
    expect(data.durationDays).toBeNull();
  });

  it('remove tolak paket FREE (400)', async () => {
    prisma.plan.findUnique.mockResolvedValue({ id: 'f', code: 'FREE' });
    await expect(service.remove('f')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove soft-delete bila masih dipakai', async () => {
    prisma.plan.findUnique.mockResolvedValue({ id: 'p', code: 'STANDARD' });
    prisma.$transaction.mockResolvedValue([2, 0]); // subs=2, pays=0
    prisma.plan.update.mockResolvedValue({ id: 'p', isActive: false });
    const res = await service.remove('p');
    expect(res.softDeleted).toBe(true);
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  it('remove hard-delete bila tak dipakai', async () => {
    prisma.plan.findUnique.mockResolvedValue({ id: 'p', code: 'STANDARD' });
    prisma.$transaction.mockResolvedValue([0, 0]);
    prisma.plan.delete.mockResolvedValue({});
    const res = await service.remove('p');
    expect(res.softDeleted).toBe(false);
    expect(prisma.plan.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
  });
});
