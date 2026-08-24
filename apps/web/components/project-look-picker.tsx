'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Modal } from './design-system';
import {
  DEFAULT_PROJECT_ICON,
  PROJECT_ICON_NAMES,
  ProjectIcon,
  isProjectIconName,
  type ProjectIconName,
} from '../lib/project-icons';

export const PROJECT_COLORS = [
  { value: '#2563EB', label: 'Blue' },
  { value: '#0284C7', label: 'Sky' },
  { value: '#059669', label: 'Emerald' },
  { value: '#10B981', label: 'Green' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#C026D3', label: 'Fuchsia' },
  { value: '#E11D48', label: 'Rose' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#D97706', label: 'Amber' },
  { value: '#64748B', label: 'Slate' },
] as const;

export function ProjectLookTrigger({
  name,
  color,
  icon,
  onClick,
}: {
  name: string;
  color: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      className="project-look-trigger"
      style={{
        backgroundColor: `${color}20`,
        color,
        borderColor: `${color}40`,
      }}
      type="button"
      onClick={onClick}
    >
      <ProjectIcon className="project-badge-icon" name={icon} />
      <span>{name.trim() || 'Project'}</span>
    </button>
  );
}

export function ProjectLookModal({
  name,
  color,
  icon,
  onClose,
  onChange,
}: {
  name: string;
  color: string;
  icon: string;
  onClose: () => void;
  onChange: (next: { color: string; icon: ProjectIconName }) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedIcon: ProjectIconName = isProjectIconName(icon) ? icon : DEFAULT_PROJECT_ICON;
  const icons = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return PROJECT_ICON_NAMES;
    return PROJECT_ICON_NAMES.filter((item) => item.toLowerCase().includes(term));
  }, [query]);

  return (
    <Modal
      className="modal project-look-modal"
      labelledBy="project-look-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <header>
        <p className="section-label">Appearance</p>
        <h2 id="project-look-title">Choose look</h2>
      </header>
      <div className="project-look-body">
        <div className="project-look-preview">
          <span
            className="project-badge"
            style={{
              backgroundColor: `${color}20`,
              color,
              borderColor: `${color}40`,
            }}
          >
            <ProjectIcon className="project-badge-icon" name={selectedIcon} />
            {name.trim() || 'Project'}
          </span>
        </div>
        <div className="form-field-group">
          <span className="field-label">Color</span>
          <div className="color-swatch-picker">
            {PROJECT_COLORS.map((col) => (
              <button
                key={col.value}
                type="button"
                className={`color-swatch-button ${color === col.value ? 'selected' : ''}`}
                style={{ backgroundColor: col.value }}
                title={col.label}
                onClick={() => onChange({ color: col.value, icon: selectedIcon })}
              />
            ))}
          </div>
        </div>
        <div className="form-field-group">
          <span className="field-label">Icon</span>
          <Input
            aria-label="Search icons"
            placeholder="Search icons"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="project-icon-picker" role="listbox" aria-label="Project icons">
            {icons.map((item) => (
              <button
                key={item}
                aria-label={item}
                aria-selected={selectedIcon === item}
                className={`project-icon-option${selectedIcon === item ? ' selected' : ''}`}
                title={item}
                type="button"
                onClick={() => onChange({ color, icon: item })}
              >
                <ProjectIcon name={item} />
              </button>
            ))}
            {icons.length === 0 ? <p className="muted">No icons match that search.</p> : null}
          </div>
        </div>
        <footer>
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
