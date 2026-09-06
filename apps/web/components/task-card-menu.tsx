'use client';

import { DotsVertical, Edit, FileText, Trash } from '@appica/icons-react';
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
import type { ManagedUser, TaskCard, TaskPriority } from '../lib/types';

interface TaskCardMenuProps {
  task: TaskCard;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled?: boolean;
  onEditTitle: (task: TaskCard) => void;
  onEditDescription: (task: TaskCard) => void;
  onPriorityChange: (task: TaskCard, priority: TaskPriority) => void | Promise<void>;
  onToggleAssignee: (task: TaskCard, userId: string) => void | Promise<void>;
  onAssignSelf: (task: TaskCard) => void | Promise<void>;
  onClearAssignees: (task: TaskCard) => void | Promise<void>;
  onDelete: (task: TaskCard) => void | Promise<void>;
}

export function TaskCardMenu({
  task,
  users = [],
  currentUserId,
  disabled = false,
  onEditTitle,
  onEditDescription,
  onPriorityChange,
  onToggleAssignee,
  onAssignSelf,
  onClearAssignees,
  onDelete,
}: TaskCardMenuProps) {
  if (disabled) return null;

  const isAssignedToCurrentUser = Boolean(
    currentUserId && task.assignees.some((a) => a.user.id === currentUserId),
  );

  return (
    <div
      className="task-card-menu-wrapper"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu size="sm">
        <DropdownMenuTrigger
          className="task-card-menu-trigger"
          aria-label={`Options for task ${task.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DotsVertical size={14} className="task-card-menu-icon" />
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
              onEditTitle(task);
            }}
          >
            <Edit size={14} className="menu-icon" />
            <span>Edit title</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEditDescription(task);
            }}
          >
            <FileText size={14} className="menu-icon" />
            <span>Edit description</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <span>Priority</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="task-card-menu-subcontent">
              <DropdownMenuItem
                onClick={() => onPriorityChange(task, 'LOW')}
                className={task.priority === 'LOW' ? 'is-active-option' : ''}
              >
                <span>Low</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onPriorityChange(task, 'MEDIUM')}
                className={task.priority === 'MEDIUM' ? 'is-active-option' : ''}
              >
                <span>Medium</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onPriorityChange(task, 'HIGH')}
                className={task.priority === 'HIGH' ? 'is-active-option' : ''}
              >
                <span>High</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onPriorityChange(task, 'URGENT')}
                className={task.priority === 'URGENT' ? 'is-active-option' : ''}
              >
                <span>Urgent</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {users.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Assignee</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="task-card-menu-subcontent">
                {currentUserId && !isAssignedToCurrentUser ? (
                  <DropdownMenuItem onClick={() => onAssignSelf(task)}>
                    <span>Assign to me</span>
                  </DropdownMenuItem>
                ) : null}
                {task.assignees.length > 0 ? (
                  <DropdownMenuItem onClick={() => onClearAssignees(task)}>
                    <span>Unassign all</span>
                  </DropdownMenuItem>
                ) : null}
                {(currentUserId && !isAssignedToCurrentUser) || task.assignees.length > 0 ? (
                  <DropdownMenuSeparator />
                ) : null}
                {users.map((member) => {
                  const isAssigned = task.assignees.some((a) => a.user.id === member.id);
                  return (
                    <DropdownMenuItem
                      key={member.id}
                      onClick={() => onToggleAssignee(task, member.id)}
                      className={isAssigned ? 'is-active-option' : ''}
                    >
                      <span className="truncate">{member.displayName}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="menu-item-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
          >
            <Trash size={14} className="menu-icon" />
            <span>Delete task</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
