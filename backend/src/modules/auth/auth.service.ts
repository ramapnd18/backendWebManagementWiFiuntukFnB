import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClientId: string;
  private googleClient?: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private billingService: BillingService,
    private configService: ConfigService,
  ) {
    this.googleClientId =
      this.configService.get<string>('app.googleClientId') ?? '';
  }

  async validateUser(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun dinonaktifkan');
    }

    // Akun yang hanya login via Google tidak punya password → tolak login password
    if (!user.password) {
      throw new UnauthorizedException(
        'Akun ini terdaftar via Google. Silakan masuk dengan Google.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    // Return user without password
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;
    return result;
  }

  /**
   * Registrasi mandiri pemilik bisnis. Role dipaksa OWNER (cegah privilege
   * escalation), langganan FREE dibuat otomatis, lalu auto-login (kembalikan JWT).
   */
  async register(dto: RegisterDto) {
    const hashed = await bcrypt.hash(dto.password, 12);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashed,
          name: dto.name,
          role: 'OWNER',
          ownerId: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Email sudah terdaftar');
      }
      throw error;
    }

    // Owner baru → pastikan punya langganan FREE (idempoten)
    await this.billingService.ensureFreeSubscription(user.id);

    return this.login(user);
  }

  /**
   * Login/registrasi via Google. Frontend mengirim ID token; backend verifikasi,
   * cari user by email (tautkan googleId) atau buat OWNER baru (+ langganan FREE),
   * lalu kembalikan JWT.
   */
  async googleLogin(idToken: string) {
    if (!this.googleClientId) {
      throw new BadRequestException(
        'Login Google belum dikonfigurasi (GOOGLE_CLIENT_ID kosong)',
      );
    }

    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(this.googleClientId);
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(
        `Verifikasi Google ID token gagal: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new UnauthorizedException('Token Google tidak valid');
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException(
        'Email Google tidak terverifikasi atau tidak tersedia',
      );
    }

    const email = payload.email;
    const googleId = payload.sub;
    const name = payload.name ?? email.split('@')[0];

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Akun dinonaktifkan');
      }
      // Tautkan googleId bila belum tersimpan
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        });
      }
    } else {
      // Akun baru via Google → OWNER, tanpa password
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          googleId,
          password: null,
          role: 'OWNER',
          ownerId: null,
        },
      });
      await this.billingService.ensureFreeSubscription(user.id);
    }

    return this.login(user);
  }

  login(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    ownerId: string | null;
  }) {
    // role & ownerId disuntik ke JWT agar RolesGuard + scoping bisa baca dari token
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ownerId: user.ownerId,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        ownerId: user.ownerId,
      },
    };
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        ownerId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Pengguna tidak ditemukan');
    }

    return user;
  }
}
