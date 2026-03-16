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
          {orders.map(order => (
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
                    ...s.statusBadge,
                    ...(order.status === 'approved' ? s.statusApproved :
                        order.status === 'declined' ? s.statusDeclined : s.statusPending),
                  }}>
                    {order.status}
                  </span>
                  <span style={s.orderTotal}>${order.total.toFixed(2)}</span>
                  <span style={s.expandIcon}>{expandedOrder === order.id ? '▾' : '▸'}</span>
                </div>
              </div>

              {expandedOrder === order.id && (
                <div style={s.orderDetails}>
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
                </div>
              )}
            </div>
          ))}
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
  orderRight: { display: 'flex', alignItems: 'center', gap: 16 },
  statusBadge: { fontSize: '0.7rem', fontWeight: 600, padding: '4px 12px', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statusApproved: { background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50' },
  statusDeclined: { background: 'rgba(229, 115, 115, 0.1)', color: '#e57373' },
  statusPending: { background: 'rgba(255, 152, 0, 0.1)', color: '#ff9800' },
  orderTotal: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--admin-text)', minWidth: 70, textAlign: 'right' },
  expandIcon: { fontSize: '0.8rem', color: 'var(--admin-text-hint)', width: 20, textAlign: 'center' },

  orderDetails: { borderTop: '1px solid var(--admin-border)', padding: '20px 24px' },
  itemsTable: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  itemRow: { display: 'flex', alignItems: 'center', gap: 12 },
  itemName: { fontSize: '0.88rem', color: 'var(--admin-text)' },
  itemVariant: { fontSize: '0.82rem', color: 'var(--brand)', fontWeight: 500 },
  itemQty: { fontSize: '0.82rem', color: 'var(--admin-text-hint)', width: 40 },
  itemPrice: { fontSize: '0.88rem', fontWeight: 500, color: 'var(--admin-text)', width: 70, textAlign: 'right' },

  orderSummary: { borderTop: '1px solid var(--admin-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 250, marginLeft: 'auto' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' },
  refRow: { fontSize: '0.78rem', color: 'var(--admin-text-hint)', textAlign: 'right', marginTop: 8 },
};
