import React from 'react';

// Stub — full implementation in Step 7
export default function PageRenderer({ blocks, settings }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px', color: 'var(--kiosk-text-secondary)' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>This page is empty</p>
      </div>
    );
  }
  return <div>{blocks.map((b, i) => <div key={b.id || i} />)}</div>;
}
