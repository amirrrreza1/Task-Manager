import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'tm_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate with local credentials' })
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(input.username, input.password);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Post('demo')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a restricted public administrator demo session' })
  async demo(@Res({ passthrough: true }) response: Response) {
    const session = await this.auth.loginAsDemo();
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertAllowedOrigin(request);
    const session = await this.auth.refresh(this.readRefreshCookie(request));
    if (session.refreshToken) {
      this.setRefreshCookie(response, session.refreshToken);
    }
    return { accessToken: session.accessToken, user: session.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertAllowedOrigin(request);
    await this.auth.logout(this.readRefreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Put('password')
  @HttpCode(204)
  @ApiBearerAuth()
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() input: ChangePasswordDto) {
    await this.auth.changePassword(user.id, input.currentPassword, input.newPassword);
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get<number>('REFRESH_TOKEN_DAYS', 7) * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }

  private assertAllowedOrigin(request: Request) {
    const origin = request.headers.origin;
    if (!origin) return;
    const allowed = this.config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((value) => value.trim().toLowerCase().replace(/\/$/, ''));
    const normalized = origin.trim().toLowerCase().replace(/\/$/, '');
    if (!allowed.includes(normalized) && !allowed.includes('*')) {
      throw new UnauthorizedException('The request origin is not allowed.');
    }
  }

  private readRefreshCookie(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }
}
