import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../CartContext';
import * as api from '../api';

export default function PageRenderer({ blocks, settings }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 24px', color: 'var(--kiosk-text-secondary)' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>This page is empty</p>
      </div>
    );
  }

  return (
    <div>
      {blocks.map((block, i) => (
        <AnimatedBlock key={block.id || i} index={i}>
          <RenderBlock block={block} settings={settings} />
        </AnimatedBlock>
      ))}
    </div>
  );
}

function AnimatedBlock({ children, index }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.6s ease ${index * 0.05}s, transform 0.6s ease ${index * 0.05}s`,
      }}
    >
      {children}
    </div>
  );
}

function RenderBlock({ block, settings }) {
  const { type, props } = block;
  const p = props || {};
  const brand = settings?.primary_color || '#C2185B';

  switch (type) {
    case 'hero': return <HeroBlock p={p} brand={brand} />;
    case 'product_grid': return <ProductGridBlock p={p} brand={brand} />;
    case 'category_shop': return <CategoryShopBlock p={p} brand={brand} />;
    case 'text': return <TextBlock p={p} />;
    case 'banner': return <BannerBlock p={p} />;
    case 'image': return <ImageBlock p={p} />;
    case 'spacer': return <div style={{ height: p.height || 60 }} />;
    case 'divider': return <DividerBlock p={p} />;
    case 'testimonial': return <TestimonialBlock p={p} brand={brand} />;
    case 'two_column': return <TwoColumnBlock p={p} />;
    case 'category_grid': return <CategoryGridBlock p={p} brand={brand} />;
    default: return null;
  }
}

// ─── Hero Block ────────────────────────────────────────────────────────────

function HeroBlock({ p, brand }) {
  const navigate = useNavigate();

  return (
    <section style={{
      position: 'relative',
      background: p.bg_image
        ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url(${p.bg_image}) center/cover`
        : (p.bg_color || '#0d0d0d'),
      padding: '120px 40px 100px',
      textAlign: 'center',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto' }}>
        {p.badge && (
          <div style={{
            display: 'inline-block',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: brand,
            marginBottom: 20,
            padding: '6px 16px',
            border: `1px solid ${brand}`,
            borderRadius: 20,
          }}>
            {p.badge}
          </div>
        )}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          fontWeight: 400,
          color: 'var(--kiosk-text)',
          marginBottom: 20,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}>
          {p.title}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--kiosk-text-secondary)',
          lineHeight: 1.7,
          maxWidth: 520,
          margin: '0 auto 36px',
        }}>
          {p.subtitle}
        </p>
        {p.cta && (
          <button
            onClick={() => navigate('/shop')}
            style={{
              display: 'inline-block',
              padding: '16px 44px',
              background: brand,
              color: '#fff',
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
            {p.cta}
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Product Grid Block ────────────────────────────────────────────────────

function ProductGridBlock({ p, brand }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState(null);
  const { addItem } = useCart();

  useEffect(() => {
    const cat = p.category === 'all' ? undefined : p.category;
    api.getProducts(cat)
      .then(data => {
        setProducts(p.limit ? data.slice(0, p.limit) : data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [p.category, p.limit]);

  const handleAdd = (product) => {
    addItem({ id: product.id, name: product.name, price: product.price, image: product.image });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  if (loading) {
    return (
      <section style={{ padding: '80px 40px', textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--kiosk-elevated)', borderTopColor: brand, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      </section>
    );
  }

  return (
    <section data-products style={{ padding: '80px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {p.title && (
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 400,
          color: 'var(--kiosk-text)',
          textAlign: 'center',
          marginBottom: 48,
          letterSpacing: '-0.01em',
        }}>
          {p.title}
        </h2>
      )}
      {products.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--kiosk-text-secondary)' }}>No products found.</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${p.columns || 3}, 1fr)`,
          gap: 24,
        }}>
          {products.map(product => (
            <ProductCard key={product.id} product={product} brand={brand} onAdd={() => handleAdd(product)} justAdded={addedId === product.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({ product, brand, onAdd, justAdded }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: 'var(--kiosk-card)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease',
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered ? `0 20px 40px rgba(0,0,0,0.3), 0 0 40px ${brand}15` : '0 2px 8px rgba(0,0,0,0.1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
        <div style={{
          aspectRatio: '3/4',
          background: 'var(--kiosk-elevated)',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
        }}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.5s ease',
                transform: hovered ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--kiosk-text-secondary)',
              fontFamily: 'var(--font-display)',
              fontSize: '3rem',
            }}>
              ◇
            </div>
          )}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '40%',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
            pointerEvents: 'none',
          }} />
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.05rem',
            fontWeight: 500,
            color: 'var(--kiosk-text)',
            marginBottom: 6,
          }}>
            {product.name}
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.15rem',
              fontWeight: 600,
              color: brand,
            }}>
              ${product.price.toFixed(2)}
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'var(--kiosk-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {product.category}
            </span>
          </div>
        </div>
      </Link>
      <div style={{ padding: '14px 20px 20px' }}>
        <button
          onClick={(e) => { e.preventDefault(); onAdd(); }}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: justAdded ? '#4caf50' : brand,
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s, transform 0.1s',
            minHeight: 44,
          }}
        >
          {justAdded ? '✓ Added to Cart' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}

