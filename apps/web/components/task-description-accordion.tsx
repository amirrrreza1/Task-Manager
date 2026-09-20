'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from '@appica/icons-react';
import { isDescriptionLong } from '../lib/task-description';

export { isDescriptionLong };

export interface TaskDescriptionAccordionProps {
  description?: string | null;
  interactive?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

export function TaskDescriptionAccordion({
  description,
  interactive = true,
  className = '',
  defaultExpanded = false,
}: TaskDescriptionAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [hasOverflow, setHasOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const calculatedLong = isDescriptionLong(description);
  const shouldBeAccordion = calculatedLong || hasOverflow;

  useEffect(() => {
    if (!textRef.current || !description) return;
    const el = textRef.current;
    if (el.scrollHeight > el.clientHeight + 4) {
      setHasOverflow(true);
    }
  }, [description]);

  if (!description || !description.trim()) {
    return (
      <p className="task-card-desc is-empty" aria-hidden="true">
        {'\u00A0'}
      </p>
    );
  }

  if (!shouldBeAccordion) {
    return (
      <p className={`task-card-desc ${className}`} title={description}>
        {description}
      </p>
    );
  }

  return (
    <div
      className={`task-desc-accordion ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${className}`}
    >
      <p
        ref={textRef}
        className="task-card-desc task-desc-text"
        title={!isExpanded ? description : undefined}
      >
        {description}
      </p>
      {interactive ? (
        <button
          type="button"
          className="task-desc-accordion-toggle"
          aria-expanded={isExpanded}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          title={isExpanded ? 'Collapse description' : 'Open full description'}
        >
          <span>{isExpanded ? 'Show less' : 'Show more'}</span>
          {isExpanded ? (
            <ChevronUp size={12} className="task-desc-accordion-chevron" aria-hidden="true" />
          ) : (
            <ChevronDown size={12} className="task-desc-accordion-chevron" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
