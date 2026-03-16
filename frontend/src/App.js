import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './CartContext';
import { ToastProvider } from './components/Toast';
import KioskShell from './components/KioskShell';
import AdminApp from './admin/AdminApp';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
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
