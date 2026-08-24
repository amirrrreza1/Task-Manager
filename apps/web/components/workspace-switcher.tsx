'use client';

import { useRouter } from 'next/navigation';
import { Select } from './design-system';
import { useAuth } from './auth-provider';
import { useWorkspace } from './workspace-provider';

const CREATE_WORKSPACE_VALUE = '__create__';

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspaceId } = useWorkspace();

  if (workspaces.length === 0) return null;

  const canCreate = user?.role === 'ADMIN';

  return (
    <div
      className={canCreate ? 'workspace-select workspace-select--with-create' : 'workspace-select'}
    >
      <Select
        aria-label="Select workspace"
        value={currentWorkspace?.id ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CREATE_WORKSPACE_VALUE) {
            router.push('/settings/workspaces?create=1');
            return;
          }
          setCurrentWorkspaceId(next);
        }}
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.name}
          </option>
        ))}
        {canCreate ? <option value={CREATE_WORKSPACE_VALUE}>+ Create workspace</option> : null}
      </Select>
    </div>
  );
}
