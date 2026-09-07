'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, DotsVertical } from '@appica/icons-react';

interface CardMenuProps {
  triggerAriaLabel: string;
  triggerClassName?: string;
  iconSize?: number;
  disabled?: boolean;
  children: (helpers: { close: () => void }) => ReactNode;
}

export function CardMenu({
  triggerAriaLabel,
  triggerClassName = '',
  iconSize = 14,
  disabled = false,
  children,
}: CardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const PADDING = 8;
    const right = Math.max(PADDING, window.innerWidth - rect.right);

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < 280 && spaceAbove > spaceBelow) {
      setCoords({
        bottom: Math.max(PADDING, window.innerHeight - rect.top + 4),
        right,
      });
    } else {
      setCoords({
        top: rect.bottom + 4,
        right,
      });
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onScrollOrResize() {
      setIsOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen]);

  if (disabled) return null;

  return (
    <div
      className="task-card-menu-wrapper"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`task-card-menu-trigger ${triggerClassName}`.trim()}
        aria-label={triggerAriaLabel}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DotsVertical size={iconSize} className="task-card-menu-icon" />
      </button>

      {isOpen && typeof document !== 'undefined' && coords
        ? createPortal(
            <div
              ref={menuRef}
              className="task-card-menu-portal"
              style={{
                position: 'fixed',
                top: coords.top !== undefined ? `${coords.top}px` : undefined,
                bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
                right: `${coords.right}px`,
                zIndex: 9999,
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="task-card-menu-panel task-card-menu-content" role="menu">
                {children({ close: () => setIsOpen(false) })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

interface CardMenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void | Promise<void>;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CardMenuItem({
  icon,
  children,
  onClick,
  danger = false,
  active = false,
  disabled = false,
  className = '',
}: CardMenuItemProps) {
  const classes = [
    'task-card-menu-item',
    danger ? 'menu-item-danger' : '',
    active ? 'is-active-option' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={classes}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {icon}
      {children}
    </button>
  );
}

export function CardMenuSeparator() {
  return <div className="task-card-menu-separator" role="separator" aria-hidden="true" />;
}

interface CardMenuSubmenuProps {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function CardMenuSubmenu({ label, icon, children }: CardMenuSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openSubmenu = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      if (rect.left < 205) {
        setAlignRight(true);
      } else {
        setAlignRight(false);
      }
    }
    setIsOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="card-menu-submenu-wrapper"
      onMouseEnter={openSubmenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`task-card-menu-item task-card-menu-subtrigger ${isOpen ? 'is-active-trigger' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
          } else {
            openSubmenu();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {icon}
        <span>{label}</span>
        <ChevronRight size={13} className="menu-submenu-chevron" />
      </button>

      {isOpen ? (
        <div
          className={`task-card-menu-panel task-card-menu-subcontent card-menu-submenu-panel ${alignRight ? 'align-right' : ''}`}
          role="menu"
          onMouseEnter={openSubmenu}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
