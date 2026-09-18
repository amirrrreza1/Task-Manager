import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';
import { DEMO_RESTRICTED_KEY, DEMO_WRITABLE_KEY } from '../decorators/demo-access.decorator';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class DemoAccountGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user?.isDemoAccount) return true;

    const targets = [context.getHandler(), context.getClass()];
    const restricted = this.reflector.getAllAndOverride<boolean>(DEMO_RESTRICTED_KEY, targets);
    const writable = this.reflector.getAllAndOverride<boolean>(DEMO_WRITABLE_KEY, targets);

    if (!restricted && (READ_ONLY_METHODS.has(request.method) || writable)) return true;

    throw new ForbiddenException({
      code: 'DEMO_RESTRICTED',
      message:
        'This action is disabled in the public demo. Self-host the project to access full administration features.',
    });
  }
}
