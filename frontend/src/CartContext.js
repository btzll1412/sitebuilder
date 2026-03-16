import React, { createContext, useContext, useReducer, useCallback } from 'react';

const CartContext = createContext();

const initialState = {
  items: [],
  isOpen: false,
};

// Generate a unique key for cart items (id + variant combination)
function getCartKey(item) {
  return item.variant ? `${item.id}_${item.variant}` : `${item.id}`;
}

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const cartKey = getCartKey(action.payload);
      const existing = state.items.find(i => getCartKey(i) === cartKey);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            getCartKey(i) === cartKey ? { ...i, qty: i.qty + 1 } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, cartKey, qty: 1 }],
      };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(i => i.cartKey !== action.payload),
      };
    case 'UPDATE_QTY':
      if (action.payload.qty <= 0) {
        return {
          ...state,
          items: state.items.filter(i => i.cartKey !== action.payload.cartKey),
        };
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.cartKey === action.payload.cartKey ? { ...i, qty: action.payload.qty } : i
        ),
      };
    case 'CLEAR':
      return { ...state, items: [] };
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen };
    case 'OPEN_CART':
      return { ...state, isOpen: true };
    case 'CLOSE_CART':
      return { ...state, isOpen: false };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const addItem = useCallback((product) => {
    dispatch({ type: 'ADD_ITEM', payload: product });
  }, []);

  const removeItem = useCallback((cartKey) => {
    dispatch({ type: 'REMOVE_ITEM', payload: cartKey });
  }, []);

  const updateQty = useCallback((cartKey, qty) => {
    dispatch({ type: 'UPDATE_QTY', payload: { cartKey, qty } });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const toggleCart = useCallback(() => {
    dispatch({ type: 'TOGGLE_CART' });
  }, []);

  const openCart = useCallback(() => {
    dispatch({ type: 'OPEN_CART' });
  }, []);

  const closeCart = useCallback(() => {
    dispatch({ type: 'CLOSE_CART' });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        isOpen: state.isOpen,
        itemCount,
        subtotal,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        toggleCart,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
