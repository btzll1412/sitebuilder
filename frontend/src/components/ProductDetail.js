import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../CartContext';
import * as api from '../api';

export default function ProductDetail({ settings }) {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [displayImage, setDisplayImage] = useState('');
  const { addItem, openCart, items: cartItems } = useCart();

  const brand = settings?.primary_color || '#C2185B';
  const lowStockThreshold = product?.low_stock_threshold || 5;

  // Calculate stock values with explicit dependencies using useMemo
  const stockInfo = useMemo(() => {
    if (!product) {
      return { availableStock: 0, cartQty: 0, maxCanAdd: 0, isLowStock: false, isOutOfStock: true };
    }

    // Get available stock
    const hasVariants = product.variants && product.variants.length > 0;
    let availableStock = 0;
    if (hasVariants && selectedVariant) {
      availableStock = selectedVariant.stock_qty || 0;
    } else {
      availableStock = product.stock_qty || 0;
    }

    // Get cart quantity for this product/variant
    const variantName = hasVariants && selectedVariant ? selectedVariant.name : null;
    const cartKey = variantName ? `${product.id}_${variantName}` : `${product.id}`;
    const cartItem = cartItems.find(i => i.cartKey === cartKey);
    const cartQty = cartItem ? cartItem.qty : 0;

    const maxCanAdd = Math.max(0, availableStock - cartQty);
    const isLowStock = availableStock > 0 && availableStock <= lowStockThreshold;
    const isOutOfStock = availableStock <= 0;

    return { availableStock, cartQty, maxCanAdd, isLowStock, isOutOfStock };
  }, [product, selectedVariant, cartItems, lowStockThreshold]);

  const { availableStock, cartQty, maxCanAdd, isLowStock, isOutOfStock } = stockInfo;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setQuantity(1);
    api.getProduct(id)
      .then(data => {
        setProduct(data);
        setDisplayImage(data.image || '');
        // Set default variant if product has variants (pick first in-stock one)
        if (data.variants && data.variants.length > 0) {
          const firstInStock = data.variants.find(v => (v.stock_qty || 0) > 0) || data.variants[0];
          setSelectedVariant(firstInStock);
          if (firstInStock.image) setDisplayImage(firstInStock.image);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Reset quantity when variant changes
  useEffect(() => {
    setQuantity(1);
  }, [selectedVariant]);

  // Adjust quantity if it exceeds available stock (e.g., after cart changes)
  useEffect(() => {
    if (maxCanAdd > 0 && quantity > maxCanAdd) {
      setQuantity(maxCanAdd);
    } else if (maxCanAdd > 0 && quantity === 0) {
      setQuantity(1);
    }
  }, [maxCanAdd, quantity]);

  const handleVariantSelect = (variant) => {
    if ((variant.stock_qty || 0) <= 0) return; // Can't select out-of-stock
    setSelectedVariant(variant);
    // Update displayed image
    setDisplayImage(variant.image || product.image || '');
  };

  const handleAddToCart = () => {
    const hasVariants = product.variants && product.variants.length > 0;
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: displayImage || product.image,
        variant: hasVariants && selectedVariant ? selectedVariant.name : null,
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    const hasVariants = product.variants && product.variants.length > 0;
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: displayImage || product.image,
        variant: hasVariants && selectedVariant ? selectedVariant.name : null,
      });
    }
    openCart();
  };

  if (loading) {
    return (
      <div style={s.loadingWrap}>
        <div style={{ ...s.spinner, borderTopColor: brand }} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={s.errorWrap}>
        <h2 style={s.errorTitle}>Product not found</h2>
        <p style={s.errorText}>The product you're looking for doesn't exist.</p>
        <Link to="/" style={{ ...s.backLink, color: brand }}>Back to Shop</Link>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <button onClick={() => window.history.back()} style={s.backBtn}>
        <span style={s.backArrow}>←</span> Back
      </button>

      <div style={s.breadcrumb}>
        <Link to="/" style={s.breadcrumbLink}>Home</Link>
        <span style={s.breadcrumbSep}>/</span>
        <span style={s.breadcrumbCurrent}>{product.name}</span>
      </div>

      <div style={s.grid}>
        {/* Image Section */}
        <div style={s.imageSection}>
          <div style={s.mainImage}>
            {displayImage ? (
              <img src={displayImage} alt={product.name} style={s.img} />
            ) : (
              <div style={s.placeholder}>
                <span style={s.placeholderIcon}>◇</span>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div style={s.infoSection}>
          <span style={s.category}>{product.category}</span>
          <h1 style={s.name}>{product.name}</h1>
          <p style={{ ...s.price, color: brand }}>${product.price.toFixed(2)}</p>

          {product.description && (
            <div style={s.descriptionWrap}>
              <h3 style={s.descriptionTitle}>Description</h3>
              <p style={s.description}>{product.description}</p>
            </div>
          )}

          {/* Variant/Color Selector */}
          {product.variants && product.variants.length > 0 && (
            <div style={s.variantWrap}>
              <h3 style={s.variantTitle}>
                Color: <span style={{ color: 'var(--kiosk-text)', fontWeight: 500 }}>{selectedVariant?.name || ''}</span>
              </h3>
              <div style={s.variantOptions}>
                {product.variants.map((v, idx) => {
                  const isSelected = selectedVariant?.name === v.name;
                  const variantOutOfStock = (v.stock_qty || 0) <= 0;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleVariantSelect(v)}
                      disabled={variantOutOfStock}
                      title={variantOutOfStock ? `${v.name} - Out of Stock` : `${v.name} (${v.stock_qty} available)`}
                      style={{
                        ...s.variantSwatch,
                        background: v.color_code || '#888',
                        opacity: variantOutOfStock ? 0.35 : 1,
                        cursor: variantOutOfStock ? 'not-allowed' : 'pointer',
                        boxShadow: isSelected ? `0 0 0 3px ${brand}, 0 0 0 5px rgba(255,255,255,0.3)` : 'none',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >
                      {variantOutOfStock && <span style={s.outOfStockLine} />}
                    </button>
                  );
                })}
              </div>
              {selectedVariant && (selectedVariant.stock_qty || 0) <= 0 && (
                <p style={s.outOfStockText}>This color is currently out of stock</p>
              )}
            </div>
          )}

          <div style={s.stockBadge}>
            {isOutOfStock ? (
              <span style={s.outOfStock}>Out of Stock</span>
            ) : isLowStock ? (
              <span style={s.lowStock}>Only {availableStock} left!</span>
            ) : (
              <span style={s.inStock}>In Stock</span>
            )}
            {cartQty > 0 && !isOutOfStock && (
              <span style={s.cartNote}>({cartQty} in cart)</span>
            )}
          </div>

          {/* Quantity Selector */}
          <div style={s.quantityWrap}>
            <span style={s.quantityLabel}>Quantity</span>
            <div style={s.quantityControls}>
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                style={s.qtyBtn}
                disabled={quantity <= 1}
              >−</button>
              <span style={s.qtyValue}>{quantity}</span>
              <button
                onClick={() => setQuantity(q => Math.min(maxCanAdd, q + 1))}
                style={{
                  ...s.qtyBtn,
                  opacity: quantity >= maxCanAdd ? 0.4 : 1,
                  cursor: quantity >= maxCanAdd ? 'not-allowed' : 'pointer',
                }}
                disabled={quantity >= maxCanAdd}
              >+</button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={s.actions}>
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || maxCanAdd <= 0}
              style={{
                ...s.addBtn,
                background: added ? '#4caf50' : 'transparent',
                borderColor: added ? '#4caf50' : brand,
                color: added ? '#fff' : brand,
                opacity: (isOutOfStock || maxCanAdd <= 0) ? 0.5 : 1,
              }}
            >
              {added ? '✓ Added to Cart' : maxCanAdd <= 0 ? 'Max in Cart' : 'Add to Cart'}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={isOutOfStock || maxCanAdd <= 0}
              style={{
                ...s.buyBtn,
                background: brand,
                opacity: (isOutOfStock || maxCanAdd <= 0) ? 0.5 : 1,
              }}
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  container: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '40px 32px 80px',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--kiosk-text-secondary)',
    background: 'var(--kiosk-card)',
    border: '1px solid var(--kiosk-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    marginBottom: 24,
    transition: 'all 0.2s',
  },
  backArrow: {
    fontSize: '1.1rem',
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid var(--kiosk-elevated)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorWrap: {
    textAlign: 'center',
    padding: '120px 24px',
  },
  errorTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '2rem',
    color: 'var(--kiosk-text)',
    marginBottom: 12,
  },
  errorText: {
    color: 'var(--kiosk-text-secondary)',
    marginBottom: 24,
  },
  backLink: {
    fontWeight: 600,
    textDecoration: 'none',
  },
  breadcrumb: {
    marginBottom: 32,
    fontSize: '0.85rem',
  },
  breadcrumbLink: {
    color: 'var(--kiosk-text-secondary)',
    textDecoration: 'none',
  },
  breadcrumbSep: {
    color: 'var(--kiosk-text-secondary)',
    margin: '0 10px',
  },
  breadcrumbCurrent: {
    color: 'var(--kiosk-text)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 60,
  },
  imageSection: {},
  mainImage: {
    aspectRatio: '1/1',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    background: 'var(--kiosk-card)',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--kiosk-elevated)',
  },
  placeholderIcon: {
    fontSize: '5rem',
    color: 'var(--kiosk-text-secondary)',
    fontFamily: 'var(--font-display)',
  },
  infoSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  category: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--kiosk-text-secondary)',
    marginBottom: 12,
  },
  name: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.25rem',
    fontWeight: 400,
    color: 'var(--kiosk-text)',
    lineHeight: 1.2,
    marginBottom: 16,
  },
  price: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.75rem',
    fontWeight: 600,
    marginBottom: 28,
  },
  descriptionWrap: {
    marginBottom: 28,
  },
  descriptionTitle: {
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--kiosk-text-secondary)',
    marginBottom: 10,
  },
  description: {
    color: 'var(--kiosk-text-secondary)',
    lineHeight: 1.7,
    fontSize: '0.95rem',
  },
  variantWrap: {
    marginBottom: 28,
  },
  variantTitle: {
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--kiosk-text-secondary)',
    marginBottom: 12,
  },
  variantOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
  },
  variantSwatch: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '3px solid var(--kiosk-border)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockLine: {
    position: 'absolute',
    width: '140%',
    height: 2,
    background: '#fff',
    transform: 'rotate(-45deg)',
    boxShadow: '0 0 2px rgba(0,0,0,0.5)',
  },
  outOfStockText: {
    fontSize: '0.8rem',
    color: '#ef5350',
    marginTop: 10,
    fontWeight: 500,
  },
  stockBadge: {
    marginBottom: 28,
  },
  inStock: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#4caf50',
    background: 'rgba(76, 175, 80, 0.1)',
    padding: '6px 14px',
    borderRadius: 20,
  },
  outOfStock: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#ef5350',
    background: 'rgba(239, 83, 80, 0.1)',
    padding: '6px 14px',
    borderRadius: 20,
  },
  lowStock: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#ff9800',
    background: 'rgba(255, 152, 0, 0.1)',
    padding: '6px 14px',
    borderRadius: 20,
  },
  cartNote: {
    fontSize: '0.75rem',
    color: 'var(--kiosk-text-secondary)',
    marginLeft: 10,
  },
  quantityWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  quantityLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--kiosk-text-secondary)',
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--kiosk-border)',
  },
  qtyBtn: {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--kiosk-text)',
    fontSize: '1.2rem',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  qtyValue: {
    width: 40,
    textAlign: 'center',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--kiosk-text)',
  },
  actions: {
    display: 'flex',
    gap: 14,
    marginTop: 'auto',
  },
  addBtn: {
    flex: 1,
    padding: '16px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-md)',
    border: '2px solid',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: 52,
  },
  buyBtn: {
    flex: 1,
    padding: '16px 24px',
    fontSize: '0.85rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    minHeight: 52,
  },
};
