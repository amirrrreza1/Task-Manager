'use client';

import { BuildingCommunity } from '@appica/icons-react';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { useWorkspace } from './workspace-provider';

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspaceId } = useWorkspace();

  if (workspaces.length === 0) return null;

  return (
    <div className="workspace-switcher">
      <div className="workspace-switcher-header">
        <span className="workspace-switcher-label">Active Workspace</span>
      </div>
      <div className="workspace-switcher-control">
        <BuildingCommunity aria-hidden="true" className="workspace-switcher-icon" />
        <select
          aria-label="Select active workspace"
          className="workspace-select-input"
          value={currentWorkspace?.id ?? ''}
          onChange={(e) => setCurrentWorkspaceId(e.target.value)}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>
      {user?.role === 'ADMIN' && (
        <div className="workspace-switcher-actions">
          <Link className="workspace-manage-link" href="/settings/workspaces">
            Manage Workspaces
          </Link>
        </div>
      )}
    </div>
  );
}
