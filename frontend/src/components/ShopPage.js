import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import * as api from '../api';

// Helper to check if product can be added directly from grid
function canAddFromGrid(product) {
  const hasVariants = product.variants && product.variants.length > 0;

  // Has variants - must go to detail page to select
  if (hasVariants) {
    // Check if any variant has stock
    const totalVariantStock = product.variants.reduce((sum, v) => sum + (v.stock_qty || 0), 0);
    if (totalVariantStock <= 0) {
      return { canAdd: false, reason: 'out_of_stock' };
    }
    return { canAdd: false, reason: 'variants' };
  }

  // No variants - check main stock_qty
  if (product.stock_qty !== undefined && product.stock_qty <= 0) {
    return { canAdd: false, reason: 'out_of_stock' };
  }
  return { canAdd: true, reason: null };
}

export default function ShopPage({ settings }) {
  const [products, setProducts] = useState([]);
  const [categoriesTree, setCategoriesTree] = useState([]);
  const [skinConcerns, setSkinConcerns] = useState([]);
  const [selectedConcerns, setSelectedConcerns] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addItem, items: cartItems } = useCart();
  const [addedId, setAddedId] = useState(null);
  const sectionRefs = useRef({});
  const isScrolling = useRef(false);
  const searchTimeout = useRef(null);

  const brand = settings?.primary_color || '#C2185B';

  // Load initial data
  useEffect(() => {
    Promise.all([
      api.getProducts(),
      api.getCategoriesTree(),
      api.getSkinConcerns(),
    ])
      .then(([prods, catTree, concerns]) => {
        setProducts(prods);
        setCategoriesTree(catTree);
        setSkinConcerns(concerns);
        // Auto-expand top-level categories
        const topLevelIds = new Set(catTree.map(c => c.id));
        setExpandedCategories(topLevelIds);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced search
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query || query.length < 2) {
      setSearchResults(null);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await api.searchProducts(query);
        setSearchResults(results);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  }, []);

  // Filter products by selected concerns
  const filteredProducts = useCallback(() => {
    if (searchResults !== null) return searchResults;
    if (selectedConcerns.length === 0) return products;

    return products.filter(p => {
      const productConcernIds = (p.skin_concerns || []).map(c => c.id);
      return selectedConcerns.some(id => productConcernIds.includes(id));
    });
  }, [products, selectedConcerns, searchResults]);

  // Get flat list of category names for section rendering
  const getFlatCategories = (items) => {
    let result = [];
    for (const item of items) {
      result.push(item);
      if (item.children && item.children.length > 0) {
        result = result.concat(getFlatCategories(item.children));
      }
    }
    return result;
  };

  const flatCategories = getFlatCategories(categoriesTree);
  const categoryNames = flatCategories.map(c => c.name);

  // Track which section is in view
  useEffect(() => {
    const handleScroll = () => {
      if (isScrolling.current) return;

      const scrollPos = window.scrollY + 150;
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;

      // If at bottom, activate last category
      if (atBottom && categoryNames.length > 0) {
        setActiveCategory(categoryNames[categoryNames.length - 1]);
        return;
      }

      for (const catName of categoryNames) {
        const el = sectionRefs.current[catName];
        if (el) {
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (scrollPos >= top && scrollPos < bottom) {
            setActiveCategory(catName);
            break;
          }
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categoryNames]);

  const scrollToCategory = (catName) => {
    setActiveCategory(catName);
    isScrolling.current = true;
    const el = sectionRefs.current[catName];
    if (el) {
      const top = el.offsetTop - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setTimeout(() => {
      isScrolling.current = false;
    }, 800);
  };

  const toggleCategoryExpand = (catId) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleConcern = (concernId) => {
    setSelectedConcerns(prev =>
      prev.includes(concernId)
        ? prev.filter(id => id !== concernId)
        : [...prev, concernId]
    );
    setSearchResults(null);
    setSearchQuery('');
  };

  const handleAdd = (product) => {
    // Check if we can add more (for products without variants)
    const cartKey = `${product.id}`;
    const cartItem = cartItems.find(i => i.cartKey === cartKey);
    const cartQty = cartItem ? cartItem.qty : 0;
    const availableStock = product.stock_qty || 0;

    if (cartQty >= availableStock) {
      return; // Can't add more
    }

    addItem({ id: product.id, name: product.name, price: product.price, image: product.image });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  const displayProducts = filteredProducts();
  const productsByCategory = categoryNames.reduce((acc, catName) => {
    acc[catName] = displayProducts.filter(p => p.category === catName);
    return acc;
  }, {});

  // Render category tree item
  const renderCategoryItem = (cat, depth = 0) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpanded = expandedCategories.has(cat.id);
    const isActive = activeCategory === cat.name;

    return (
      <React.Fragment key={cat.id}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {hasChildren && (
            <button
              onClick={() => toggleCategoryExpand(cat.id)}
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.6rem',
                color: 'var(--kiosk-text-secondary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                marginLeft: depth * 12,
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <button
            onClick={() => scrollToCategory(cat.name)}
            style={{
              ...s.sidebarLink,
              paddingLeft: hasChildren ? 4 : (12 + depth * 12),
              flex: 1,
              ...(isActive ? { ...s.sidebarLinkActive, borderLeftColor: brand, color: brand } : {}),
            }}
          >
            {cat.name}
          </button>
        </div>
        {hasChildren && isExpanded && cat.children.map(child => renderCategoryItem(child, depth + 1))}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div style={s.loadingWrap}>
        <div style={{ ...s.spinner, borderTopColor: brand }} />
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarInner}>
          {/* Search */}
          <div style={s.searchWrap}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search products..."
              style={s.searchInput}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                style={s.searchClear}
              >✕</button>
            )}
          </div>

          {/* Categories */}
          <h3 style={s.sidebarTitle}>Categories</h3>
          <nav style={s.sidebarNav}>
            {categoriesTree.map(cat => renderCategoryItem(cat))}
          </nav>

          {/* Skin Concerns Filter */}
          {skinConcerns.length > 0 && (
            <>
              <h3 style={{ ...s.sidebarTitle, marginTop: 24 }}>Skin Concerns</h3>
              <div style={s.concernsWrap}>
                {skinConcerns.map(concern => (
                  <button
                    key={concern.id}
                    onClick={() => toggleConcern(concern.id)}
                    style={{
                      ...s.concernPill,
                      background: selectedConcerns.includes(concern.id) ? brand : 'var(--kiosk-card)',
                      color: selectedConcerns.includes(concern.id) ? '#fff' : 'var(--kiosk-text-secondary)',
                      borderColor: selectedConcerns.includes(concern.id) ? brand : 'var(--kiosk-border)',
                    }}
                  >
                    {concern.name}
                  </button>
                ))}
              </div>
              {selectedConcerns.length > 0 && (
                <button
                  onClick={() => setSelectedConcerns([])}
                  style={s.clearFilters}
                >
                  Clear filters
                </button>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={s.main}>
        {/* Search Results Banner */}
        {searchResults !== null && (
          <div style={s.searchBanner}>
            <span>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </span>
            <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} style={s.searchBannerClose}>
              Clear search
            </button>
          </div>
        )}

        {/* Selected Concerns Banner */}
        {selectedConcerns.length > 0 && searchResults === null && (
          <div style={s.filterBanner}>
            <span>Showing products for: </span>
            {skinConcerns.filter(c => selectedConcerns.includes(c.id)).map(c => (
              <span key={c.id} style={{ ...s.filterTag, borderColor: brand, color: brand }}>
                {c.name}
                <button onClick={() => toggleConcern(c.id)} style={s.filterTagRemove}>✕</button>
              </span>
            ))}
          </div>
        )}

        {categoryNames.length === 0 && !searchResults ? (
          <div style={s.empty}>
            <p style={s.emptyText}>No products available yet.</p>
          </div>
        ) : searchResults !== null ? (
          // Search results view - flat grid
          <section style={s.section}>
            <div style={s.productGrid}>
              {searchResults.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  brand={brand}
                  onAdd={() => handleAdd(product)}
                  justAdded={addedId === product.id}
                  cartItems={cartItems}
                />
              ))}
            </div>
            {searchResults.length === 0 && (
              <div style={s.empty}>
                <p style={s.emptyText}>No products match your search.</p>
              </div>
            )}
          </section>
        ) : (
          // Category sections view
          categoryNames.map(catName => {
            const catProducts = productsByCategory[catName] || [];
            if (catProducts.length === 0) return null;
            return (
              <section
                key={catName}
                ref={el => sectionRefs.current[catName] = el}
                style={s.section}
              >
                <h2 style={{ ...s.sectionTitle, color: brand }}>{catName}</h2>
                <div style={s.productGrid}>
                  {catProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      brand={brand}
                      onAdd={() => handleAdd(product)}
                      justAdded={addedId === product.id}
                      cartItems={cartItems}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

function ProductCard({ product, brand, onAdd, justAdded, cartItems = [] }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const { canAdd, reason } = canAddFromGrid(product);

  const saveScrollAndNavigate = () => {
    // Save current scroll position and path before navigating to product
    sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    sessionStorage.setItem('scrollPath', window.location.pathname);
    navigate(`/product/${product.id}`);
  };

  // Check if cart already has max stock
  const cartKey = `${product.id}`;
  const cartItem = cartItems.find(i => i.cartKey === cartKey);
  const cartQty = cartItem ? cartItem.qty : 0;
  const availableStock = product.stock_qty || 0;
  const atMaxStock = !product.variants?.length && cartQty >= availableStock;

  const handleAddClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (reason === 'variants') {
      navigate(`/product/${product.id}`);
    } else if (canAdd && !atMaxStock) {
      onAdd();
    }
  };

  const getButtonText = () => {
    if (justAdded) return '✓ Added';
    if (reason === 'out_of_stock') return 'Out of Stock';
    if (reason === 'variants') return 'Select Options';
    if (atMaxStock) return 'Max in Cart';
    return 'Add to Cart';
  };

  const getButtonStyle = () => {
    if (justAdded) {
      return { ...s.addBtn, background: '#4caf50', cursor: 'pointer' };
    }
    if (reason === 'out_of_stock' || atMaxStock) {
      return { ...s.addBtn, background: '#666', cursor: 'not-allowed', opacity: 0.7 };
    }
    return { ...s.addBtn, background: brand, cursor: 'pointer' };
  };

  return (
    <div
      style={{
        ...s.card,
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered ? `0 20px 40px rgba(0,0,0,0.3), 0 0 40px ${brand}15` : '0 2px 8px rgba(0,0,0,0.1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div onClick={saveScrollAndNavigate} style={{ textDecoration: 'none', cursor: 'pointer' }}>
        <div style={s.cardImage}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              style={{
                ...s.cardImg,
                transform: hovered ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          ) : (
            <div style={s.cardPlaceholder}>◇</div>
          )}
        </div>
        <div style={s.cardInfo}>
          <h3 style={s.cardName}>{product.name}</h3>
          <span style={{ ...s.cardPrice, color: brand }}>${product.price.toFixed(2)}</span>
        </div>
      </div>
      <div style={s.cardActions}>
        <button
          onClick={handleAddClick}
          disabled={reason === 'out_of_stock' || atMaxStock}
          style={getButtonStyle()}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    minHeight: '100vh',
  },
  loadingWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    width: '100%',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid var(--kiosk-elevated)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    background: 'var(--kiosk-surface)',
    borderRight: '1px solid var(--kiosk-border)',
    position: 'sticky',
    top: 72,
    height: 'calc(100vh - 72px)',
    overflowY: 'auto',
  },
  sidebarInner: {
    padding: '24px 0',
  },
  searchWrap: {
    padding: '0 16px 20px',
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    padding: '12px 36px 12px 14px',
    fontSize: '0.9rem',
    border: '1px solid var(--kiosk-border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--kiosk-card)',
    color: 'var(--kiosk-text)',
    outline: 'none',
  },
  searchClear: {
    position: 'absolute',
    right: 24,
    top: 10,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    color: 'var(--kiosk-text-secondary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  sidebarTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--kiosk-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '0 20px',
    marginBottom: 12,
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarLink: {
    display: 'block',
    padding: '10px 20px',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--kiosk-text-secondary)',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sidebarLinkActive: {
    background: 'var(--kiosk-elevated)',
    fontWeight: 600,
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
  },
  concernsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '0 16px',
  },
  concernPill: {
    padding: '8px 14px',
    fontSize: '0.78rem',
    fontWeight: 500,
    borderRadius: 20,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  clearFilters: {
    display: 'block',
    margin: '12px 16px 0',
    padding: '8px 14px',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--kiosk-text-secondary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  searchBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    marginBottom: 24,
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.9rem',
    color: 'var(--kiosk-text)',
  },
  searchBannerClose: {
    padding: '8px 16px',
    fontSize: '0.82rem',
    fontWeight: 500,
    color: 'var(--kiosk-text-secondary)',
    background: 'var(--kiosk-elevated)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  filterBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '16px 24px',
    marginBottom: 24,
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.9rem',
    color: 'var(--kiosk-text-secondary)',
    flexWrap: 'wrap',
  },
  filterTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: '0.8rem',
    fontWeight: 500,
    borderRadius: 16,
    border: '1px solid',
    background: 'transparent',
  },
  filterTagRemove: {
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.7rem',
    color: 'inherit',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    opacity: 0.7,
  },
  main: {
    flex: 1,
    padding: '40px 48px 80px',
  },
  section: {
    marginBottom: 64,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.75rem',
    fontWeight: 500,
    marginBottom: 32,
    paddingBottom: 16,
    borderBottom: '1px solid var(--kiosk-border)',
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 24,
  },
  empty: {
    textAlign: 'center',
    padding: '120px 24px',
  },
  emptyText: {
    color: 'var(--kiosk-text-secondary)',
    fontSize: '1.1rem',
  },
  card: {
    background: 'var(--kiosk-card)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease',
  },
  cardImage: {
    aspectRatio: '1/1',
    background: 'var(--kiosk-elevated)',
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.5s ease',
  },
  cardPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--kiosk-text-secondary)',
    fontFamily: 'var(--font-display)',
    fontSize: '2.5rem',
  },
  cardInfo: {
    padding: '16px 18px 8px',
  },
  cardName: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 500,
    color: 'var(--kiosk-text)',
    marginBottom: 6,
  },
  cardPrice: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  cardActions: {
    padding: '8px 18px 18px',
  },
  addBtn: {
    width: '100%',
    padding: '12px 16px',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
    minHeight: 44,
  },
};
