import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

// Replaces the blocking window.alert() calls that were used for both success
// and failure of the scrape trigger.

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const TONES = {
  success: 'border-above/30 text-above',
  error: 'border-below/30 text-below',
  info: 'border-brand/30 text-brand-soft',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = 'info', duration = 5000 }) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, title, description, variant }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely so updates reach assistive tech without stealing focus. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map(({ id, title, description, variant }) => {
            const Icon = ICONS[variant] ?? Info;
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={cn(
                  'panel pointer-events-auto flex gap-3 border p-3 shadow-lift',
                  TONES[variant] ?? TONES.info
                )}
              >
                <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
