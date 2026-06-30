import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import {
  type AuthUser,
  serverScopeWhere,
  assertOwnerAccess,
} from '../../common/scope.util.js';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  /**
   * Menghasilkan prompt AI berdasarkan konfigurasi
   */
  private generatePrompt(configJson: string): string {
    return `Anda adalah seorang Network Engineer dan Mikrotik Expert. Berikut adalah konfigurasi dari sebuah router Mikrotik yang digunakan untuk layanan Hotspot voucher FnB. Tugas Anda adalah menganalisis konfigurasi ini secara menyeluruh, mencakup system resource, profil hotspot, IP pool, DHCP, dan DNS. Temukan apakah ada masalah keamanan, kesalahan konfigurasi (misconfig), atau area yang bisa dioptimalkan untuk performa jaringan. Berikan minimal 3 temuan (findings) relevan dan berikan saran perbaikan (fix) yang spesifik dan praktis untuk masing-masing temuan. Sajikan hasil analisis Anda dalam format Markdown yang rapi dengan struktur:
1. Ringkasan Kondisi Server
2. Temuan Utama (minimal 3)
3. Saran Perbaikan
4. Kesimpulan.

Konfigurasi: 
${configJson}`;
  }

  /**
   * Memanggil Gemini API
   */
  private async callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new BadRequestException("API Key untuk Google Gemini belum dikonfigurasi di server (.env).");
    }

    const model = 'gemini-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API Error: ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Tidak ada respon dari AI.';
  }

  /**
   * Memanggil OpenRouter API
   */
  private async callOpenRouter(prompt: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!apiKey) {
      throw new BadRequestException("API Key untuk OpenRouter belum dikonfigurasi di server (.env).");
    }

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-OpenRouter-Title': 'WiFi Management System'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API Error: ${error}`);
    }

    const data = await response.json();
    // OpenRouter may return a refusal in the message object or normal content
    const message = data.choices?.[0]?.message;
    if (message?.refusal) {
        return `Penolakan dari AI: ${message.refusal}`;
    }
    return message?.content || 'Tidak ada respon dari AI.';
  }

  /**
   * Memanggil OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY || '';
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API Error: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Tidak ada respon dari AI.';
  }

  /**
   * Memanggil Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    const url = 'https://api.anthropic.com/v1/messages';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API Error: ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Tidak ada respon dari AI.';
  }

  /**
   * Ambil konfigurasi hotspot dari MikroTik dan kirim ke LLM untuk dianalisis.
   */
  async analyzeServer(serverId: string, provider: string, user: AuthUser): Promise<any> {

    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(`Router dengan ID ${serverId} tidak ditemukan`);
    }
    assertOwnerAccess(user, server.ownerId);

    // 1. Tarik data konfigurasi
    let configData;
    try {
      configData = await this.mikrotikService.getFullConfig(serverId);
    } catch (err: any) {
      throw new BadRequestException(`Gagal menarik konfigurasi dari router: ${err.message}`);
    }

    const configJson = JSON.stringify(configData, null, 2);
    const prompt = this.generatePrompt(configJson);

    let resultMd = '';
    const actualProvider = provider?.toLowerCase() || 'gemini';

    // 2. Panggil provider
    try {
      if (actualProvider === 'openrouter') {
        resultMd = await this.callOpenRouter(prompt);
      } else if (actualProvider === 'openai') {
        resultMd = await this.callOpenAI(prompt);
      } else if (actualProvider === 'anthropic') {
        resultMd = await this.callAnthropic(prompt);
      } else {
        resultMd = await this.callGemini(prompt);
      }
    } catch (err: any) {
      throw new BadRequestException(`Gagal memanggil LLM provider (${actualProvider}): ${err.message}`);
    }

    // 3. Simpan hasil
    const report = await this.prisma.aiReport.create({
      data: {
        serverId,
        provider: actualProvider,
        configJson,
        resultMd,
        status: 'COMPLETED',
      },
    });

    // 4. Catat Log
    await this.activityLogService.logAction({
      action: 'AI_ANALYSIS_COMPLETED',
      serverId,
      entity: 'AiReport',
      entityId: report.id,
      detail: `Analisis AI selesai menggunakan provider: ${actualProvider}`,
    });

    return report;
  }

  /**
   * Ambil semua laporan AI dari database.
   */
  async getReports(user: AuthUser) {
    return this.prisma.aiReport.findMany({
      where: { server: serverScopeWhere(user) },
      include: {
        server: { select: { name: true, host: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Ambil satu laporan AI berdasarkan ID.
   */
  async getReportById(reportId: string, user: AuthUser) {
    const report = await this.prisma.aiReport.findUnique({
      where: { id: reportId },
      include: {
        server: { select: { name: true, host: true, ownerId: true } }
      }
    });

    if (!report) {
      throw new NotFoundException(`Laporan dengan ID ${reportId} tidak ditemukan`);
    }
    assertOwnerAccess(user, report.server.ownerId);
    return report;
  }

  /**
   * Hapus satu laporan AI berdasarkan ID.
   */
  async deleteReport(reportId: string, user: AuthUser) {
    const report = await this.prisma.aiReport.findUnique({
      where: { id: reportId },
      include: { server: { select: { ownerId: true } } },
    });
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID ${reportId} tidak ditemukan`);
    }
    assertOwnerAccess(user, report.server.ownerId);

    await this.prisma.aiReport.delete({ where: { id: reportId } });

    await this.activityLogService.logAction({
      action: 'AI_ANALYSIS_DELETED',
      serverId: report.serverId,
      entity: 'AiReport',
      entityId: reportId,
      detail: 'Menghapus laporan AI analysis',
    });

    return { success: true, message: 'Laporan berhasil dihapus' };
  }

  /**
   * Hapus SEMUA laporan AI (clear riwayat).
   */
  async deleteAllReports(user: AuthUser) {
    // Scoping: hanya hapus laporan dari router milik user
    const result = await this.prisma.aiReport.deleteMany({
      where: { server: serverScopeWhere(user) },
    });

    await this.activityLogService.logAction({
      action: 'AI_ANALYSIS_DELETED',
      entity: 'AiReport',
      detail: `Menghapus semua laporan AI (${result.count})`,
    });

    return {
      success: true,
      deletedCount: result.count,
      message: `${result.count} laporan berhasil dihapus`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AI CHAT WIDGET (kontekstual, multi-turn)
  // ───────────────────────────────────────────────────────────────────────────

  /** Dispatch ke provider LLM sesuai argumen / env LLM_PROVIDER (default gemini). */
  private async callLLM(prompt: string, provider?: string): Promise<string> {
    const ap =
      provider?.toLowerCase() ||
      process.env.LLM_PROVIDER?.toLowerCase() ||
      'gemini';
    if (ap === 'openrouter') return this.callOpenRouter(prompt);
    if (ap === 'openai') return this.callOpenAI(prompt);
    if (ap === 'anthropic') return this.callAnthropic(prompt);
    return this.callGemini(prompt);
  }

  /**
   * Bangun blok konteks dari DATA MILIK USER (ter-scope): daftar router + status,
   * aktivitas terbaru, laporan AI terakhir, dan (bila serverId) konfigurasi live router.
   */
  private async buildChatContext(
    user: AuthUser,
    serverId?: string,
  ): Promise<string> {
    const scope = serverScopeWhere(user); // {} (super) | { ownerId }
    const serverWhere = serverId ? { id: serverId } : scope;

    const servers = await this.prisma.mikrotikServer.findMany({
      where: serverWhere,
      select: {
        name: true,
        host: true,
        lastStatus: true,
        lastCheckedAt: true,
        hotspotName: true,
      },
      take: 20,
    });

    const logWhere = serverId
      ? { serverId }
      : user.role === 'SUPER_ADMIN'
        ? {}
        : { server: scope };
    const logs = await this.prisma.activityLog.findMany({
      where: logWhere,
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        action: true,
        detail: true,
        createdAt: true,
        server: { select: { name: true } },
      },
    });

    const reportWhere = serverId
      ? { serverId }
      : user.role === 'SUPER_ADMIN'
        ? {}
        : { server: scope };
    const report = await this.prisma.aiReport.findFirst({
      where: reportWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        resultMd: true,
        createdAt: true,
        server: { select: { name: true } },
      },
    });

    let liveConfig = '';
    if (serverId) {
      try {
        const cfg = await this.mikrotikService.getFullConfig(serverId);
        liveConfig = JSON.stringify(cfg).slice(0, 4000);
      } catch (err: any) {
        liveConfig = `(Tidak dapat menarik konfigurasi live dari router: ${err.message})`;
      }
    }

    const lines: string[] = ['=== KONTEKS JARINGAN MILIK USER ==='];
    lines.push(`Jumlah router: ${servers.length}`);
    for (const s of servers) {
      lines.push(
        `- ${s.name} (${s.host}) | status: ${s.lastStatus} | cek terakhir: ${s.lastCheckedAt ? new Date(s.lastCheckedAt).toISOString() : '-'}${s.hotspotName ? ` | hotspot: ${s.hotspotName}` : ''}`,
      );
    }
    if (logs.length) {
      lines.push('\nAktivitas terbaru:');
      for (const l of logs) {
        lines.push(
          `- [${new Date(l.createdAt).toISOString()}] ${l.action}${l.server ? ` @${l.server.name}` : ''}${l.detail ? `: ${l.detail}` : ''}`,
        );
      }
    }
    if (report) {
      lines.push(
        `\nAnalisis AI terakhir${report.server ? ` (${report.server.name})` : ''} pada ${new Date(report.createdAt).toISOString()}:`,
      );
      lines.push(report.resultMd.slice(0, 2000));
    }
    if (liveConfig) {
      lines.push('\nKonfigurasi live router (ringkas):');
      lines.push(liveConfig);
    }
    lines.push('=== AKHIR KONTEKS ===');
    return lines.join('\n');
  }

  /**
   * Endpoint chat utama. Menyuntik konteks jaringan user ke prompt, mempertahankan
   * riwayat percakapan (multi-turn), lalu memanggil LLM. Gagal LLM → tidak ada data tersimpan.
   */
  async chat(
    dto: { question: string; serverId?: string; sessionId?: string },
    user: AuthUser,
  ) {
    // 1. Validasi & scoping router (bila ada)
    if (dto.serverId) {
      const server = await this.prisma.mikrotikServer.findUnique({
        where: { id: dto.serverId },
        select: { id: true, ownerId: true },
      });
      if (!server) {
        throw new NotFoundException(
          `Router dengan ID ${dto.serverId} tidak ditemukan`,
        );
      }
      assertOwnerAccess(user, server.ownerId);
    }

    // 2. Muat sesi (bila lanjutan) + pastikan milik user
    let session: { id: string } | null = null;
    let history: { role: string; content: string }[] = [];
    if (dto.sessionId) {
      const s = await this.prisma.aiChatSession.findUnique({
        where: { id: dto.sessionId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!s || s.userId !== user.id) {
        throw new NotFoundException('Sesi chat tidak ditemukan');
      }
      session = { id: s.id };
      history = s.messages.map((m) => ({ role: m.role, content: m.content }));
    }

    // 3. Bangun konteks dari data user
    const context = await this.buildChatContext(user, dto.serverId);

    // 4. Rakit prompt: persona + konteks + riwayat + pertanyaan
    const sys =
      'Anda adalah asisten AI ahli jaringan & MikroTik untuk layanan WiFi Hotspot FnB. ' +
      'Jawab ringkas, akurat, dan praktis dalam Bahasa Indonesia BERDASARKAN konteks kondisi ' +
      'jaringan user di bawah. Bila informasi tidak ada di konteks, katakan dengan jujur.';
    const historyText = history
      .map((m) => `${m.role === 'USER' ? 'User' : 'Asisten'}: ${m.content}`)
      .join('\n');
    const prompt = [sys, '', context, '', historyText, `User: ${dto.question}`, 'Asisten:']
      .filter((x) => x !== '')
      .join('\n');

    // 5. Panggil LLM (gagal → tidak ada yang disimpan)
    let answer: string;
    try {
      answer = await this.callLLM(prompt);
    } catch (err: any) {
      throw new BadRequestException(`Gagal memanggil AI: ${err.message}`);
    }

    // 6. Simpan transaksional: buat sesi (bila baru) + pesan user & asisten
    const saved = await this.prisma.$transaction(async (db) => {
      const s = session
        ? session
        : await db.aiChatSession.create({
            data: {
              userId: user.id,
              serverId: dto.serverId ?? null,
              title: dto.question.slice(0, 60),
            },
          });
      await db.aiChatMessage.create({
        data: { sessionId: s.id, role: 'USER', content: dto.question },
      });
      await db.aiChatMessage.create({
        data: { sessionId: s.id, role: 'ASSISTANT', content: answer },
      });
      await db.aiChatSession.update({
        where: { id: s.id },
        data: { updatedAt: new Date() },
      });
      return s;
    });

    return { sessionId: saved.id, answer, serverId: dto.serverId ?? null };
  }

  /** Daftar sesi chat milik user (terbaru dulu). */
  async listSessions(user: AuthUser) {
    return this.prisma.aiChatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        serverId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  /** Detail sesi + pesan (hanya milik user). */
  async getSession(id: string, user: AuthUser) {
    const s = await this.prisma.aiChatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!s || s.userId !== user.id) {
      throw new NotFoundException('Sesi chat tidak ditemukan');
    }
    return s;
  }

  /** Hapus sesi chat (hanya milik user). */
  async deleteSession(id: string, user: AuthUser) {
    const s = await this.prisma.aiChatSession.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!s || s.userId !== user.id) {
      throw new NotFoundException('Sesi chat tidak ditemukan');
    }
    await this.prisma.aiChatSession.delete({ where: { id } });
    return { success: true, message: 'Sesi chat dihapus' };
  }
}
