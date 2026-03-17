import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../CartContext';

export default function IdleTimeout({ settings }) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart, closeCart } = useCart();

  // Use refs for timers
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const showWarningRef = useRef(showWarning);
  const justTimedOutRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  // Get settings with defaults
  const screenTimeout = parseInt(settings?.screen_timeout || '120') * 1000;
  const warningDuration = parseInt(settings?.screen_timeout_warning || '30');
  const brand = settings?.primary_color || '#C2185B';

  // Don't run on admin pages
  const isAdminPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    // Skip on admin pages or if disabled
    if (isAdminPage || screenTimeout <= 0) return;

    // Clear all timers helper
    const clearTimers = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };

    // Start idle timer
    const startTimer = () => {
      clearTimers();

      idleTimerRef.current = setTimeout(() => {
        // Show warning modal
        setShowWarning(true);
        setCountdown(warningDuration);

        // Start countdown
        let count = warningDuration;
        countdownRef.current = setInterval(() => {
          count -= 1;
          setCountdown(count);
          if (count <= 0) {
            clearInterval(countdownRef.current);
          }
        }, 1000);

        // Auto-redirect after warning
        warningTimerRef.current = setTimeout(() => {
          clearTimers();
          justTimedOutRef.current = true; // Mark that we just timed out
          clearCart();
          closeCart();
          setShowWarning(false);
          navigate('/');

          // Reset the flag after a delay so next activity starts timer
          setTimeout(() => {
            justTimedOutRef.current = false;
          }, 2000);
        }, warningDuration * 1000);
      }, screenTimeout);
    };

    // Handle user activity
    const handleActivity = () => {
      // Don't restart timer if warning is showing or just timed out
      if (!showWarningRef.current && !justTimedOutRef.current) {
        startTimer();
      }
    };

    // Add event listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));

    // Start initial timer
    startTimer();

    // Cleanup
    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity));
      clearTimers();
    };
  }, [isAdminPage, screenTimeout, warningDuration, clearCart, closeCart, navigate]);

  // Handle "I'm Still Here" click
  const handleStillHere = () => {
    // Clear timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    setShowWarning(false);

    // Restart idle timer after a brief delay
    setTimeout(() => {
      if (!isAdminPage && screenTimeout > 0) {
        idleTimerRef.current = setTimeout(() => {
          setShowWarning(true);
          setCountdown(warningDuration);

          let count = warningDuration;
          countdownRef.current = setInterval(() => {
            count -= 1;
            setCountdown(count);
            if (count <= 0) clearInterval(countdownRef.current);
          }, 1000);

          warningTimerRef.current = setTimeout(() => {
            clearCart();
            closeCart();
            setShowWarning(false);
            navigate('/');
          }, warningDuration * 1000);
        }, screenTimeout);
      }
    }, 100);
  };

  // Don't render on admin or when not showing
  if (isAdminPage || !showWarning) return null;

  return (
    <div style={s.overlay} onClick={handleStillHere}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...s.icon, background: `${brand}20`, color: brand }}>?</div>
        <h2 style={s.title}>Still there?</h2>
        <p style={s.text}>Tap anywhere to continue shopping</p>
        <div style={s.countdown}>
          <div
            style={{
              ...s.countdownBar,
              width: `${(countdown / warningDuration) * 100}%`,
              background: brand,
            }}
          />
        </div>
        <p style={s.countdownText}>Returning to home in {countdown} seconds</p>
        <button onClick={handleStillHere} style={{ ...s.button, background: brand }}>
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
    fontFamily: 'var(--font-display)',
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
