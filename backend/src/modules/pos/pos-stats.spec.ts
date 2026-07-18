import { PosService } from './pos.service.js';
import type { AuthUser } from '../../common/scope.util.js';

// Unit murni untuk dailyTransactionStats: prisma.$queryRaw di-mock.
const owner: AuthUser = { id: 'owner1', role: 'OWNER' };

function makePrisma() {
  return { $queryRaw: jest.fn() };
}

describe('PosService.dailyTransactionStats', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PosService;

  beforeEach(() => {
    prisma = makePrisma();
    // mikrotik & activityLog tak dipakai method ini → null aman
    service = new PosService(prisma as any, null as any, null as any);
  });

  it('isi tanggal kosong dengan count:0 dalam rentang eksplisit', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { date: new Date('2026-07-02T00:00:00Z'), count: 7 },
    ]);
    const res = await service.dailyTransactionStats(owner, {
      from: '2026-07-01',
      to: '2026-07-03',
    });
    expect(res.data).toEqual([
      { date: '2026-07-01', count: 0 },
      { date: '2026-07-02', count: 7 },
      { date: '2026-07-03', count: 0 },
    ]);
  });

  it('default rentang 30 hari (inklusif) → 30 baris', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const res = await service.dailyTransactionStats(owner, {});
    expect(res.data).toHaveLength(30);
    expect(res.data.every((d) => d.count === 0)).toBe(true);
  });

  it('count di-cast ke number', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { date: new Date('2026-07-01T00:00:00Z'), count: '5' as any },
    ]);
    const res = await service.dailyTransactionStats(owner, {
      from: '2026-07-01',
      to: '2026-07-01',
    });
    expect(res.data[0]).toEqual({ date: '2026-07-01', count: 5 });
  });
});
