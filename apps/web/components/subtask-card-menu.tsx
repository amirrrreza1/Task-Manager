'use client';

import { DotsVertical, Edit, FileText, Trash, User } from '@appica/icons-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@appica/ui-react/dropdown-menu';
import type { BoardSubtask, ManagedUser, TaskPriority } from '../lib/types';

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
    <div
      className="task-card-menu-wrapper subtask-card-menu-wrapper"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu size="sm">
        <DropdownMenuTrigger
          className="task-card-menu-trigger subtask-card-menu-trigger"
          aria-label={`Options for subtask ${subtask.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DotsVertical size={13} className="task-card-menu-icon" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          side="bottom"
          className="task-card-menu-content"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEditTitle(subtask);
            }}
          >
            <Edit size={14} className="menu-icon" />
            <span>Edit title</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEditDescription(subtask);
            }}
          >
            <FileText size={14} className="menu-icon" />
            <span>Edit description</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEditAssignee(subtask);
            }}
          >
            <User size={14} className="menu-icon" />
            <span>Edit assignee...</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {users.length > 0 && onAssignUser ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Assignee</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="task-card-menu-subcontent">
                {currentUserId && subtask.assigneeId !== currentUserId ? (
                  <DropdownMenuItem
                    onClick={() => {
                      void onAssignUser(subtask, currentUserId);
                    }}
                  >
                    <span>Assign to me</span>
                  </DropdownMenuItem>
                ) : null}
                {subtask.assigneeId ? (
                  <DropdownMenuItem
                    onClick={() => {
                      void onAssignUser(subtask, null);
                    }}
                  >
                    <span>Unassign</span>
                  </DropdownMenuItem>
                ) : null}
                {(currentUserId && subtask.assigneeId !== currentUserId) || subtask.assigneeId ? (
                  <DropdownMenuSeparator />
                ) : null}
                {users.map((member) => {
                  const isAssigned = subtask.assigneeId === member.id;
                  return (
                    <DropdownMenuItem
                      key={member.id}
                      onClick={() => {
                        void onAssignUser(subtask, isAssigned ? null : member.id);
                      }}
                      className={isAssigned ? 'is-active-option' : ''}
                    >
                      <span className="truncate">{member.displayName}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          {onPriorityChange ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Priority</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="task-card-menu-subcontent">
                <DropdownMenuItem
                  onClick={() => void onPriorityChange(subtask, 'LOW')}
                  className={subtask.priority === 'LOW' ? 'is-active-option' : ''}
                >
                  <span>Low</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onPriorityChange(subtask, 'MEDIUM')}
                  className={subtask.priority === 'MEDIUM' ? 'is-active-option' : ''}
                >
                  <span>Medium</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onPriorityChange(subtask, 'HIGH')}
                  className={subtask.priority === 'HIGH' ? 'is-active-option' : ''}
                >
                  <span>High</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onPriorityChange(subtask, 'URGENT')}
                  className={subtask.priority === 'URGENT' ? 'is-active-option' : ''}
                >
                  <span>Urgent</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          {onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="menu-item-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete(subtask);
                }}
              >
                <Trash size={14} className="menu-icon" />
                <span>Delete subtask</span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
