'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HeaderActionsContext = createContext<{
  slot: HTMLElement | null;
  setSlot: (node: HTMLElement | null) => void;
} | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  return (
    <HeaderActionsContext.Provider value={{ slot, setSlot }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function HeaderActionsSlot() {
  const ctx = useContext(HeaderActionsContext);

  return <div className="toolbar-page-actions" ref={ctx?.setSlot} />;
}

export function HeaderActions({ children }: { children: ReactNode }) {
  const ctx = useContext(HeaderActionsContext);
  if (!ctx?.slot) return null;
  return createPortal(children, ctx.slot);
}
