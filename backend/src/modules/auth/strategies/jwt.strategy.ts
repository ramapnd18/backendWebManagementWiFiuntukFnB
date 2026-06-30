import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  ownerId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        ownerId: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Token tidak valid atau pengguna tidak ditemukan',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun dinonaktifkan');
    }

    // Objek ini menjadi request.user — dipakai RolesGuard (role) & scope util (ownerId)
    return user;
  }
}
