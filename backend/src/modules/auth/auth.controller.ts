import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Anti brute-force: maksimal 5 percobaan login / menit / IP
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Login admin dan dapatkan JWT token' })
  @ApiResponse({ status: 200, description: 'Login berhasil' })
  @ApiResponse({
    status: 401,
    description: 'Email atau password salah / Akun dinonaktifkan',
  })
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(loginDto);
    return this.authService.login(user);
  }

  @Post('register')
  // Batasi abuse pendaftaran: maksimal 5 request / menit / IP
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Registrasi mandiri pemilik (OWNER) + auto-login',
  })
  @ApiResponse({ status: 201, description: 'Registrasi berhasil, JWT dikembalikan' })
  @ApiResponse({ status: 400, description: 'Email sudah terdaftar / body tidak valid' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Login/registrasi via Google (ID token) + JWT' })
  @ApiResponse({ status: 200, description: 'Login Google berhasil' })
  @ApiResponse({ status: 401, description: 'Token Google tidak valid' })
  async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
    return this.authService.googleLogin(googleLoginDto.idToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dapatkan profil admin yang sedang aktif' })
  @ApiResponse({ status: 200, description: 'Profil berhasil diambil' })
  @ApiResponse({
    status: 401,
    description: 'Token tidak valid atau tidak disertakan',
  })
  async getProfile(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.getProfile(user.id);
  }
}
