import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarSeed: string;
  isBootstrapAdmin: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
}
