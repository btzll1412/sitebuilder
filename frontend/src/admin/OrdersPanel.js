import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

export default function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const toast = useToast();

  const timezone = settings.timezone || 'America/New_York';

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr + 'Z'); // Assume UTC from backend
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ordersData, statsData, settingsData] = await Promise.all([
        api.getOrders(),
        api.getOrderStats(),
        api.getAdminSettings(),
      ]);
      setOrders(ordersData);
      setStats(statsData);
      setSettings(settingsData);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleVoid = async (orderId) => {
    if (!window.confirm('Void this order? Stock will be returned to inventory.')) return;
    try {
      await api.voidOrder(orderId);
      toast.success('Order voided and stock returned');
      load(); // Refresh orders and stats
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Permanently delete this order? This cannot be undone. If the order was approved, stock will be returned.')) return;
    try {
      await api.deleteOrder(orderId);
      toast.success('Order deleted permanently');
      load(); // Refresh orders and stats
    } catch (err) {
      toast.error(err.message);
    }
  };

  const formatPayment = (order) => {
    const method = order.payment_method || 'card';
    const cardLast4 = order.card_last4;
    const cardAmount = order.card_amount || 0;
    const cashAmount = order.cash_amount || 0;

    if (method === 'cash') {
      return { label: 'Cash', detail: `$${cashAmount.toFixed(2)}` };
    } else if (method === 'split') {
      return {
        label: 'Split',
        detail: `$${cashAmount.toFixed(2)} Cash + $${cardAmount.toFixed(2)} Card${cardLast4 ? ` ••••${cardLast4}` : ''}`
      };
    } else {
      return {
        label: 'Card',
        detail: cardLast4 ? `••••${cardLast4}` : 'Card'
      };
    }
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Orders</h2>
          <p style={s.subtitle}>{orders.length} total orders</p>
        </div>
        <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <div style={s.statLabel}>Total Revenue</div>
            <div style={s.statValue}>${stats.total_revenue.toFixed(2)}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Orders</div>
            <div style={s.statValue}>{stats.order_count}</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statLabel}>Average Order</div>
            <div style={s.statValue}>${stats.avg_order.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Orders List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={s.spinner} />
        </div>
      ) : orders.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyTitle}>No orders yet</p>
          <p style={s.emptyText}>Orders will appear here once customers check out.</p>
        </div>
      ) : (
        <div style={s.orderList}>
          {orders.map(order => {
            const payment = formatPayment(order);
            return (
              <div key={order.id} style={s.orderCard}>
                <div
                  style={s.orderHeader}
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  <div style={s.orderLeft}>
                    <span style={s.orderId}>#{order.id}</span>
                    <span style={s.orderDate}>{formatDate(order.created_at)}</span>
                  </div>
                  <div style={s.orderRight}>
                    <span style={{
                      ...s.paymentBadge,
                      ...(order.payment_method === 'cash' ? s.paymentCash :
                          order.payment_method === 'split' ? s.paymentSplit : s.paymentCard),
                    }}>
                      {payment.label}
                    </span>
                    <span style={{
                      ...s.statusBadge,
                      ...(order.status === 'approved' ? s.statusApproved :
                          order.status === 'declined' ? s.statusDeclined :
                          order.status === 'voided' ? s.statusVoided : s.statusPending),
                    }}>
                      {order.status}
                    </span>
                    <span style={s.orderTotal}>${order.total.toFixed(2)}</span>
                    <span style={s.expandIcon}>{expandedOrder === order.id ? '▾' : '▸'}</span>
                  </div>
                </div>

                {expandedOrder === order.id && (
                  <div style={s.orderDetails}>
                    {/* Payment Info */}
                    <div style={s.paymentInfo}>
                      <span style={s.paymentLabel}>Payment:</span>
                      <span style={s.paymentDetail}>{payment.detail}</span>
                    </div>

                    {/* Items Table */}
                    <div style={s.itemsTable}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} style={s.itemRow}>
                          <div style={{ flex: 1 }}>
                            <span style={s.itemName}>{item.name}</span>
                            {item.variant && (
                              <span style={s.itemVariant}> — {item.variant}</span>
                            )}
                          </div>
                          <span style={s.itemQty}>×{item.qty}</span>
                          <span style={s.itemPrice}>${(item.price * item.qty).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Order Summary */}
                    <div style={s.orderSummary}>
                      <div style={s.summaryRow}>
                        <span>Subtotal</span><span>${order.subtotal.toFixed(2)}</span>
                      </div>
                      <div style={s.summaryRow}>
                        <span>Tax</span><span>${order.tax.toFixed(2)}</span>
                      </div>
                      <div style={{ ...s.summaryRow, fontWeight: 600, color: 'var(--admin-text)' }}>
                        <span>Total</span><span>${order.total.toFixed(2)}</span>
                      </div>
                      {order.payment_ref && (
                        <div style={s.refRow}>Ref: {order.payment_ref}</div>
                      )}
                    </div>

                    {/* Order Actions */}
                    <div style={s.orderActions}>
                      {order.status !== 'voided' && (
                        <button
                          onClick={() => handleVoid(order.id)}
                          style={s.voidBtn}
                        >
                          Void Order
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(order.id)}
                        style={s.deleteBtn}
                      >
                        Delete Order
                      </button>
                    </div>
                    {order.status === 'voided' && (
                      <div style={s.voidedNotice}>
                        This order has been voided. Stock was returned to inventory.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--admin-text)', marginBottom: 4 },
  subtitle: { fontSize: '0.85rem', color: 'var(--admin-text-hint)' },
  refreshBtn: { padding: '10px 20px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--admin-text-secondary)', background: 'var(--admin-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)', minHeight: 40 },
  spinner: { width: 32, height: 32, border: '3px solid var(--admin-border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 },
  statCard: { background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)', padding: '24px 28px' },
  statLabel: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--admin-text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
  statValue: { fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--admin-text)' },

  empty: { textAlign: 'center', padding: '80px 24px', background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--admin-text)', marginBottom: 8 },
  emptyText: { fontSize: '0.875rem', color: 'var(--admin-text-hint)' },

  orderList: { display: 'flex', flexDirection: 'column', gap: 8 },
  orderCard: { background: 'var(--admin-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)', overflow: 'hidden' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', cursor: 'pointer', minHeight: 56 },
  orderLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  orderId: { fontSize: '0.9rem', fontWeight: 600, color: 'var(--admin-text)' },
  orderDate: { fontSize: '0.8rem', color: 'var(--admin-text-hint)' },
  orderRight: { display: 'flex', alignItems: 'center', gap: 12 },

  paymentBadge: { fontSize: '0.68rem', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  paymentCard: { background: 'rgba(33, 150, 243, 0.1)', color: '#2196f3' },
  paymentCash: { background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50' },
  paymentSplit: { background: 'rgba(156, 39, 176, 0.1)', color: '#9c27b0' },

  statusBadge: { fontSize: '0.68rem', fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  statusApproved: { background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50' },
  statusDeclined: { background: 'rgba(229, 115, 115, 0.1)', color: '#e57373' },
  statusPending: { background: 'rgba(255, 152, 0, 0.1)', color: '#ff9800' },
  statusVoided: { background: 'rgba(158, 158, 158, 0.1)', color: '#9e9e9e' },
  orderTotal: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--admin-text)', minWidth: 70, textAlign: 'right' },
  expandIcon: { fontSize: '0.8rem', color: 'var(--admin-text-hint)', width: 20, textAlign: 'center' },

  orderDetails: { borderTop: '1px solid var(--admin-border)', padding: '20px 24px' },

  paymentInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    padding: '12px 16px',
    background: 'var(--admin-surface)',
    borderRadius: 'var(--radius-sm)',
  },
  paymentLabel: { fontSize: '0.82rem', fontWeight: 600, color: 'var(--admin-text-secondary)' },
  paymentDetail: { fontSize: '0.88rem', color: 'var(--admin-text)', fontFamily: 'monospace' },

  itemsTable: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 12 },
  itemName: { fontSize: '0.88rem', color: 'var(--admin-text)' },
  itemVariant: { fontSize: '0.82rem', color: 'var(--brand)', fontWeight: 500 },
  itemQty: { fontSize: '0.82rem', color: 'var(--admin-text-hint)', width: 40 },
  itemPrice: { fontSize: '0.88rem', fontWeight: 500, color: 'var(--admin-text)', width: 70, textAlign: 'right' },

  orderSummary: { borderTop: '1px solid var(--admin-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 250, marginLeft: 'auto' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' },
  refRow: { fontSize: '0.78rem', color: 'var(--admin-text-hint)', textAlign: 'right', marginTop: 8, fontFamily: 'monospace' },

  orderActions: { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--admin-border)', display: 'flex', justifyContent: 'flex-end', gap: 12 },
  voidBtn: { padding: '10px 20px', fontSize: '0.82rem', fontWeight: 600, color: '#ff9800', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s' },
  deleteBtn: { padding: '10px 20px', fontSize: '0.82rem', fontWeight: 600, color: '#e57373', background: 'rgba(229, 115, 115, 0.1)', border: '1px solid rgba(229, 115, 115, 0.3)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s' },
  voidedNotice: { marginTop: 16, padding: '12px 16px', fontSize: '0.82rem', color: '#9e9e9e', background: 'rgba(158, 158, 158, 0.08)', borderRadius: 'var(--radius-sm)', textAlign: 'center' },
};
