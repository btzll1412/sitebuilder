import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

export default function SkinConcernsManager() {
  const [concerns, setConcerns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();

  const loadConcerns = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSkinConcerns();
      setConcerns(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadConcerns(); }, [loadConcerns]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this skin concern? It will be removed from all products.')) return;
    try {
      await api.deleteSkinConcern(id);
      toast.success('Skin concern deleted');
      loadConcerns();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const moveItem = async (index, direction) => {
    const newList = [...concerns];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    try {
      await api.reorderSkinConcerns(newList.map(c => c.id));
      loadConcerns();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Skin Concerns</h2>
          <p style={styles.subtitle}>{concerns.length} concerns</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          style={styles.addBtn}
        >
          + Add Skin Concern
        </button>
      </div>

      <p style={styles.description}>
        Skin concerns help customers filter products based on their skincare needs.
        Products can be tagged with multiple concerns.
      </p>

      {showForm && (
        <SkinConcernForm
          concern={editingId ? concerns.find(c => c.id === editingId) : null}
          onSave={() => { setShowForm(false); setEditingId(null); loadConcerns(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {loading ? (
        <div style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      ) : concerns.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No skin concerns yet</p>
          <p style={styles.emptyText}>Add skin concerns to help customers filter products.</p>
        </div>
      ) : (
        <div style={styles.list}>
          <div style={styles.listHeader}>
            <div style={{ flex: 1 }}>Name</div>
            <div style={{ width: 120 }}>Slug</div>
            <div style={{ width: 100, textAlign: 'right' }}>Actions</div>
          </div>
          {concerns.map((concern, index) => (
            <div key={concern.id} style={styles.row}>
              <div style={{ flex: 1 }}>
                <span style={styles.concernName}>{concern.name}</span>
              </div>
              <div style={{ width: 120 }}>
                <span style={styles.concernSlug}>{concern.slug}</span>
              </div>
              <div style={{ width: 100, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  style={{ ...styles.iconBtn, opacity: index === 0 ? 0.3 : 1 }}
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => moveItem(index, 1)}
                  disabled={index === concerns.length - 1}
                  style={{ ...styles.iconBtn, opacity: index === concerns.length - 1 ? 0.3 : 1 }}
                  title="Move down"
                >↓</button>
                <button
                  onClick={() => { setEditingId(concern.id); setShowForm(true); }}
                  style={styles.iconBtn}
                  title="Edit"
                >✎</button>
                <button
                  onClick={() => handleDelete(concern.id)}
                  style={{ ...styles.iconBtn, color: '#e57373' }}
                  title="Delete"
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkinConcernForm({ concern, onSave, onCancel }) {
  const [name, setName] = useState(concern?.name || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const data = { name: name.trim() };

      if (concern) {
        await api.updateSkinConcern(concern.id, data);
        toast.success('Skin concern updated');
      } else {
        await api.createSkinConcern(data);
        toast.success('Skin concern created');
      }
      onSave();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={formStyles.overlay} onClick={onCancel}>
      <div style={formStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={formStyles.modalHeader}>
          <h3 style={formStyles.modalTitle}>{concern ? 'Edit Skin Concern' : 'New Skin Concern'}</h3>
          <button onClick={onCancel} style={formStyles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={formStyles.form}>
          <div style={formStyles.field}>
            <label style={formStyles.label}>Name *</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
              style={{ ...formStyles.input, ...(errors.name ? formStyles.inputError : {}) }}
              placeholder="e.g., Dry Skin, Wrinkles, Acne-Prone"
            />
            {errors.name && <span style={formStyles.errorText}>{errors.name}</span>}
          </div>

          <div style={formStyles.actions}>
            <button type="button" onClick={onCancel} style={formStyles.cancelBtn}>Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...formStyles.saveBtn, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Saving...' : (concern ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.75rem',
    fontWeight: 600,
    color: 'var(--admin-text)',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--admin-text-hint)',
  },
  description: {
    fontSize: '0.9rem',
    color: 'var(--admin-text-secondary)',
    marginBottom: 28,
    lineHeight: 1.6,
  },
  addBtn: {
    padding: '12px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--brand)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    minHeight: 44,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: 60,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--admin-border)',
    borderTopColor: 'var(--brand)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    textAlign: 'center',
    padding: '80px 24px',
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--admin-border)',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--admin-text)',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: '0.875rem',
    color: 'var(--admin-text-hint)',
  },
  list: {
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--admin-border)',
    overflow: 'hidden',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 20px',
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--admin-text-hint)',
    borderBottom: '1px solid var(--admin-border)',
    background: 'var(--admin-surface)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid var(--admin-border)',
  },
  concernName: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: 'var(--admin-text)',
  },
  concernSlug: {
    fontSize: '0.75rem',
    color: 'var(--admin-text-hint)',
    fontFamily: 'monospace',
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    color: 'var(--admin-text-secondary)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    minWidth: 32,
    minHeight: 32,
  },
};

const formStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90vh',
    overflow: 'auto',
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 28px 0',
  },
  modalTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.3rem',
    fontWeight: 600,
    color: 'var(--admin-text)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    color: 'var(--admin-text-hint)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  form: {
    padding: '24px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    padding: '12px 14px',
    fontSize: '0.9rem',
    border: '1.5px solid var(--admin-border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--admin-surface)',
    color: 'var(--admin-text)',
    outline: 'none',
  },
  inputError: {
    borderColor: '#C2185B',
  },
  errorText: {
    fontSize: '0.75rem',
    color: '#C2185B',
    fontWeight: 500,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    padding: '12px 24px',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    background: 'var(--admin-surface)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    minHeight: 44,
  },
  saveBtn: {
    padding: '12px 28px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--brand)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    minHeight: 44,
  },
};
