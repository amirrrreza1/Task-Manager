'use client';

import { AlertCircle, Check } from '@appica/icons-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type ToastVariant = 'success' | 'error';

export function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

type ToastItem = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  fromError: (caught: unknown, fallback: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((variant: ToastVariant, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = nextToastId++;
    setToasts((current) => [...current.slice(-4), { id, variant, message: trimmed }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      fromError: (caught, fallback) => push('error', errorMessage(caught, fallback)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
              {toasts.map((toast) => (
                <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), 4800);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.id]);

  return (
    <div
      className={`toast toast-${toast.variant}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <span className="toast-icon" aria-hidden="true">
        {toast.variant === 'success' ? <Check /> : <AlertCircle />}
      </span>
      <p className="toast-message">{toast.message}</p>
      <button
        aria-label="Dismiss notification"
        className="toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return toast;
}
