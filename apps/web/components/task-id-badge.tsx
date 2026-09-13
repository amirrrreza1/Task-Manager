'use client';

import { Check, Copy } from '@appica/icons-react';
import { type MouseEvent, useState } from 'react';
import { formatTaskId } from '../lib/task-id';

export interface TaskIdBadgeProps {
  id: string;
  projectKey?: string | null;
  size?: 'sm' | 'md';
  copyable?: boolean;
  className?: string;
  title?: string;
}

export function TaskIdBadge({
  id,
  projectKey,
  size = 'sm',
  copyable = true,
  className = '',
  title,
}: TaskIdBadgeProps) {
  const [copied, setCopied] = useState(false);
  const formatted = formatTaskId(id, { projectKey });

  if (!formatted) return null;

  async function handleCopy(event: MouseEvent<HTMLButtonElement | HTMLSpanElement>) {
    if (!copyable) return;
    event.preventDefault();
    event.stopPropagation();

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(formatted);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = formatted;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback silent failure
    }
  }

  const tooltip =
    title ??
    (copyable
      ? copied
        ? `Copied ${formatted} to clipboard!`
        : `Click to copy ${formatted}`
      : formatted);

  const classes = [
    'task-id-badge',
    `task-id-badge--${size}`,
    copyable ? 'is-copyable' : '',
    copied ? 'is-copied' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!copyable) {
    return (
      <span className={classes} title={tooltip}>
        <span className="task-id-number">{formatted}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={handleCopy}
      title={tooltip}
      aria-label={tooltip}
      tabIndex={0}
    >
      <span className="task-id-badge-content">
        <span className="task-id-number">{formatted}</span>
        <span className="task-id-badge-icon" aria-hidden="true">
          {copied ? <Check size={size === 'md' ? 10 : 9} /> : <Copy size={size === 'md' ? 10 : 9} />}
        </span>
      </span>
    </button>
  );
}
