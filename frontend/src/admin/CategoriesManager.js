import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

export default function CategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [categoriesTree, setCategoriesTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toast = useToast();

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const [flat, tree] = await Promise.all([
        api.getCategories(),
        api.getCategoriesTree(),
      ]);
      setCategories(flat);
      setCategoriesTree(tree);
      // Auto-expand all parents
      const parentIds = new Set(flat.filter(c => c.parent_id === null).map(c => c.id));
      setExpandedIds(parentIds);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category? Products in this category will be uncategorized.')) return;
    try {
      await api.deleteCategory(id);
      toast.success('Category deleted');
      loadCategories();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCategory = (cat, depth = 0) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpanded = expandedIds.has(cat.id);

    return (
      <React.Fragment key={cat.id}>
        <div style={{ ...styles.row, paddingLeft: 20 + depth * 24 }}>
          <div style={styles.rowLeft}>
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(cat.id)}
                style={styles.expandBtn}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <span style={styles.expandPlaceholder}>•</span>
            )}
            {cat.image && (
              <img src={cat.image} alt="" style={styles.catImage} />
            )}
            <span style={styles.catName}>{cat.name}</span>
            <span style={styles.catSlug}>/{cat.slug}</span>
          </div>
          <div style={styles.rowActions}>
            <button
              onClick={() => { setEditingId(cat.id); setShowForm(true); }}
              style={styles.iconBtn}
              title="Edit"
            >✎</button>
            <button
              onClick={() => handleDelete(cat.id)}
              style={{ ...styles.iconBtn, color: '#e57373' }}
              title="Delete"
            >✕</button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          cat.children.map(child => renderCategory(child, depth + 1))
        )}
      </React.Fragment>
    );
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Categories</h2>
          <p style={styles.subtitle}>{categories.length} categories</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          style={styles.addBtn}
        >
          + Add Category
        </button>
      </div>

      {showForm && (
        <CategoryForm
          category={editingId ? categories.find(c => c.id === editingId) : null}
          allCategories={categories}
          onSave={() => { setShowForm(false); setEditingId(null); loadCategories(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {loading ? (
        <div style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      ) : categoriesTree.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No categories yet</p>
          <p style={styles.emptyText}>Add categories to organize your products.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {categoriesTree.map(cat => renderCategory(cat))}
        </div>
      )}
    </div>
  );
}

function CategoryForm({ category, allCategories, onSave, onCancel }) {
  const [name, setName] = useState(category?.name || '');
  const [parentId, setParentId] = useState(category?.parent_id || '');
  const [image, setImage] = useState(category?.image || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const toast = useToast();

  // Get potential parents (exclude self and descendants)
  const getDescendantIds = (catId) => {
    const ids = new Set([catId]);
    const findDescendants = (id) => {
      allCategories.filter(c => c.parent_id === id).forEach(c => {
        ids.add(c.id);
        findDescendants(c.id);
      });
    };
    findDescendants(catId);
    return ids;
  };

  const excludeIds = category ? getDescendantIds(category.id) : new Set();
  const parentOptions = allCategories.filter(c => !excludeIds.has(c.id));

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
      const data = {
        name: name.trim(),
        parent_id: parentId ? parseInt(parentId) : null,
        image,
      };

      if (category) {
        await api.updateCategory(category.id, data);
        toast.success('Category updated');
      } else {
        await api.createCategory(data);
        toast.success('Category created');
      }
      onSave();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.uploadFile(file);
      setImage(result.url);
    } catch (err) {
      toast.error('Failed to upload image');
    }
  };

  return (
    <div style={formStyles.overlay} onClick={onCancel}>
      <div style={formStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={formStyles.modalHeader}>
          <h3 style={formStyles.modalTitle}>{category ? 'Edit Category' : 'New Category'}</h3>
          <button onClick={onCancel} style={formStyles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={formStyles.form}>
          <div style={formStyles.field}>
            <label style={formStyles.label}>Name *</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
              style={{ ...formStyles.input, ...(errors.name ? formStyles.inputError : {}) }}
              placeholder="Category name"
            />
            {errors.name && <span style={formStyles.errorText}>{errors.name}</span>}
          </div>

          <div style={formStyles.field}>
            <label style={formStyles.label}>Parent Category</label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              style={formStyles.input}
            >
              <option value="">None (Top Level)</option>
              {parentOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p style={formStyles.hint}>Make this a sub-category of another category</p>
          </div>

          <div style={formStyles.field}>
            <label style={formStyles.label}>Image</label>
            <div style={formStyles.imageRow}>
              {image && <img src={image} alt="" style={formStyles.imagePreview} />}
              <label style={formStyles.uploadBtn}>
                {image ? 'Change' : 'Upload Image'}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>
              {image && <button type="button" onClick={() => setImage('')} style={formStyles.clearBtn}>Clear</button>}
            </div>
          </div>

          <div style={formStyles.actions}>
            <button type="button" onClick={onCancel} style={formStyles.cancelBtn}>Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...formStyles.saveBtn, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Saving...' : (category ? 'Update' : 'Create')}
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
    marginBottom: 28,
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
  addBtn: {
    padding: '12px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--brand)',
    borderRadius: 'var(--radius-md)',
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
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid var(--admin-border)',
  },
  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  expandBtn: {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    color: 'var(--admin-text-secondary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  expandPlaceholder: {
    width: 24,
    textAlign: 'center',
    color: 'var(--admin-text-hint)',
    fontSize: '0.6rem',
  },
  catImage: {
    width: 32,
    height: 32,
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
  },
  catName: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: 'var(--admin-text)',
  },
  catSlug: {
    fontSize: '0.75rem',
    color: 'var(--admin-text-hint)',
    fontFamily: 'monospace',
  },
  rowActions: {
    display: 'flex',
    gap: 4,
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
    maxWidth: 480,
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
  hint: {
    fontSize: '0.75rem',
    color: 'var(--admin-text-hint)',
    marginTop: 4,
  },
  imageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
  },
  uploadBtn: {
    padding: '10px 18px',
    fontSize: '0.82rem',
    fontWeight: 500,
    color: 'var(--brand)',
    background: 'var(--brand-light)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '10px 14px',
    fontSize: '0.82rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    background: 'var(--admin-surface)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
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
