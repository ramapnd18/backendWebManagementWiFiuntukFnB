/**
 * AiController — Skeleton
 *
 * Mengekspos endpoint untuk menjalankan AI analysis dan mengambil laporan.
 * Dokumentasi Swagger di-generate otomatis dari dekorator @nestjs/swagger.
 */
import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { type AuthUser } from '../../common/scope.util.js';
import { AiService } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';

// Analisis AI = fitur teknis → hanya TEKNISI & SUPER_ADMIN. Owner → 403.
@ApiTags('AI Analysis')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEKNISI', 'SUPER_ADMIN')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /ai/chat — Tanya AI tentang kondisi jaringan (kontekstual, multi-turn).
   * Semua role boleh (Owner read-only pun); konteks ter-scope ke router milik user.
   */
  @Post('chat')
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'AI chat kontekstual (inject log/konfig router milik user)' })
  @ApiResponse({ status: 201, description: 'Jawaban AI + sessionId' })
  @ApiResponse({ status: 400, description: 'LLM gagal / belum dikonfigurasi' })
  @ApiResponse({ status: 403, description: 'Bukan router milik Anda' })
  @ApiResponse({ status: 404, description: 'Router / sesi tidak ditemukan' })
  async chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.aiService.chat(dto, user);
  }

  /** GET /ai/chat/sessions — daftar sesi chat milik user. */
  @Get('chat/sessions')
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Daftar sesi chat AI milik user' })
  @ApiResponse({ status: 200, description: 'Daftar sesi berhasil diambil' })
  async listChatSessions(@CurrentUser() user: AuthUser) {
    return this.aiService.listSessions(user);
  }

  /** GET /ai/chat/sessions/:id — detail sesi + pesan. */
  @Get('chat/sessions/:id')
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Detail sesi chat + riwayat pesan' })
  @ApiParam({ name: 'id', description: 'ID sesi chat' })
  @ApiResponse({ status: 200, description: 'Detail sesi berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Sesi tidak ditemukan' })
  async getChatSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.getSession(id, user);
  }

  /** DELETE /ai/chat/sessions/:id — hapus sesi chat. */
  @Delete('chat/sessions/:id')
  @Roles('OWNER', 'TEKNISI', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Hapus sesi chat AI' })
  @ApiParam({ name: 'id', description: 'ID sesi chat' })
  @ApiResponse({ status: 200, description: 'Sesi berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'Sesi tidak ditemukan' })
  async deleteChatSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.deleteSession(id, user);
  }

  /**
   * POST /ai/servers/:id/analyze
   * Jalankan AI analysis untuk server MikroTik tertentu.
   */
  @Post('servers/:id/analyze')
  // Batasi panggilan LLM yang mahal: maksimal 10 / jam / IP
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({
    summary: 'Analisis konfigurasi hotspot MikroTik menggunakan AI',
  })
  @ApiParam({ name: 'id', description: 'ID server MikroTik' })
  @ApiResponse({ status: 201, description: 'Analisis berhasil dijalankan' })
  @ApiResponse({ status: 404, description: 'Server tidak ditemukan' })
  @ApiResponse({ status: 503, description: 'LLM provider tidak tersedia' })
  async analyzeServer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { provider: string },
  ) {
    return this.aiService.analyzeServer(id, body.provider, user);
  }

  /**
   * GET /ai/reports
   * Ambil semua laporan AI.
   */
  @Get('reports')
  @ApiOperation({ summary: 'Daftar semua laporan AI analysis' })
  @ApiResponse({ status: 200, description: 'Daftar laporan berhasil diambil' })
  async getReports(@CurrentUser() user: AuthUser) {
    return this.aiService.getReports(user);
  }

  /**
   * GET /ai/reports/:id
   * Ambil satu laporan AI berdasarkan ID.
   */
  @Get('reports/:id')
  @ApiOperation({ summary: 'Detail laporan AI analysis' })
  @ApiParam({ name: 'id', description: 'ID laporan AI' })
  @ApiResponse({ status: 200, description: 'Detail laporan berhasil diambil' })
  @ApiResponse({ status: 404, description: 'Laporan tidak ditemukan' })
  async getReportById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.getReportById(id, user);
  }

  /**
   * DELETE /ai/reports
   * Hapus SEMUA laporan AI (clear riwayat).
   */
  @Delete('reports')
  @ApiOperation({ summary: 'Hapus semua laporan AI analysis' })
  @ApiResponse({ status: 200, description: 'Semua laporan berhasil dihapus' })
  async deleteAllReports(@CurrentUser() user: AuthUser) {
    return this.aiService.deleteAllReports(user);
  }

  /**
   * DELETE /ai/reports/:id
   * Hapus satu laporan AI berdasarkan ID.
   */
  @Delete('reports/:id')
  @ApiOperation({ summary: 'Hapus satu laporan AI analysis' })
  @ApiParam({ name: 'id', description: 'ID laporan AI' })
  @ApiResponse({ status: 200, description: 'Laporan berhasil dihapus' })
  @ApiResponse({ status: 404, description: 'Laporan tidak ditemukan' })
  async deleteReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.deleteReport(id, user);
  }
}
