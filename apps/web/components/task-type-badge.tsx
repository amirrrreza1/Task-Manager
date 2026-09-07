'use client';

import { Bug, Checklist } from '@appica/icons-react';
import { Select } from './design-system';
import { TASK_TYPE_LABELS, TASK_TYPES } from '../lib/task-type';
import type { TaskType } from '../lib/types';

export function TaskTypeBadge({
  type = 'TASK',
  showLabel = true,
  className,
}: {
  type?: TaskType;
  showLabel?: boolean;
  className?: string;
}) {
  const isBug = type === 'BUG';
  return (
    <span
      className={`task-type-pill task-type-${type.toLowerCase()} ${className ?? ''}`.trim()}
      title={TASK_TYPE_LABELS[type] ?? type}
      data-type={type}
    >
      {isBug ? (
        <Bug size={13} className="task-type-icon" aria-hidden="true" />
      ) : (
        <Checklist size={13} className="task-type-icon" aria-hidden="true" />
      )}
      {showLabel ? <span>{TASK_TYPE_LABELS[type]}</span> : null}
    </span>
  );
}

export function TaskTypeSelect({
  value,
  onChange,
  id,
  disabled,
  allowAny,
  'aria-label': ariaLabel,
  placeholder,
}: {
  value: TaskType | '';
  onChange: (value: TaskType | '') => void;
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
      onChange={(event) => onChange(event.target.value as TaskType | '')}
    >
      {allowAny ? <option value="">All types</option> : null}
      {TASK_TYPES.map((type) => (
        <option value={type} key={type}>
          {TASK_TYPE_LABELS[type]}
        </option>
      ))}
    </Select>
  );
}
