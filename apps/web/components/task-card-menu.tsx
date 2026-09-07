'use client';

import { Edit, FileText, Trash } from '@appica/icons-react';
import type { ManagedUser, TaskCard, TaskPriority, TaskType } from '../lib/types';
import { CardMenu, CardMenuItem, CardMenuSeparator, CardMenuSubmenu } from './card-menu-primitives';

interface TaskCardMenuProps {
  task: TaskCard;
  users?: ManagedUser[];
  currentUserId?: string;
  disabled?: boolean;
  onEditTitle: (task: TaskCard) => void;
  onEditDescription: (task: TaskCard) => void;
  onPriorityChange: (task: TaskCard, priority: TaskPriority) => void | Promise<void>;
  onTypeChange?: (task: TaskCard, type: TaskType) => void | Promise<void>;
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
  onTypeChange,
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
    <CardMenu
      triggerAriaLabel={`Options for task ${task.title}`}
      triggerClassName="task-card-menu-trigger"
      iconSize={14}
      disabled={disabled}
    >
      {({ close }) => (
        <>
          <CardMenuItem
            icon={<Edit size={14} className="menu-icon" />}
            onClick={() => {
              close();
              onEditTitle(task);
            }}
          >
            <span>Edit title</span>
          </CardMenuItem>

          <CardMenuItem
            icon={<FileText size={14} className="menu-icon" />}
            onClick={() => {
              close();
              onEditDescription(task);
            }}
          >
            <span>Edit description</span>
          </CardMenuItem>

          <CardMenuSeparator />

          <CardMenuSubmenu label="Priority">
            <CardMenuItem
              active={task.priority === 'LOW'}
              onClick={() => {
                close();
                void onPriorityChange(task, 'LOW');
              }}
            >
              <span>Low</span>
            </CardMenuItem>
            <CardMenuItem
              active={task.priority === 'MEDIUM'}
              onClick={() => {
                close();
                void onPriorityChange(task, 'MEDIUM');
              }}
            >
              <span>Medium</span>
            </CardMenuItem>
            <CardMenuItem
              active={task.priority === 'HIGH'}
              onClick={() => {
                close();
                void onPriorityChange(task, 'HIGH');
              }}
            >
              <span>High</span>
            </CardMenuItem>
            <CardMenuItem
              active={task.priority === 'URGENT'}
              onClick={() => {
                close();
                void onPriorityChange(task, 'URGENT');
              }}
            >
              <span>Urgent</span>
            </CardMenuItem>
          </CardMenuSubmenu>

          {onTypeChange ? (
            <CardMenuSubmenu label="Type">
              <CardMenuItem
                active={task.type === 'TASK' || !task.type}
                onClick={() => {
                  close();
                  void onTypeChange(task, 'TASK');
                }}
              >
                <span>Task</span>
              </CardMenuItem>
              <CardMenuItem
                active={task.type === 'BUG'}
                onClick={() => {
                  close();
                  void onTypeChange(task, 'BUG');
                }}
              >
                <span>Bug</span>
              </CardMenuItem>
            </CardMenuSubmenu>
          ) : null}

          {users.length > 0 ? (
            <CardMenuSubmenu label="Assignee">
              {currentUserId && !isAssignedToCurrentUser ? (
                <CardMenuItem
                  onClick={() => {
                    close();
                    void onAssignSelf(task);
                  }}
                >
                  <span>Assign to me</span>
                </CardMenuItem>
              ) : null}
              {task.assignees.length > 0 ? (
                <CardMenuItem
                  onClick={() => {
                    close();
                    void onClearAssignees(task);
                  }}
                >
                  <span>Unassign all</span>
                </CardMenuItem>
              ) : null}
              {(currentUserId && !isAssignedToCurrentUser) || task.assignees.length > 0 ? (
                <CardMenuSeparator />
              ) : null}
              {users.map((member) => {
                const isAssigned = task.assignees.some((a) => a.user.id === member.id);
                return (
                  <CardMenuItem
                    key={member.id}
                    active={isAssigned}
                    onClick={() => {
                      close();
                      void onToggleAssignee(task, member.id);
                    }}
                  >
                    <span className="truncate">{member.displayName}</span>
                  </CardMenuItem>
                );
              })}
            </CardMenuSubmenu>
          ) : null}

          <CardMenuSeparator />

          <CardMenuItem
            danger
            icon={<Trash size={14} className="menu-icon" />}
            onClick={() => {
              close();
              void onDelete(task);
            }}
          >
            <span>Delete task</span>
          </CardMenuItem>
        </>
      )}
    </CardMenu>
  );
}
