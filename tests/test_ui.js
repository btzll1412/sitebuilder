/**
 * Frontend UI tests — React Testing Library + Jest
 * Mock api.js to avoid network calls.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { CartProvider, useCart } from '../frontend/src/CartContext';
import { ToastProvider } from '../frontend/src/components/Toast';

// ─── Mock api.js ────────────────────────────────────────────────────────────

jest.mock('../frontend/src/api', () => ({
  getProducts: jest.fn().mockResolvedValue([
    { id: 1, name: 'Velvet Lipstick', price: 24.00, category: 'Lips', image: '', in_stock: 1 },
    { id: 2, name: 'Smoky Palette', price: 38.00, category: 'Eyes', image: '', in_stock: 1 },
  ]),
  getCategories: jest.fn().mockResolvedValue(['Lips', 'Eyes', 'Face']),
  getPages: jest.fn().mockResolvedValue([
    { id: 1, slug: 'home', title: 'Home', is_home: 1, published: 1 },
  ]),
  getPage: jest.fn().mockResolvedValue({
    id: 1, slug: 'home', title: 'Home', is_home: 1, published: 1,
    layout: [
      { id: 'b1', type: 'hero', props: { title: 'Beauty, Redefined', subtitle: 'Test subtitle', cta: 'Shop Now' } },
      { id: 'b2', type: 'product_grid', props: { title: 'Bestsellers', category: 'all', limit: 6, columns: 3 } },
    ],
  }),
  getSettings: jest.fn().mockResolvedValue({
    site_name: 'Luxe Beauty',
    logo_text: 'LUXE',
    primary_color: '#C2185B',
    tax_rate: '8.25',
  }),
  login: jest.fn(),
  logout: jest.fn().mockResolvedValue({}),
  getAllProducts: jest.fn().mockResolvedValue([]),
  getAdminSettings: jest.fn().mockResolvedValue({}),
  getOrders: jest.fn().mockResolvedValue([]),
  getOrderStats: jest.fn().mockResolvedValue({ total_revenue: 0, order_count: 0, avg_order: 0 }),
}));

const api = require('../frontend/src/api');

// ─── Helpers ────────────────────────────────────────────────────────────────

function Wrapper({ children }) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <CartProvider>
          {children}
        </CartProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

// ─── Cart Context Tests ─────────────────────────────────────────────────────

function CartTestComponent() {
  const { items, itemCount, subtotal, addItem, removeItem, updateQty } = useCart();
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <span data-testid="subtotal">{subtotal.toFixed(2)}</span>
      <button onClick={() => addItem({ id: 1, name: 'Test', price: 10 })}>Add</button>
      <button onClick={() => removeItem(1)}>Remove</button>
      <button onClick={() => updateQty(1, 3)}>Set Qty 3</button>
      {items.map(i => (
        <div key={i.id} data-testid={`item-${i.id}`}>
          {i.name} - ${i.price} x{i.qty}
        </div>
      ))}
    </div>
  );
}

describe('Cart Context', () => {
  test('starts with empty cart', () => {
    render(<CartTestComponent />, { wrapper: Wrapper });
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('subtotal').textContent).toBe('0.00');
  });

  test('add to cart updates count', () => {
    render(<CartTestComponent />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  test('adding same item increases quantity', () => {
    render(<CartTestComponent />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('subtotal').textContent).toBe('20.00');
  });

  test('remove item from cart', () => {
    render(<CartTestComponent />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  test('update quantity', () => {
    render(<CartTestComponent />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Set Qty 3'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('subtotal').textContent).toBe('30.00');
  });
});

// ─── Admin Login Tests ──────────────────────────────────────────────────────

// Dynamically import AdminLogin since it uses api.js
const AdminLogin = require('../frontend/src/admin/AdminLogin').default;

describe('Admin Login', () => {
  test('renders login form', () => {
    render(
      <Wrapper>
        <AdminLogin onLogin={jest.fn()} />
      </Wrapper>
    );
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  test('shows validation errors for empty fields', async () => {
    render(
      <Wrapper>
        <AdminLogin onLogin={jest.fn()} />
      </Wrapper>
    );
    fireEvent.click(screen.getByText('Sign In'));
    await waitFor(() => {
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });
  });

  test('shows error on wrong credentials', async () => {
    api.login.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(
      <Wrapper>
        <AdminLogin onLogin={jest.fn()} />
      </Wrapper>
    );

    await userEvent.type(screen.getByPlaceholderText('Enter username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('Enter password'), 'wrong');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});

// ─── Product Card Display Tests ─────────────────────────────────────────────

const PageRenderer = require('../frontend/src/components/PageRenderer').default;

describe('PageRenderer', () => {
  test('renders empty state for no blocks', () => {
    render(
      <Wrapper>
        <PageRenderer blocks={[]} settings={{}} />
      </Wrapper>
    );
    expect(screen.getByText('This page is empty')).toBeInTheDocument();
  });

  test('renders hero block', async () => {
    const blocks = [
      { id: 'h1', type: 'hero', props: { title: 'Test Hero', subtitle: 'Test Sub', cta: 'Click Me' } },
    ];
    render(
      <Wrapper>
        <PageRenderer blocks={blocks} settings={{}} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByText('Test Hero')).toBeInTheDocument();
      expect(screen.getByText('Test Sub')).toBeInTheDocument();
      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });
  });

  test('renders product grid with products', async () => {
    const blocks = [
      { id: 'pg1', type: 'product_grid', props: { title: 'Our Products', category: 'all', limit: 6, columns: 3 } },
    ];
    render(
      <Wrapper>
        <PageRenderer blocks={blocks} settings={{}} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByText('Our Products')).toBeInTheDocument();
      expect(screen.getByText('Velvet Lipstick')).toBeInTheDocument();
      expect(screen.getByText('$24.00')).toBeInTheDocument();
      expect(screen.getByText('Smoky Palette')).toBeInTheDocument();
      expect(screen.getByText('$38.00')).toBeInTheDocument();
    });
  });
});

// ─── Navbar Tests ───────────────────────────────────────────────────────────

const Navbar = require('../frontend/src/components/Navbar').default;

describe('Navbar', () => {
  test('renders logo text', () => {
    render(
      <Wrapper>
        <Navbar settings={{ logo_text: 'LUXE' }} pages={[]} />
      </Wrapper>
    );
    expect(screen.getByText('LUXE')).toBeInTheDocument();
  });

  test('renders page links', () => {
    render(
      <Wrapper>
        <Navbar
          settings={{ logo_text: 'LUXE' }}
          pages={[
            { slug: 'about', title: 'About', published: 1, is_home: 0 },
            { slug: 'contact', title: 'Contact', published: 1, is_home: 0 },
          ]}
        />
      </Wrapper>
    );
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });
});
