import { MonitoringService } from './monitoring.service.js';
import type { AuthUser } from '../../common/scope.util.js';

const owner: AuthUser = { id: 'owner1', role: 'OWNER' };

describe('MonitoringService.getHealthSummary', () => {
  function build(rows: any[]) {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    const service = new MonitoringService(prisma as any, null as any);
    return { service, prisma };
  }

  it('hitung uptimePct & downtimeMinutes', async () => {
    const { service } = build([
      { date: new Date('2026-07-18T00:00:00Z'), checks: 100, fails: 1 },
    ]);
    const res = await service.getHealthSummary(owner, { days: 1 });
    expect(res.data[0]).toEqual({
      date: '2026-07-18',
      checks: 100,
      fails: 1,
      uptimePct: 99,
      downtimeMinutes: 14, // round(1/100 * 1440)
    });
  });

  it('100% uptime bila tak ada fails', async () => {
    const { service } = build([
      { date: new Date('2026-07-18T00:00:00Z'), checks: 50, fails: 0 },
    ]);
    const res = await service.getHealthSummary(owner, {});
    expect(res.data[0].uptimePct).toBe(100);
    expect(res.data[0].downtimeMinutes).toBe(0);
  });

  it('checks=0 tidak bagi-nol', async () => {
    const { service } = build([
      { date: new Date('2026-07-18T00:00:00Z'), checks: 0, fails: 0 },
    ]);
    const res = await service.getHealthSummary(owner, {});
    expect(res.data[0].uptimePct).toBe(0);
    expect(res.data[0].downtimeMinutes).toBe(0);
  });
});
