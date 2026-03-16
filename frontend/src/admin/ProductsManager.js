import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const toast = useToast();

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAllProducts();
      setProducts(data);
      const cats = [...new Set(data.map(p => p.category))].sort();
      setCategories(cats);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = filterCategory === 'all'
    ? products
    : products.filter(p => p.category === filterCategory);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.deleteProduct(id);
      toast.success('Product deleted');
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} product(s)?`)) return;
    try {
      for (const id of selected) {
        await api.deleteProduct(id);
      }
      setSelected(new Set());
      toast.success(`${selected.size} product(s) deleted`);
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleBulkStock = async (inStock) => {
    if (selected.size === 0) return;
    try {
      for (const id of selected) {
        const prod = products.find(p => p.id === id);
        if (!prod) continue;
        const fd = new FormData();
        fd.append('name', prod.name);
        fd.append('price', prod.price);
        fd.append('description', prod.description);
        fd.append('category', prod.category);
        fd.append('in_stock', inStock ? 1 : 0);
        fd.append('sort_order', prod.sort_order);
        await api.updateProduct(id, fd);
      }
      setSelected(new Set());
      toast.success(`Updated ${selected.size} product(s)`);
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const moveProduct = async (index, direction) => {
    const newList = [...filtered];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    try {
      await api.reorderProducts(newList.map(p => p.id));
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Products</h2>
          <p style={styles.subtitle}>{products.length} total products</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          style={styles.addBtn}
        >
          + Add Product
        </button>
      </div>

      {/* Filters & Bulk Actions */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <button
            onClick={() => setFilterCategory('all')}
            style={{ ...styles.filterBtn, ...(filterCategory === 'all' ? styles.filterActive : {}) }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{ ...styles.filterBtn, ...(filterCategory === cat ? styles.filterActive : {}) }}
            >
              {cat}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div style={styles.bulkActions}>
            <span style={styles.bulkLabel}>{selected.size} selected</span>
            <button onClick={() => handleBulkStock(true)} style={styles.bulkBtn}>Mark In Stock</button>
            <button onClick={() => handleBulkStock(false)} style={styles.bulkBtn}>Mark Out of Stock</button>
            <button onClick={handleBulkDelete} style={{ ...styles.bulkBtn, color: '#e57373' }}>Delete</button>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <ProductForm
          product={editingId ? products.find(p => p.id === editingId) : null}
          categories={categories}
          onSave={() => { setShowForm(false); setEditingId(null); loadProducts(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {/* Products List */}
      {loading ? (
        <div style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No products yet</p>
          <p style={styles.emptyText}>Add your first product to get started.</p>
        </div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <div style={{ width: 36 }}>
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                style={styles.checkbox}
              />
            </div>
            <div style={{ width: 60 }}>Image</div>
            <div style={{ flex: 1 }}>Product</div>
            <div style={{ width: 100 }}>Category</div>
            <div style={{ width: 80, textAlign: 'right' }}>Price</div>
            <div style={{ width: 80, textAlign: 'center' }}>Stock</div>
            <div style={{ width: 140, textAlign: 'right' }}>Actions</div>
          </div>

          {filtered.map((product, index) => (
            <div key={product.id} style={styles.tableRow}>
              <div style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={selected.has(product.id)}
                  onChange={() => toggleSelect(product.id)}
                  style={styles.checkbox}
                />
              </div>
              <div style={{ width: 60 }}>
                {product.image ? (
                  <img src={product.image} alt="" style={styles.thumb} />
                ) : (
                  <div style={styles.thumbPlaceholder}>◇</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.productName}>{product.name}</div>
                <div style={styles.productDesc}>
                  {product.description?.substring(0, 60)}{product.description?.length > 60 ? '...' : ''}
                </div>
              </div>
              <div style={{ width: 100 }}>
                <span style={styles.categoryBadge}>{product.category}</span>
              </div>
              <div style={{ width: 80, textAlign: 'right', fontWeight: 600, color: 'var(--admin-text)' }}>
                ${product.price.toFixed(2)}
              </div>
              <div style={{ width: 80, textAlign: 'center' }}>
                <span style={{
                  ...styles.stockBadge,
                  ...(product.in_stock ? styles.stockIn : styles.stockOut),
                }}>
                  {product.in_stock ? 'In Stock' : 'Out'}
                </span>
              </div>
              <div style={{ width: 140, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => moveProduct(index, -1)}
                  disabled={index === 0}
                  style={{ ...styles.iconBtn, opacity: index === 0 ? 0.3 : 1 }}
                  title="Move up"
                >↑</button>
                <button
                  onClick={() => moveProduct(index, 1)}
                  disabled={index === filtered.length - 1}
                  style={{ ...styles.iconBtn, opacity: index === filtered.length - 1 ? 0.3 : 1 }}
                  title="Move down"
                >↓</button>
                <button
                  onClick={() => { setEditingId(product.id); setShowForm(true); }}
                  style={styles.iconBtn}
                  title="Edit"
                >✎</button>
                <button
                  onClick={() => handleDelete(product.id)}
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

// ─── Product Form ───────────────────────────────────────────────────────────

function ProductForm({ product, categories, onSave, onCancel }) {
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [category, setCategory] = useState(product?.category || '');
  const [inStock, setInStock] = useState(product?.in_stock ?? 1);
  const [sortOrder, setSortOrder] = useState(product?.sort_order?.toString() || '0');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileRef = useRef(null);
  const toast = useToast();

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!price || parseFloat(price) <= 0) e.price = 'Price must be greater than 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      toast.error('Only JPG, PNG, and WebP images are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const input = fileRef.current;
      const dt = new DataTransfer();
      dt.items.add(file);
      if (input) input.files = dt.files;
      handleImageChange({ target: { files: [file] } });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('description', description);
      fd.append('price', parseFloat(price));
      fd.append('category', category || 'General');
      fd.append('in_stock', inStock);
      fd.append('sort_order', parseInt(sortOrder) || 0);
      if (imageFile) fd.append('image', imageFile);

      if (product) {
        await api.updateProduct(product.id, fd);
        toast.success('Product updated');
      } else {
        await api.createProduct(fd);
        toast.success('Product created');
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
          <h3 style={formStyles.modalTitle}>{product ? 'Edit Product' : 'New Product'}</h3>
          <button onClick={onCancel} style={formStyles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={formStyles.form}>
          <div style={formStyles.row}>
            <div style={formStyles.field}>
              <label style={formStyles.label}>Name *</label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
                style={{ ...formStyles.input, ...(errors.name ? formStyles.inputError : {}) }}
                placeholder="Product name"
              />
              {errors.name && <span style={formStyles.errorText}>{errors.name}</span>}
            </div>
            <div style={formStyles.field}>
              <label style={formStyles.label}>Price *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={e => { setPrice(e.target.value); setErrors(p => ({ ...p, price: '' })); }}
                style={{ ...formStyles.input, ...(errors.price ? formStyles.inputError : {}) }}
                placeholder="0.00"
              />
              {errors.price && <span style={formStyles.errorText}>{errors.price}</span>}
            </div>
          </div>

          <div style={formStyles.field}>
            <label style={formStyles.label}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ ...formStyles.input, minHeight: 80, resize: 'vertical' }}
              placeholder="Product description..."
            />
          </div>

          <div style={formStyles.row}>
            <div style={formStyles.field}>
              <label style={formStyles.label}>Category</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={formStyles.input}
                placeholder="General"
                list="categories"
              />
              <datalist id="categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div style={formStyles.field}>
              <label style={formStyles.label}>Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value)}
                style={formStyles.input}
              />
            </div>
          </div>

          <div style={formStyles.field}>
            <label style={formStyles.label}>Image</label>
            <div
              style={formStyles.dropZone}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="" style={formStyles.preview} />
              ) : (
                <div style={formStyles.dropText}>
                  <span style={{ fontSize: '1.5rem', marginBottom: 4 }}>⬆</span>
                  <span>Drop image here or click to upload</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-hint)' }}>
                    JPG, PNG, WebP up to 10MB
                  </span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div style={formStyles.field}>
            <label style={formStyles.toggleLabel}>
              <input
                type="checkbox"
                checked={!!inStock}
                onChange={e => setInStock(e.target.checked ? 1 : 0)}
                style={formStyles.checkbox}
              />
              <span style={{
                ...formStyles.toggle,
                background: inStock ? 'var(--brand)' : 'var(--admin-border)',
              }}>
                <span style={{
                  ...formStyles.toggleDot,
                  transform: inStock ? 'translateX(18px)' : 'translateX(2px)',
                }} />
              </span>
              In Stock
            </label>
          </div>

          <div style={formStyles.actions}>
            <button type="button" onClick={onCancel} style={formStyles.cancelBtn}>Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...formStyles.saveBtn, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    transition: 'background 0.15s',
    minHeight: 44,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  filterGroup: {
    display: 'flex',
    gap: 6,
  },
  filterBtn: {
    padding: '8px 16px',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    background: 'var(--admin-card)',
    border: '1px solid var(--admin-border)',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.15s',
    minHeight: 36,
  },
  filterActive: {
    background: 'var(--brand-light)',
    color: 'var(--brand)',
    borderColor: 'var(--brand)',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  bulkLabel: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    marginRight: 4,
  },
  bulkBtn: {
    padding: '6px 14px',
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    background: 'var(--admin-surface)',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 0.15s',
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
  table: {
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--admin-border)',
    overflow: 'hidden',
  },
  tableHeader: {
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
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid var(--admin-border)',
    transition: 'background 0.1s',
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: 'var(--brand)',
    cursor: 'pointer',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
  },
  thumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--admin-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--admin-text-hint)',
    fontSize: '1.1rem',
  },
  productName: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: 'var(--admin-text)',
    marginBottom: 2,
  },
  productDesc: {
    fontSize: '0.78rem',
    color: 'var(--admin-text-hint)',
  },
  categoryBadge: {
    fontSize: '0.72rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    background: 'var(--admin-surface)',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
  },
  stockBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 'var(--radius-sm)',
  },
  stockIn: {
    background: 'rgba(125, 211, 168, 0.12)',
    color: '#4caf50',
  },
  stockOut: {
    background: 'rgba(229, 115, 115, 0.12)',
    color: '#e57373',
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    color: 'var(--admin-text-secondary)',
    borderRadius: 'var(--radius-sm)',
    transition: 'background 0.15s',
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
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90vh',
    overflow: 'auto',
    background: 'var(--admin-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    animation: 'scaleIn 0.25s ease',
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
    borderRadius: 'var(--radius-sm)',
  },
  form: {
    padding: '24px 28px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  row: {
    display: 'flex',
    gap: 16,
  },
  field: {
    flex: 1,
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
    transition: 'border-color 0.2s, box-shadow 0.2s',
    width: '100%',
  },
  inputError: {
    borderColor: '#C2185B',
    boxShadow: '0 0 0 3px rgba(194, 24, 91, 0.1)',
  },
  errorText: {
    fontSize: '0.75rem',
    color: '#C2185B',
    fontWeight: 500,
  },
  dropZone: {
    border: '2px dashed var(--admin-border)',
    borderRadius: 'var(--radius-md)',
    padding: 24,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    minHeight: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    fontSize: '0.85rem',
    color: 'var(--admin-text-secondary)',
  },
  preview: {
    maxHeight: 160,
    borderRadius: 'var(--radius-sm)',
    objectFit: 'contain',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--admin-text)',
    cursor: 'pointer',
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    position: 'relative',
    transition: 'background 0.2s',
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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
    borderRadius: 'var(--radius-md)',
    minHeight: 44,
  },
  saveBtn: {
    padding: '12px 28px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--brand)',
    borderRadius: 'var(--radius-md)',
    minHeight: 44,
    transition: 'opacity 0.15s',
  },
};