// ─── Category Shop Block ───────────────────────────────────────────────────

function CategoryShopBlock({ p, brand }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState(null);
  const { addItem } = useCart();
  const sectionRefs = useRef({});
  const isScrolling = useRef(false);

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

  useEffect(() => {
    const handleScroll = () => {
      if (isScrolling.current) return;
      const scrollPos = window.scrollY + 150;
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
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
    setTimeout(() => { isScrolling.current = false; }, 800);
  };

  const handleAdd = (product) => {
    addItem({ id: product.id, name: product.name, price: product.price, image: product.image });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  const productsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = products.filter(prod => prod.category === cat);
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--kiosk-elevated)', borderTopColor: brand, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const showSidebar = p.show_sidebar !== false;

  return (
    <div style={{ display: 'flex', minHeight: 400 }}>
      {showSidebar && (
        <aside style={categoryShopStyles.sidebar}>
          <div style={categoryShopStyles.sidebarInner}>
            <h3 style={categoryShopStyles.sidebarTitle}>Categories</h3>
            <nav style={categoryShopStyles.sidebarNav}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => scrollToCategory(cat)}
                  style={{
                    ...categoryShopStyles.sidebarLink,
                    ...(activeCategory === cat ? { ...categoryShopStyles.sidebarLinkActive, borderLeftColor: brand, color: brand } : {}),
                  }}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      )}
      <main style={{ flex: 1, padding: showSidebar ? '40px 48px 80px' : '40px 40px 80px', maxWidth: showSidebar ? 'none' : 1200, margin: showSidebar ? 0 : '0 auto' }}>
        {p.title && (
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 500, color: 'var(--kiosk-text)', textAlign: showSidebar ? 'left' : 'center', marginBottom: 40 }}>
            {p.title}
          </h2>
        )}
        {categories.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--kiosk-text-secondary)', padding: 40 }}>No products available yet.</p>
        ) : (
          categories.map(cat => (
            <section key={cat} ref={el => sectionRefs.current[cat] = el} style={{ marginBottom: 64 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 500, color: brand, marginBottom: 28, paddingBottom: 14, borderBottom: '1px solid var(--kiosk-border)' }}>
                {cat}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
                {productsByCategory[cat]?.map(product => (
                  <ShopProductCard key={product.id} product={product} brand={brand} onAdd={() => handleAdd(product)} justAdded={addedId === product.id} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function ShopProductCard({ product, brand, onAdd, justAdded }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: 'var(--kiosk-card)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'transform 0.35s ease, box-shadow 0.35s ease',
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered ? `0 20px 40px rgba(0,0,0,0.3), 0 0 40px ${brand}15` : '0 2px 8px rgba(0,0,0,0.1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} style={{ textDecoration: 'none' }}>
        <div style={{ aspectRatio: '1/1', background: 'var(--kiosk-elevated)', overflow: 'hidden' }}>
          {product.image ? (
            <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s ease', transform: hovered ? 'scale(1.05)' : 'scale(1)' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--kiosk-text-secondary)', fontFamily: 'var(--font-display)', fontSize: '2.5rem' }}>◇</div>
          )}
        </div>
        <div style={{ padding: '14px 16px 6px' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 500, color: 'var(--kiosk-text)', marginBottom: 4 }}>{product.name}</h4>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600, color: brand }}>${product.price.toFixed(2)}</span>
        </div>
      </Link>
      <div style={{ padding: '8px 16px 16px' }}>
        <button
          onClick={e => { e.preventDefault(); onAdd(); }}
          style={{ width: '100%', padding: '10px 14px', background: justAdded ? '#4caf50' : brand, color: '#fff', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', minHeight: 40 }}
        >
          {justAdded ? '✓ Added' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}

const categoryShopStyles = {
  sidebar: { width: 200, flexShrink: 0, background: 'var(--kiosk-surface)', borderRight: '1px solid var(--kiosk-border)', position: 'sticky', top: 72, height: 'calc(100vh - 72px)', overflowY: 'auto' },
  sidebarInner: { padding: '32px 0' },
  sidebarTitle: { fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--kiosk-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 20px', marginBottom: 16 },
  sidebarNav: { display: 'flex', flexDirection: 'column' },
  sidebarLink: { display: 'block', padding: '12px 20px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--kiosk-text-secondary)', textAlign: 'left', background: 'transparent', border: 'none', borderLeft: '3px solid transparent', cursor: 'pointer', transition: 'all 0.2s' },
  sidebarLinkActive: { background: 'var(--kiosk-elevated)', fontWeight: 600 },
};

// ─── Text Block ────────────────────────────────────────────────────────────

function TextBlock({ p }) {
  return (
    <section style={{
      padding: '64px 40px',
      maxWidth: 800,
      margin: '0 auto',
      textAlign: p.align || 'left',
    }}>
      {p.title && (
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 400,
          color: 'var(--kiosk-text)',
          marginBottom: 16,
        }}>
          {p.title}
        </h2>
      )}
      {p.body && (
        <p style={{
          color: 'var(--kiosk-text-secondary)',
          lineHeight: 1.8,
          fontSize: '1rem',
        }}>
          {p.body}
        </p>
      )}
    </section>
  );
}

// ─── Banner Block ──────────────────────────────────────────────────────────

function BannerBlock({ p }) {
  return (
    <div style={{
      background: p.bg_color || '#C2185B',
      color: p.text_color || '#ffffff',
      textAlign: 'center',
      padding: '14px 24px',
      fontSize: '0.85rem',
      fontWeight: 500,
      letterSpacing: '0.06em',
    }}>
      {p.text}
    </div>
  );
}

// ─── Image Block ───────────────────────────────────────────────────────────

function ImageBlock({ p }) {
  const isFull = p.width === 'full';
  return (
    <figure style={{
      padding: isFull ? 0 : '48px 40px',
      maxWidth: isFull ? '100%' : 900,
      margin: '0 auto',
      textAlign: 'center',
    }}>
      {p.src ? (
        <img
          src={p.src}
          alt={p.alt || ''}
          style={{
            width: '100%',
            borderRadius: isFull ? 0 : 'var(--radius-lg)',
            display: 'block',
          }}
        />
      ) : (
        <div style={{
          height: 300,
          background: 'var(--kiosk-card)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--kiosk-text-secondary)',
        }}>
          No image set
        </div>
      )}
      {p.caption && (
        <figcaption style={{
          marginTop: 16,
          fontSize: '0.85rem',
          color: 'var(--kiosk-text-secondary)',
          fontStyle: 'italic',
        }}>
          {p.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Divider Block ─────────────────────────────────────────────────────────

function DividerBlock({ p }) {
  return (
    <div style={{ padding: '16px 40px', maxWidth: 1200, margin: '0 auto' }}>
      <hr style={{
        border: 'none',
        height: p.thickness || 1,
        background: p.color || 'var(--kiosk-border)',
      }} />
    </div>
  );
}

// ─── Testimonial Block ─────────────────────────────────────────────────────

function TestimonialBlock({ p, brand }) {
  return (
    <section style={{
      padding: '80px 40px',
      maxWidth: 700,
      margin: '0 auto',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '3rem', color: brand, marginBottom: 20, fontFamily: 'var(--font-display)' }}>"</div>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.5rem',
        fontWeight: 400,
        fontStyle: 'italic',
        color: 'var(--kiosk-text)',
        lineHeight: 1.5,
        marginBottom: 28,
      }}>
        {p.quote}
      </p>
      <div>
        <p style={{ fontWeight: 600, color: 'var(--kiosk-text)', fontSize: '0.95rem' }}>{p.author}</p>
        <p style={{ color: 'var(--kiosk-text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>{p.role}</p>
      </div>
    </section>
  );
}

// ─── Two Column Block ──────────────────────────────────────────────────────

function TwoColumnBlock({ p }) {
  return (
    <section style={{
      display: 'flex',
      gap: 48,
      padding: '64px 40px',
      maxWidth: 1100,
      margin: '0 auto',
    }}>
      <div style={{ flex: 1 }}>
        {p.left?.props?.title && (
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--kiosk-text)', marginBottom: 12 }}>
            {p.left.props.title}
          </h3>
        )}
        {p.left?.props?.body && (
          <p style={{ color: 'var(--kiosk-text-secondary)', lineHeight: 1.7 }}>{p.left.props.body}</p>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {p.right?.props?.title && (
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--kiosk-text)', marginBottom: 12 }}>
            {p.right.props.title}
          </h3>
        )}
        {p.right?.props?.body && (
          <p style={{ color: 'var(--kiosk-text-secondary)', lineHeight: 1.7 }}>{p.right.props.body}</p>
        )}
      </div>
    </section>
  );
}

// ─── Category Grid Block ──────────────────────────────────────────────────

function CategoryGridBlock({ p, brand }) {
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  return (
    <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
      {p.title && (
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 400,
          color: 'var(--kiosk-text)',
          textAlign: 'center',
          marginBottom: 48,
        }}>
          {p.title}
        </h2>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min((p.categories || []).length, 4)}, 1fr)`,
        gap: 20,
      }}>
        {(p.categories || []).map((cat, i) => (
          <a
            key={i}
            href={cat.link || '#'}
            style={{
              background: 'var(--kiosk-card)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              textDecoration: 'none',
              transition: 'transform 0.3s ease, box-shadow 0.3s ease',
              transform: hoveredIndex === i ? 'translateY(-4px)' : 'none',
              boxShadow: hoveredIndex === i ? `0 12px 30px rgba(0,0,0,0.3)` : 'none',
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(-1)}
          >
            {cat.image ? (
              <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{
                aspectRatio: '4/3',
                background: 'var(--kiosk-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                color: brand,
              }}>
                ◇
              </div>
            )}
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 500,
                color: 'var(--kiosk-text)',
              }}>
                {cat.name}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
