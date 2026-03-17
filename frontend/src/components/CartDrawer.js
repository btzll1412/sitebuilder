import React, { useState, useEffect } from 'react';
import { useCart } from '../CartContext';
import { useToast } from './Toast';
import * as api from '../api';

const STEPS = ['cart', 'payment', 'confirmation'];

export default function CartDrawer({ settings }) {
  const { items, isOpen, closeCart, itemCount, subtotal, updateQty, removeItem, clearCart } = useCart();
  const [step, setStep] = useState('cart');
  const [paymentMethod, setPaymentMethod] = useState('card'); // card, cash, split
  const [cashAmount, setCashAmount] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [stockError, setStockError] = useState(null);
  const [stockInfo, setStockInfo] = useState({}); // { cartKey: availableStock }
  const toast = useToast();

  // Fetch stock info when cart opens or items change
  useEffect(() => {
    if (!isOpen || items.length === 0) {
      setStockInfo({});
      return;
    }

    const fetchStockInfo = async () => {
      try {
        const stockResult = await api.checkStock(
          items.map(i => ({ id: i.id, name: i.name, qty: i.qty, variant: i.variant || null }))
        );
        const info = {};
        stockResult.items.forEach(item => {
          const key = item.variant ? `${item.id}_${item.variant}` : `${item.id}`;
          info[key] = item.available;
        });
        setStockInfo(info);
      } catch {
        // Silent fail - stock validation will happen at checkout
      }
    };

    fetchStockInfo();
  }, [isOpen, items]);

  const taxRate = parseFloat(settings?.tax_rate || '8.25');
  const tax = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const brand = settings?.primary_color || '#C2185B';

  // Calculate card amount for split payments
  const cashAmountNum = parseFloat(cashAmount) || 0;
  const cardAmount = paymentMethod === 'split' ? Math.max(0, total - cashAmountNum) : total;

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setStep('cart');
        setResult(null);
        setPaymentMethod('card');
        setCashAmount('');
        setCardName('');
        setCardNumber('');
        setCardExp('');
        setCardCvv('');
        setErrors({});
        setStockError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const validatePayment = () => {
    const e = {};

    if (paymentMethod === 'split') {
      if (!cashAmount || cashAmountNum <= 0) {
        e.cashAmount = 'Enter cash amount';
      } else if (cashAmountNum >= total) {
        e.cashAmount = 'Cash amount must be less than total';
      }
    }

    if (paymentMethod === 'card' || paymentMethod === 'split') {
      if (!cardName.trim()) e.cardName = 'Name is required';
      if (!cardNumber.replace(/\s/g, '') || cardNumber.replace(/\s/g, '').length < 13) e.cardNumber = 'Valid card number required';
      if (!cardExp || !/^\d{2}\/?\d{2,4}$/.test(cardExp.replace(/\s/g, ''))) e.cardExp = 'Valid expiration required (MMYY)';
      if (!cardCvv || cardCvv.length < 3) e.cardCvv = 'Valid CVV required';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleProceedToPayment = async () => {
    setStockError(null);
    setProcessing(true);

    try {
      // Check stock availability
      const stockResult = await api.checkStock(
        items.map(i => ({ id: i.id, name: i.name, qty: i.qty, variant: i.variant || null }))
      );

      if (!stockResult.available) {
        const insufficientItems = stockResult.items.filter(i => !i.sufficient);
        const messages = insufficientItems.map(i =>
          `${i.name}${i.variant ? ` (${i.variant})` : ''}: only ${i.available} available`
        );
        setStockError(messages.join(', '));
        return;
      }

      setStep('payment');
    } catch (err) {
      toast.error('Could not verify stock availability');
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (!validatePayment()) return;
    setProcessing(true);
    try {
      const expClean = cardExp.replace(/[\/\s]/g, '');
      const checkoutData = {
        items: items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, variant: i.variant || null })),
        payment_method: paymentMethod,
      };

      if (paymentMethod === 'card' || paymentMethod === 'split') {
        checkoutData.card_number = cardNumber.replace(/\s/g, '');
        checkoutData.card_exp = expClean;
        checkoutData.card_cvv = cardCvv;
        checkoutData.card_name = cardName.trim();
      }

      if (paymentMethod === 'split') {
        checkoutData.cash_amount = cashAmountNum;
      }

      const data = await api.checkout(checkoutData);
      setResult(data);
      if (data.success) {
        setStep('confirmation');
        clearCart();
      } else {
        toast.error('Payment was declined. Please try again.');
      }
    } catch (err) {
      if (err.message.includes('fetch') || err.message.includes('network')) {
        toast.error('Unable to reach the server. Check your connection.');
      } else {
        toast.error(err.message);
      }
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={s.overlay} onClick={closeCart} />
      <div style={s.drawer}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>
            {step === 'cart' ? 'Your Cart' : step === 'payment' ? 'Payment' : 'Order Confirmed'}
          </h2>
          <button onClick={closeCart} style={s.closeBtn} aria-label="Close cart">✕</button>
        </div>

        {/* Step indicator */}
        <div style={s.steps}>
          {STEPS.map((st, i) => (
            <React.Fragment key={st}>
              <div style={{
                ...s.stepDot,
                background: STEPS.indexOf(step) >= i ? brand : 'var(--kiosk-elevated)',
              }}>
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  ...s.stepLine,
                  background: STEPS.indexOf(step) > i ? brand : 'var(--kiosk-elevated)',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div style={s.body}>
          {/* STEP: Cart */}
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div style={s.emptyCart}>
                  <div style={s.emptyIcon}>◇</div>
                  <p style={s.emptyTitle}>Your cart is empty</p>
                  <p style={s.emptyText}>Add some products to get started.</p>
                </div>
              ) : (
                <div style={s.itemList}>
                  {items.map(item => (
                    <div key={item.cartKey} style={s.cartItem}>
                      <div style={s.itemImage}>
                        {item.image ? (
                          <img src={item.image} alt={item.name} style={s.itemImg} />
                        ) : (
                          <div style={s.itemImgPlaceholder}>◇</div>
                        )}
                      </div>
                      <div style={s.itemInfo}>
                        <div style={s.itemName}>{item.name}</div>
                        {item.variant && (
                          <div style={s.itemVariant}>{item.variant}</div>
                        )}
                        <div style={s.itemPrice}>${item.price.toFixed(2)}</div>
                      </div>
                      <div style={s.qtyControls}>
                        <button
                          onClick={() => updateQty(item.cartKey, item.qty - 1)}
                          style={s.qtyBtn}
                          aria-label="Decrease quantity"
                        >−</button>
                        <span style={s.qtyValue}>{item.qty}</span>
                        <button
                          onClick={() => {
                            const maxStock = stockInfo[item.cartKey];
                            if (maxStock === undefined || item.qty < maxStock) {
                              updateQty(item.cartKey, item.qty + 1);
                            }
                          }}
                          style={{
                            ...s.qtyBtn,
                            ...(stockInfo[item.cartKey] !== undefined && item.qty >= stockInfo[item.cartKey]
                              ? { opacity: 0.4, cursor: 'not-allowed' }
                              : {}
                            ),
                          }}
                          disabled={stockInfo[item.cartKey] !== undefined && item.qty >= stockInfo[item.cartKey]}
                          aria-label="Increase quantity"
                        >+</button>
                      </div>
                      <button
                        onClick={() => removeItem(item.cartKey)}
                        style={s.removeBtn}
                        aria-label="Remove item"
                      >✕</button>
                    </div>
                  ))}

                  {stockError && (
                    <div style={s.stockErrorBox}>
                      <strong>Stock Issue:</strong> {stockError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* STEP: Payment */}
          {step === 'payment' && (
            <div style={s.paymentForm}>
              {/* Payment Method Selector */}
              <div style={s.paymentMethodSection}>
                <label style={s.formLabel}>Payment Method</label>
                <div style={s.paymentMethods}>
                  {[
                    { id: 'card', label: 'Card', icon: '💳' },
                    { id: 'cash', label: 'Cash', icon: '💵' },
                    { id: 'split', label: 'Split', icon: '↔' },
                  ].map(pm => (
                    <button
                      key={pm.id}
                      onClick={() => setPaymentMethod(pm.id)}
                      style={{
                        ...s.paymentMethodBtn,
                        ...(paymentMethod === pm.id ? { borderColor: brand, background: `${brand}15` } : {}),
                      }}
                    >
                      <span style={s.pmIcon}>{pm.icon}</span>
                      <span style={s.pmLabel}>{pm.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Split Payment: Cash Amount First */}
              {paymentMethod === 'split' && (
                <div style={s.splitSection}>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Cash Amount</label>
                    <div style={s.cashInputWrap}>
                      <span style={s.cashPrefix}>$</span>
                      <input
                        value={cashAmount}
                        onChange={e => {
                          setCashAmount(e.target.value.replace(/[^\d.]/g, ''));
                          setErrors(p => ({ ...p, cashAmount: '' }));
                        }}
                        style={{ ...s.formInput, ...s.cashInput, ...(errors.cashAmount ? s.inputError : {}) }}
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                    {errors.cashAmount && <span style={s.errorText}>{errors.cashAmount}</span>}
                  </div>
                  <div style={s.splitSummary}>
                    <div style={s.splitRow}>
                      <span>Cash</span>
                      <span>${cashAmountNum.toFixed(2)}</span>
                    </div>
                    <div style={s.splitRow}>
                      <span>Remaining on Card</span>
                      <span style={{ color: brand, fontWeight: 600 }}>${cardAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cash Payment Info */}
              {paymentMethod === 'cash' && (
                <div style={s.cashInfo}>
                  <div style={s.cashInfoIcon}>💵</div>
                  <p style={s.cashInfoText}>
                    Collect <strong>${total.toFixed(2)}</strong> in cash from customer.
                  </p>
                </div>
              )}

              {/* Card Fields - show for card and split */}
              {(paymentMethod === 'card' || paymentMethod === 'split') && (
                <>
                  {paymentMethod === 'split' && cardAmount > 0 && (
                    <div style={s.cardSectionHeader}>Card Payment Details</div>
                  )}
                  <div style={s.formField}>
                    <label style={s.formLabel}>Cardholder Name</label>
                    <input
                      value={cardName}
                      onChange={e => { setCardName(e.target.value); setErrors(p => ({ ...p, cardName: '' })); }}
                      style={{ ...s.formInput, ...(errors.cardName ? s.inputError : {}) }}
                      placeholder="Jane Smith"
                    />
                    {errors.cardName && <span style={s.errorText}>{errors.cardName}</span>}
                  </div>
                  <div style={s.formField}>
                    <label style={s.formLabel}>Card Number</label>
                    <input
                      value={cardNumber}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').substring(0, 16);
                        setCardNumber(val.replace(/(.{4})/g, '$1 ').trim());
                        setErrors(p => ({ ...p, cardNumber: '' }));
                      }}
                      style={{ ...s.formInput, ...(errors.cardNumber ? s.inputError : {}) }}
                      placeholder="4111 1111 1111 1111"
                      inputMode="numeric"
                    />
                    {errors.cardNumber && <span style={s.errorText}>{errors.cardNumber}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ ...s.formField, flex: 1 }}>
                      <label style={s.formLabel}>Expiration</label>
                      <input
                        value={cardExp}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '').substring(0, 4);
                          if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2);
                          setCardExp(val);
                          setErrors(p => ({ ...p, cardExp: '' }));
                        }}
                        style={{ ...s.formInput, ...(errors.cardExp ? s.inputError : {}) }}
                        placeholder="MM/YY"
                        inputMode="numeric"
                      />
                      {errors.cardExp && <span style={s.errorText}>{errors.cardExp}</span>}
                    </div>
                    <div style={{ ...s.formField, flex: 1 }}>
                      <label style={s.formLabel}>CVV</label>
                      <input
                        value={cardCvv}
                        onChange={e => {
                          setCardCvv(e.target.value.replace(/\D/g, '').substring(0, 4));
                          setErrors(p => ({ ...p, cardCvv: '' }));
                        }}
                        style={{ ...s.formInput, ...(errors.cardCvv ? s.inputError : {}) }}
                        placeholder="123"
                        inputMode="numeric"
                        type="password"
                      />
                      {errors.cardCvv && <span style={s.errorText}>{errors.cardCvv}</span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP: Confirmation */}
          {step === 'confirmation' && result && (
            <div style={s.confirmation}>
              <div style={{ ...s.confirmIcon, color: brand }}>✓</div>
              <h3 style={s.confirmTitle}>Thank You!</h3>
              <p style={s.confirmText}>Your order has been placed successfully.</p>

              <div style={s.receiptCard}>
                <div style={s.receiptRow}>
                  <span>Subtotal</span>
                  <span>${result.subtotal?.toFixed(2)}</span>
                </div>
                <div style={s.receiptRow}>
                  <span>Tax</span>
                  <span>${result.tax?.toFixed(2)}</span>
                </div>
                <div style={{ ...s.receiptRow, ...s.receiptTotal }}>
                  <span>Total</span>
                  <span>${result.total?.toFixed(2)}</span>
                </div>

                {/* Payment breakdown */}
                <div style={s.paymentBreakdown}>
                  {result.payment_method === 'card' && (
                    <div style={s.paymentLine}>Card: ${result.card_amount?.toFixed(2)}</div>
                  )}
                  {result.payment_method === 'cash' && (
                    <div style={s.paymentLine}>Cash: ${result.cash_amount?.toFixed(2)}</div>
                  )}
                  {result.payment_method === 'split' && (
                    <>
                      <div style={s.paymentLine}>Cash: ${result.cash_amount?.toFixed(2)}</div>
                      <div style={s.paymentLine}>Card: ${result.card_amount?.toFixed(2)}</div>
                    </>
                  )}
                </div>

                <div style={s.receiptRef}>
                  Ref: {result.ref}
                </div>
                {result.simulated && (
                  <div style={s.simBadge}>Simulation Mode</div>
                )}
              </div>

              <button
                onClick={closeCart}
                style={{ ...s.checkoutBtn, background: brand, marginTop: 24 }}
              >
                Continue Shopping
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'confirmation' && items.length > 0 && (
          <div style={s.footer}>
            <div style={s.totals}>
              <div style={s.totalRow}>
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={s.totalRow}>
                <span>Tax ({taxRate}%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div style={{ ...s.totalRow, ...s.totalMain }}>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                onClick={handleProceedToPayment}
                disabled={processing}
                style={{ ...s.checkoutBtn, background: brand, opacity: processing ? 0.7 : 1 }}
              >
                {processing ? 'Checking Stock...' : 'Proceed to Payment'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('cart')} style={s.backBtn}>Back</button>
                <button
                  onClick={handleCheckout}
                  disabled={processing}
                  style={{ ...s.checkoutBtn, background: brand, flex: 1, opacity: processing ? 0.7 : 1 }}
                >
                  {processing ? 'Processing...' :
                   paymentMethod === 'cash' ? `Confirm Cash $${total.toFixed(2)}` :
                   paymentMethod === 'split' ? `Pay $${cardAmount.toFixed(2)} on Card` :
                   `Pay $${total.toFixed(2)}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 900,
    animation: 'fadeIn 0.2s ease',
  },
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: 420,
    background: 'var(--kiosk-surface)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    borderLeft: '1px solid var(--kiosk-border)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 28px',
    borderBottom: '1px solid var(--kiosk-border)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: 500,
    color: 'var(--kiosk-text)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--kiosk-text-secondary)',
    fontSize: '1rem',
    borderRadius: 'var(--radius-sm)',
    minWidth: 44,
    minHeight: 44,
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 28px',
    gap: 0,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
    transition: 'background 0.3s',
  },
  stepLine: {
    height: 2,
    width: 40,
    transition: 'background 0.3s',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '0 28px',
  },
  emptyCart: {
    textAlign: 'center',
    padding: '80px 20px',
  },
  emptyIcon: {
    fontSize: '3rem',
    color: 'var(--kiosk-text-secondary)',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--kiosk-text)',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: '0.85rem',
    color: 'var(--kiosk-text-secondary)',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingBottom: 20,
  },
  cartItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
  },
  itemImage: { flexShrink: 0, width: 56, height: 56, borderRadius: 'var(--radius-sm)', overflow: 'hidden' },
  itemImg: { width: '100%', height: '100%', objectFit: 'cover' },
  itemImgPlaceholder: { width: '100%', height: '100%', background: 'var(--kiosk-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--kiosk-text-secondary)', fontSize: '1.2rem' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: '0.88rem', fontWeight: 500, color: 'var(--kiosk-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  itemVariant: { fontSize: '0.75rem', color: 'var(--kiosk-text-secondary)', marginTop: 2, fontWeight: 500 },
  itemPrice: { fontSize: '0.8rem', color: 'var(--kiosk-text-secondary)', marginTop: 2 },
  qtyControls: { display: 'flex', alignItems: 'center', gap: 0, background: 'var(--kiosk-elevated)', borderRadius: 'var(--radius-sm)' },
  qtyBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--kiosk-text)', fontSize: '1rem', minWidth: 44, minHeight: 44, padding: '6px' },
  qtyValue: { width: 28, textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: 'var(--kiosk-text)' },
  removeBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--kiosk-text-secondary)', fontSize: '0.8rem', minWidth: 44, minHeight: 44, padding: '6px' },

  stockErrorBox: {
    padding: '14px 16px',
    background: 'rgba(239, 83, 80, 0.1)',
    border: '1px solid rgba(239, 83, 80, 0.3)',
    borderRadius: 'var(--radius-md)',
    color: '#ef5350',
    fontSize: '0.85rem',
    lineHeight: 1.5,
  },

  // Payment form
  paymentForm: { display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 8, paddingBottom: 20 },
  formField: { display: 'flex', flexDirection: 'column', gap: 6 },
  formLabel: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--kiosk-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  formInput: { padding: '14px 16px', fontSize: '0.95rem', background: 'var(--kiosk-card)', border: '1.5px solid var(--kiosk-border)', borderRadius: 'var(--radius-md)', color: 'var(--kiosk-text)', outline: 'none', transition: 'border-color 0.2s' },
  inputError: { borderColor: '#C2185B', boxShadow: '0 0 0 3px rgba(194, 24, 91, 0.15)' },
  errorText: { fontSize: '0.75rem', color: '#e57373', fontWeight: 500 },

  // Payment method selector
  paymentMethodSection: { marginBottom: 8 },
  paymentMethods: { display: 'flex', gap: 10, marginTop: 8 },
  paymentMethodBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '16px 12px',
    background: 'var(--kiosk-card)',
    border: '2px solid var(--kiosk-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  pmIcon: { fontSize: '1.4rem' },
  pmLabel: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--kiosk-text)' },

  // Split payment
  splitSection: {
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
    padding: 16,
    marginBottom: 8,
  },
  cashInputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  cashPrefix: {
    position: 'absolute',
    left: 16,
    color: 'var(--kiosk-text-secondary)',
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  cashInput: { paddingLeft: 32 },
  splitSummary: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: '1px solid var(--kiosk-border)',
  },
  splitRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.88rem',
    color: 'var(--kiosk-text-secondary)',
    padding: '6px 0',
  },

  // Cash payment
  cashInfo: {
    textAlign: 'center',
    padding: '32px 20px',
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
  },
  cashInfoIcon: { fontSize: '3rem', marginBottom: 12 },
  cashInfoText: { fontSize: '1rem', color: 'var(--kiosk-text)', lineHeight: 1.6 },

  cardSectionHeader: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--kiosk-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginTop: 8,
    marginBottom: -4,
  },

  // Confirmation
  confirmation: { textAlign: 'center', padding: '40px 0' },
  confirmIcon: { width: 64, height: 64, borderRadius: '50%', background: 'rgba(194, 24, 91, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 700, margin: '0 auto 20px' },
  confirmTitle: { fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--kiosk-text)', marginBottom: 8 },
  confirmText: { fontSize: '0.9rem', color: 'var(--kiosk-text-secondary)', marginBottom: 28 },
  receiptCard: { background: 'var(--kiosk-card)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'left' },
  receiptRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '0.88rem', color: 'var(--kiosk-text-secondary)' },
  receiptTotal: { fontWeight: 600, fontSize: '1rem', color: 'var(--kiosk-text)', borderTop: '1px solid var(--kiosk-border)', marginTop: 8, paddingTop: 12 },
  paymentBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--kiosk-border)',
  },
  paymentLine: {
    fontSize: '0.82rem',
    color: 'var(--kiosk-text-secondary)',
    padding: '4px 0',
  },
  receiptRef: { fontSize: '0.78rem', color: 'var(--kiosk-text-secondary)', marginTop: 12, textAlign: 'center' },
  simBadge: { marginTop: 12, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ff9800', textAlign: 'center', padding: '6px 12px', background: 'rgba(255, 152, 0, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 152, 0, 0.2)' },

  // Footer
  footer: { padding: '20px 28px 28px', borderTop: '1px solid var(--kiosk-border)' },
  totals: { marginBottom: 16 },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.88rem', color: 'var(--kiosk-text-secondary)' },
  totalMain: { fontWeight: 600, fontSize: '1.1rem', color: 'var(--kiosk-text)', paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--kiosk-border)' },
  checkoutBtn: { width: '100%', padding: '16px', fontSize: '0.9rem', fontWeight: 600, color: '#fff', borderRadius: 'var(--radius-md)', minHeight: 52, letterSpacing: '0.03em', transition: 'opacity 0.15s' },
  backBtn: { padding: '16px 24px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--kiosk-text-secondary)', background: 'var(--kiosk-card)', borderRadius: 'var(--radius-md)', minHeight: 52 },
};
