import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';
import { AuthGate } from '../../components/auth-gate';
import { WorkspaceProvider } from '../../components/workspace-provider';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </AuthGate>
  );
}
