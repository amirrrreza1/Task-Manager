import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
  email?: string | null;
  telegramUsername?: string | null;
  role: UserRole;
  hasAvatar: boolean;
  isBootstrapAdmin: boolean;
  isDemoAccount: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
}
