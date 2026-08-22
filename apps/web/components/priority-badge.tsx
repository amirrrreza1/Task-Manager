'use client';

import { Select } from './design-system';
import { PRIORITY_LABELS, TASK_PRIORITIES } from '../lib/priority';
import type { TaskPriority } from '../lib/types';

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span className={`priority-pill priority-${priority.toLowerCase()} ${className ?? ''}`.trim()}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function PrioritySelect({
  value,
  onChange,
  id,
  disabled,
  allowAny,
  'aria-label': ariaLabel,
  placeholder,
}: {
  value: TaskPriority | '';
  onChange: (value: TaskPriority | '') => void;
  id?: string;
  disabled?: boolean;
  allowAny?: boolean;
  'aria-label'?: string;
  placeholder?: string;
}) {
  return (
    <Select
      id={id}
      value={value || undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value as TaskPriority | '')}
    >
      {allowAny ? <option value="">Any</option> : null}
      {TASK_PRIORITIES.map((priority) => (
        <option value={priority} key={priority}>
          {PRIORITY_LABELS[priority]}
        </option>
      ))}
    </Select>
  );
}
