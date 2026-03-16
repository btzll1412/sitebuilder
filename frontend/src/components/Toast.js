import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const removeToast = useCallback((id) => {
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
    setToasts(prev => prev.map(t =>
      t.id === id ? { ...t, exiting: true } : t
    ));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);
    timers.current[id] = setTimeout(() => removeToast(id), duration);
    return id;
  }, [removeToast]);

  const success = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const error = useCallback((msg) => addToast(msg, 'error', 5000), [addToast]);
  const info = useCallback((msg) => addToast(msg, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, success, error, info }}>
      {children}
      <div style={styles.container}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              ...styles.toast,
              ...styles[toast.type],
              animation: toast.exiting
                ? 'toastOut 0.3s ease forwards'
                : 'toastIn 0.3s ease forwards',
            }}
            onClick={() => removeToast(toast.id)}
          >
            <span style={styles.icon}>
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span style={styles.message}>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    borderRadius: '10px',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
    maxWidth: '380px',
    lineHeight: 1.4,
  },
  success: {
    background: '#1a332a',
    color: '#7dd3a8',
    border: '1px solid #2a5a42',
  },
  error: {
    background: '#331a1a',
    color: '#e57373',
    border: '1px solid #5a2a2a',
  },
  info: {
    background: '#1a2533',
    color: '#90caf9',
    border: '1px solid #2a3a5a',
  },
  icon: {
    fontSize: '16px',
    fontWeight: 700,
    flexShrink: 0,
    width: '20px',
    textAlign: 'center',
  },
  message: {
    flex: 1,
  },
};
