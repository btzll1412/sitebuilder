import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../CartContext';

export default function IdleTimeout({ settings }) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart, closeCart } = useCart();

  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownRef = useRef(null);

  // Get settings with defaults
  const screenTimeout = parseInt(settings?.screen_timeout || '120') * 1000; // Convert to ms
  const warningDuration = parseInt(settings?.screen_timeout_warning || '30');
  const brand = settings?.primary_color || '#C2185B';

  // Don't run on admin pages
  const isAdminPage = location.pathname.startsWith('/admin');

  const resetTimers = useCallback(() => {
    // Clear existing timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Hide warning if showing
    if (showWarning) {
      setShowWarning(false);
    }

    // Don't set timers on admin pages or if timeout is 0 (disabled)
    if (isAdminPage || screenTimeout <= 0) return;

    // Set idle timer
    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(warningDuration);

      // Start countdown
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Set auto-redirect timer
      warningTimerRef.current = setTimeout(() => {
        handleTimeout();
      }, warningDuration * 1000);
    }, screenTimeout);
  }, [screenTimeout, warningDuration, isAdminPage, showWarning]);

  const handleTimeout = useCallback(() => {
    // Clear timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Clear cart and close drawer
    clearCart();
    closeCart();

    // Navigate to home
    setShowWarning(false);
    navigate('/');
  }, [clearCart, closeCart, navigate]);

  const handleStillHere = useCallback(() => {
    resetTimers();
  }, [resetTimers]);

  // Set up activity listeners
  useEffect(() => {
    if (isAdminPage) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];

    const handleActivity = () => {
      if (!showWarning) {
        resetTimers();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer
    resetTimers();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isAdminPage, resetTimers, showWarning]);

  // Don't render anything on admin pages
  if (isAdminPage || !showWarning) return null;

  return (
    <div style={s.overlay} onClick={handleStillHere}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...s.icon, background: `${brand}20`, color: brand }}>?</div>
        <h2 style={s.title}>Still there?</h2>
        <p style={s.text}>
          Tap anywhere to continue shopping
        </p>
        <div style={s.countdown}>
          <div
            style={{
              ...s.countdownBar,
              width: `${(countdown / warningDuration) * 100}%`,
              background: brand,
            }}
          />
        </div>
        <p style={s.countdownText}>
          Returning to home in {countdown} seconds
        </p>
        <button
          onClick={handleStillHere}
          style={{ ...s.button, background: brand }}
        >
          I'm Still Here
        </button>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'fadeIn 0.3s ease',
  },
  modal: {
    background: 'var(--kiosk-surface, #141414)',
    borderRadius: 'var(--radius-lg, 16px)',
    padding: '48px 56px',
    textAlign: 'center',
    maxWidth: 400,
    width: '90%',
    border: '1px solid var(--kiosk-border, #333)',
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    fontWeight: 700,
    margin: '0 auto 24px',
  },
  title: {
    fontFamily: 'var(--font-display, "Cormorant Garamond", serif)',
    fontSize: '2rem',
    fontWeight: 500,
    color: 'var(--kiosk-text, #f5f0eb)',
    marginBottom: 12,
  },
  text: {
    fontSize: '1rem',
    color: 'var(--kiosk-text-secondary, #a89f96)',
    marginBottom: 32,
  },
  countdown: {
    height: 6,
    background: 'var(--kiosk-elevated, #252525)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  countdownBar: {
    height: '100%',
    transition: 'width 1s linear',
    borderRadius: 3,
  },
  countdownText: {
    fontSize: '0.85rem',
    color: 'var(--kiosk-text-secondary, #a89f96)',
    marginBottom: 28,
  },
  button: {
    padding: '16px 48px',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    cursor: 'pointer',
    minHeight: 52,
  },
};
