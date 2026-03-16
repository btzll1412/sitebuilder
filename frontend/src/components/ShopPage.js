import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../CartContext';
import * as api from '../api';

export default function ShopPage({ settings }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [addedId, setAddedId] = useState(null);
  const sectionRefs = useRef({});
  const isScrolling = useRef(false);

  const brand = settings?.primary_color || '#C2185B';

  useEffect(() => {
    Promise.all([api.getProducts(), api.getCategories()])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
        if (cats.length > 0) setActiveCategory(cats[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Track which section is in view
  useEffect(() => {
    const handleScroll = () => {
      if (isScrolling.current) return;

      const scrollPos = window.scrollY + 150;
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;

      // If at bottom, activate last category
      if (atBottom && categories.length > 0) {
        setActiveCategory(categories[categories.length - 1]);
        return;
      }

      for (const cat of categories) {
        const el = sectionRefs.current[cat];
        if (el) {
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (scrollPos >= top && scrollPos < bottom) {
            setActiveCategory(cat);
            break;
          }
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories]);

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    isScrolling.current = true;
    const el = sectionRefs.current[cat];
    if (el) {
      const top = el.offsetTop - 100;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    // Re-enable scroll detection after animation
    setTimeout(() => {
      isScrolling.current = false;
    }, 800);
  };

  const handleAdd = (product) => {
    addItem({ id: product.id, name: product.name, price: product.price, image: product.image });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  const productsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat);
    return acc;
  }, {});

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
          <h3 style={s.sidebarTitle}>Categories</h3>
          <nav style={s.sidebarNav}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                style={{
                  ...s.sidebarLink,
                  ...(activeCategory === cat ? { ...s.sidebarLinkActive, borderLeftColor: brand, color: brand } : {}),
                }}
              >
                {cat}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main style={s.main}>
        {categories.length === 0 ? (
          <div style={s.empty}>
            <p style={s.emptyText}>No products available yet.</p>
          </div>
        ) : (
          categories.map(cat => (
            <section
              key={cat}
              ref={el => sectionRefs.current[cat] = el}
              style={s.section}
            >
              <h2 style={{ ...s.sectionTitle, color: brand }}>{cat}</h2>
              <div style={s.productGrid}>
                {productsByCategory[cat]?.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    brand={brand}
                    onAdd={() => handleAdd(product)}
                    justAdded={addedId === product.id}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function ProductCard({ product, brand, onAdd, justAdded }) {
  const [hovered, setHovered] = useState(false);

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
      <Link to={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
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
      </Link>
      <div style={s.cardActions}>
        <button
          onClick={(e) => { e.preventDefault(); onAdd(); }}
          style={{
            ...s.addBtn,
            background: justAdded ? '#4caf50' : brand,
          }}
        >
          {justAdded ? '✓ Added' : 'Add to Cart'}
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
    width: 220,
    flexShrink: 0,
    background: 'var(--kiosk-surface)',
    borderRight: '1px solid var(--kiosk-border)',
    position: 'sticky',
    top: 72,
    height: 'calc(100vh - 72px)',
    overflowY: 'auto',
  },
  sidebarInner: {
    padding: '32px 0',
  },
  sidebarTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--kiosk-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '0 24px',
    marginBottom: 20,
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarLink: {
    display: 'block',
    padding: '14px 24px',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: 'var(--kiosk-text-secondary)',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderLeft: '4px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  sidebarLinkActive: {
    background: 'var(--kiosk-elevated)',
    fontWeight: 600,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
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
