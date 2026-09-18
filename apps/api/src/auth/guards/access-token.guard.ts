import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AccessTokenPayload, AuthenticatedUser } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('A valid access token is required.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        displayName: true,
        color: true,
        role: true,
        hasAvatar: true,
        isBootstrapAdmin: true,
        isDemoAccount: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('This account is inactive.');
    }

    request.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      color: user.color,
      role: user.role,
      hasAvatar: user.hasAvatar,
      isBootstrapAdmin: user.isBootstrapAdmin,
      isDemoAccount: user.isDemoAccount,
    };
    return true;
  }
}
