import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { CartProvider } from './CartContext';
import { ToastProvider } from './components/Toast';
import KioskShell from './components/KioskShell';
import AdminApp from './admin/AdminApp';

// Component to handle scroll restoration
function ScrollRestoration() {
  const location = useLocation();

  useEffect(() => {
    // Check if we're coming back from a product page
    const savedScroll = sessionStorage.getItem('scrollPosition');
    const savedPath = sessionStorage.getItem('scrollPath');

    // If we have a saved position and we're returning to the same path
    if (savedScroll && savedPath && location.pathname === savedPath) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        window.scrollTo(0, parseInt(savedScroll, 10));
        sessionStorage.removeItem('scrollPosition');
        sessionStorage.removeItem('scrollPath');
      }, 100);
    } else if (!location.pathname.startsWith('/product/')) {
      // Clear saved scroll when navigating elsewhere (not product detail)
      sessionStorage.removeItem('scrollPosition');
      sessionStorage.removeItem('scrollPath');
    }
  }, [location]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ScrollRestoration />
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/*" element={
            <CartProvider>
              <KioskShell />
            </CartProvider>
          } />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
