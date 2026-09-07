'use client';

import { Edit, FileText, Trash, User } from '@appica/icons-react';
import type { BoardSubtask, ManagedUser, TaskPriority } from '../lib/types';
import { CardMenu, CardMenuItem, CardMenuSeparator, CardMenuSubmenu } from './card-menu-primitives';

interface SubtaskCardMenuProps {
  subtask: BoardSubtask;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled?: boolean;
  onEditTitle: (subtask: BoardSubtask) => void;
  onEditDescription: (subtask: BoardSubtask) => void;
  onEditAssignee: (subtask: BoardSubtask) => void;
  onAssignUser?: (subtask: BoardSubtask, userId: string | null) => void | Promise<void>;
  onPriorityChange?: (subtask: BoardSubtask, priority: TaskPriority) => void | Promise<void>;
  onDelete?: (subtask: BoardSubtask) => void | Promise<void>;
}

export function SubtaskCardMenu({
  subtask,
  users = [],
  currentUserId,
  disabled = false,
  onEditTitle,
  onEditDescription,
  onEditAssignee,
  onAssignUser,
  onPriorityChange,
  onDelete,
}: SubtaskCardMenuProps) {
  if (disabled) return null;

  return (
    <CardMenu
      triggerAriaLabel={`Options for subtask ${subtask.title}`}
      triggerClassName="subtask-card-menu-trigger"
      iconSize={13}
      disabled={disabled}
    >
      {({ close }) => (
        <>
          <CardMenuItem
            icon={<Edit size={14} className="menu-icon" />}
            onClick={() => {
              close();
              onEditTitle(subtask);
            }}
          >
            <span>Edit title</span>
          </CardMenuItem>

          <CardMenuItem
            icon={<FileText size={14} className="menu-icon" />}
            onClick={() => {
              close();
              onEditDescription(subtask);
            }}
          >
            <span>Edit description</span>
          </CardMenuItem>

          <CardMenuItem
            icon={<User size={14} className="menu-icon" />}
            onClick={() => {
              close();
              onEditAssignee(subtask);
            }}
          >
            <span>Edit assignee...</span>
          </CardMenuItem>

          <CardMenuSeparator />

          {users.length > 0 && onAssignUser ? (
            <CardMenuSubmenu label="Assignee">
              {currentUserId && subtask.assigneeId !== currentUserId ? (
                <CardMenuItem
                  onClick={() => {
                    close();
                    void onAssignUser(subtask, currentUserId);
                  }}
                >
                  <span>Assign to me</span>
                </CardMenuItem>
              ) : null}
              {subtask.assigneeId ? (
                <CardMenuItem
                  onClick={() => {
                    close();
                    void onAssignUser(subtask, null);
                  }}
                >
                  <span>Unassign</span>
                </CardMenuItem>
              ) : null}
              {(currentUserId && subtask.assigneeId !== currentUserId) || subtask.assigneeId ? (
                <CardMenuSeparator />
              ) : null}
              {users.map((member) => {
                const isAssigned = subtask.assigneeId === member.id;
                return (
                  <CardMenuItem
                    key={member.id}
                    active={isAssigned}
                    onClick={() => {
                      close();
                      void onAssignUser(subtask, isAssigned ? null : member.id);
                    }}
                  >
                    <span className="truncate">{member.displayName}</span>
                  </CardMenuItem>
                );
              })}
            </CardMenuSubmenu>
          ) : null}

          {onPriorityChange ? (
            <CardMenuSubmenu label="Priority">
              <CardMenuItem
                active={subtask.priority === 'LOW'}
                onClick={() => {
                  close();
                  void onPriorityChange(subtask, 'LOW');
                }}
              >
                <span>Low</span>
              </CardMenuItem>
              <CardMenuItem
                active={subtask.priority === 'MEDIUM'}
                onClick={() => {
                  close();
                  void onPriorityChange(subtask, 'MEDIUM');
                }}
              >
                <span>Medium</span>
              </CardMenuItem>
              <CardMenuItem
                active={subtask.priority === 'HIGH'}
                onClick={() => {
                  close();
                  void onPriorityChange(subtask, 'HIGH');
                }}
              >
                <span>High</span>
              </CardMenuItem>
              <CardMenuItem
                active={subtask.priority === 'URGENT'}
                onClick={() => {
                  close();
                  void onPriorityChange(subtask, 'URGENT');
                }}
              >
                <span>Urgent</span>
              </CardMenuItem>
            </CardMenuSubmenu>
          ) : null}

          {onDelete ? (
            <>
              <CardMenuSeparator />
              <CardMenuItem
                danger
                icon={<Trash size={14} className="menu-icon" />}
                onClick={() => {
                  close();
                  void onDelete(subtask);
                }}
              >
                <span>Delete subtask</span>
              </CardMenuItem>
            </>
          ) : null}
        </>
      )}
    </CardMenu>
  );
}
