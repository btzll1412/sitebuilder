import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

const BLOCK_TYPES = [
  { type: 'hero', label: 'Hero Banner', icon: '▮', desc: 'Full-width banner with title, subtitle, CTA' },
  { type: 'product_grid', label: 'Product Grid', icon: '▦', desc: 'Grid of product cards from your store' },
  { type: 'category_shop', label: 'Category Shop', icon: '◫', desc: 'Full shop with category sidebar navigation' },
  { type: 'text', label: 'Text Block', icon: '¶', desc: 'Heading and body copy' },
  { type: 'banner', label: 'Promo Banner', icon: '▬', desc: 'Single-line promotional strip' },
  { type: 'image', label: 'Image', icon: '◻', desc: 'Full-width or contained image' },
  { type: 'spacer', label: 'Spacer', icon: '↕', desc: 'Vertical whitespace' },
  { type: 'divider', label: 'Divider', icon: '—', desc: 'Horizontal rule' },
  { type: 'testimonial', label: 'Testimonial', icon: '❝', desc: 'Pull quote with attribution' },
  { type: 'two_column', label: 'Two Column', icon: '▥', desc: 'Two side-by-side content areas' },
  { type: 'category_grid', label: 'Category Grid', icon: '▤', desc: 'Visual grid of category links' },
];

function uid() {
  return 'block_' + Math.random().toString(36).substr(2, 9);
}

function defaultProps(type) {
  switch (type) {
    case 'hero': return { title: 'Your Heading', subtitle: 'A compelling subtitle goes here.', cta: 'Shop Now', badge: '', bg_color: '#0d0d0d', bg_image: '' };
    case 'product_grid': return { title: 'Products', category: 'all', limit: 6, columns: 3 };
    case 'category_shop': return { title: 'Shop Our Collection', show_sidebar: true };
    case 'text': return { title: 'Section Title', body: 'Your content here...', align: 'left' };
    case 'banner': return { text: 'Free shipping on orders over $50', bg_color: '#C2185B', text_color: '#ffffff' };
    case 'image': return { src: '', alt: '', caption: '', width: 'contained' };
    case 'spacer': return { height: 60 };
    case 'divider': return { color: '#2a2a2a', thickness: 1 };
    case 'testimonial': return { quote: 'This product changed my life!', author: 'Jane Smith', role: 'Loyal Customer' };
    case 'two_column': return { left: { type: 'text', props: { title: 'Left', body: 'Content...', align: 'left' } }, right: { type: 'text', props: { title: 'Right', body: 'Content...', align: 'left' } } };
    case 'category_grid': return { title: 'Shop by Category', categories: [{ name: 'Category 1', image: '', link: '' }] };
    default: return {};
  }
}

export default function PageBuilder() {
  const [pages, setPages] = useState([]);
  const [activePage, setActivePage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);
  const [showPalette, setShowPalette] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPageSlug, setNewPageSlug] = useState('');
  const [newPageTitle, setNewPageTitle] = useState('');
  const [showNewPage, setShowNewPage] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const toast = useToast();

  const loadPages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPages();
      setPages(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPages(); }, [loadPages]);

  const loadPage = async (slug) => {
    try {
      const data = await api.getPage(slug);
      setActivePage(data);
      setBlocks(data.layout || []);
      setActiveBlock(null);
      setPreview(false);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const savePage = async () => {
    if (!activePage) return;
    setSaving(true);
    try {
      await api.updatePage(activePage.id, {
        title: activePage.title,
        layout: blocks,
        published: activePage.published,
      });
      toast.success('Page saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createPage = async () => {
    if (!newPageSlug.trim() || !newPageTitle.trim()) {
      toast.error('Slug and title are required');
      return;
    }
    try {
      await api.createPage(newPageSlug.trim().toLowerCase(), newPageTitle.trim());
      toast.success('Page created');
      setShowNewPage(false);
      setNewPageSlug('');
      setNewPageTitle('');
      loadPages();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deletePage = async (id) => {
    if (!window.confirm('Delete this page?')) return;
    try {
      await api.deletePage(id);
      if (activePage?.id === id) {
        setActivePage(null);
        setBlocks([]);
      }
      toast.success('Page deleted');
      loadPages();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const togglePublish = async (page) => {
    try {
      await api.updatePage(page.id, { published: page.published ? 0 : 1 });
      loadPages();
      if (activePage?.id === page.id) {
        setActivePage(prev => ({ ...prev, published: prev.published ? 0 : 1 }));
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addBlock = (type) => {
    const block = { id: uid(), type, props: defaultProps(type) };
    setBlocks(prev => [...prev, block]);
    setActiveBlock(block.id);
    setShowPalette(false);
  };

  const moveBlock = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const deleteBlock = (id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (activeBlock === id) setActiveBlock(null);
  };

  const updateBlockProps = (id, newProps) => {
    setBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, props: { ...b.props, ...newProps } } : b
    ));
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newBlocks = [...blocks];
    const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
    newBlocks.splice(dropIndex, 0, draggedBlock);
    setBlocks(newBlocks);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // ─── Page List View ─────────────────────────────────────────────────────

  if (!activePage) {
    return (
      <div>
        <div style={s.header}>
          <div>
            <h2 style={s.title}>Pages</h2>
            <p style={s.subtitle}>Manage your site pages and layouts</p>
          </div>
          <button onClick={() => setShowNewPage(true)} style={s.addBtn}>+ New Page</button>
        </div>

        {showNewPage && (
          <div style={s.newPageCard}>
            <div style={s.newPageRow}>
              <div style={s.field}>
                <label style={s.label}>Title</label>
                <input
                  value={newPageTitle}
                  onChange={e => setNewPageTitle(e.target.value)}
                  style={s.input}
                  placeholder="About Us"
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>Slug</label>
                <input
                  value={newPageSlug}
                  onChange={e => setNewPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={s.input}
                  placeholder="about-us"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                <button onClick={createPage} style={s.saveBtn}>Create</button>
                <button onClick={() => setShowNewPage(false)} style={s.cancelBtn}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={s.loading}><div style={s.spinner} /></div>
        ) : pages.length === 0 ? (
          <div style={s.empty}>
            <p style={s.emptyTitle}>No pages yet</p>
            <p style={s.emptyText}>Create your first page to start building.</p>
          </div>
        ) : (
          <div style={s.pageList}>
            {pages.map(page => (
              <div key={page.id} style={s.pageCard}>
                <div style={s.pageInfo}>
                  <h3 style={s.pageName}>{page.title}</h3>
                  <span style={s.pageSlug}>/{page.slug}</span>
                  {page.is_home ? (
                    <span style={s.homeBadge}>Home</span>
                  ) : null}
                </div>
                <div style={s.pageActions}>
                  <span style={{
                    ...s.statusDot,
                    background: page.published ? '#4caf50' : '#9b9590',
                  }} />
                  <button onClick={() => togglePublish(page)} style={s.textBtn}>
                    {page.published ? 'Published' : 'Draft'}
                  </button>
                  <button onClick={() => loadPage(page.slug)} style={s.editPageBtn}>Edit</button>
                  {!page.is_home && (
                    <button onClick={() => deletePage(page.id)} style={s.deletePageBtn}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Page Editor View ───────────────────────────────────────────────────

  return (
    <div>
      <div style={s.editorHeader}>
        <div style={s.editorNav}>
          <button onClick={() => { setActivePage(null); loadPages(); }} style={s.backBtn}>← Pages</button>
          <h2 style={s.editorTitle}>{activePage.title}</h2>
          <span style={s.editorSlug}>/{activePage.slug}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setPreview(!preview)}
            style={{ ...s.previewBtn, ...(preview ? s.previewBtnActive : {}) }}
          >
            {preview ? '◧ Split View' : '◉ Full Preview'}
          </button>
          <button
            onClick={savePage}
            disabled={saving}
            style={{ ...s.saveBtn, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Page'}
          </button>
        </div>
      </div>

      {preview ? (
        /* Full Preview Mode */
        <div style={s.previewContainer}>
          <div style={s.previewFrame}>
            {blocks.length === 0 ? (
              <div style={{ ...s.empty, background: '#0d0d0d', color: '#a89f96' }}>
                <p>This page is empty</p>
              </div>
            ) : (
              blocks.map(block => (
                <BlockPreview key={block.id} block={block} />
              ))
            )}
          </div>
        </div>
      ) : (
        /* Split View - Editor + Live Preview */
        <div style={s.splitContainer}>
          {/* Left: Editor */}
          <div style={s.editorPane}>
            <div style={s.canvas}>
              {blocks.map((block, index) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={e => handleDragStart(e, index)}
                  onDragOver={e => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    ...s.blockItem,
                    ...(activeBlock === block.id ? s.blockItemActive : {}),
                    ...(draggedIndex === index ? s.blockDragging : {}),
                    ...(dragOverIndex === index && draggedIndex !== index ? s.blockDragOver : {}),
                  }}
                >
                  <div style={s.blockHeader} onClick={() => setActiveBlock(activeBlock === block.id ? null : block.id)}>
                    <div style={s.blockLabel}>
                      <span style={s.dragHandle}>⋮⋮</span>
                      <span style={s.blockIcon}>{BLOCK_TYPES.find(t => t.type === block.type)?.icon || '?'}</span>
                      <span style={s.blockType}>{BLOCK_TYPES.find(t => t.type === block.type)?.label || block.type}</span>
                    </div>
                    <div style={s.blockActions}>
                      <button onClick={e => { e.stopPropagation(); moveBlock(index, -1); }} disabled={index === 0} style={{ ...s.blockBtn, opacity: index === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={e => { e.stopPropagation(); moveBlock(index, 1); }} disabled={index === blocks.length - 1} style={{ ...s.blockBtn, opacity: index === blocks.length - 1 ? 0.3 : 1 }}>↓</button>
                      <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }} style={{ ...s.blockBtn, color: '#e57373' }}>✕</button>
                    </div>
                  </div>

                  {activeBlock === block.id && (
                    <div style={s.blockEditor}>
                      <BlockEditor
                        block={block}
                        onUpdate={(props) => updateBlockProps(block.id, props)}
                      />
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => setShowPalette(!showPalette)}
                style={s.addBlockBtn}
              >
                + Add Block
              </button>

              {showPalette && (
                <div style={s.palette}>
                  {BLOCK_TYPES.map(bt => (
                    <button key={bt.type} onClick={() => addBlock(bt.type)} style={s.paletteItem}>
                      <span style={s.paletteIcon}>{bt.icon}</span>
                      <div>
                        <div style={s.paletteName}>{bt.label}</div>
                        <div style={s.paletteDesc}>{bt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Live Preview */}
          <div style={s.previewPane}>
            <div style={s.previewPaneHeader}>Live Preview</div>
            <div style={s.previewPaneContent}>
              {blocks.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#a89f96' }}>
                  <p>Add blocks to see preview</p>
                </div>
              ) : (
                blocks.map(block => (
                  <BlockPreview key={block.id} block={block} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Block Editor ─────────────────────────────────────────────────────────

function BlockEditor({ block, onUpdate }) {
  const { type, props } = block;

  const field = (label, key, inputType = 'text', options = null) => (
    <div style={s.editorField} key={key}>
      <label style={s.editorLabel}>{label}</label>
      {inputType === 'textarea' ? (
        <textarea
          value={props[key] || ''}
          onChange={e => onUpdate({ [key]: e.target.value })}
          style={{ ...s.editorInput, minHeight: 80, resize: 'vertical' }}
        />
      ) : inputType === 'select' ? (
        <select
          value={props[key] || ''}
          onChange={e => onUpdate({ [key]: e.target.value })}
          style={s.editorInput}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : inputType === 'number' ? (
        <input
          type="number"
          value={props[key] ?? ''}
          onChange={e => onUpdate({ [key]: parseInt(e.target.value) || 0 })}
          style={s.editorInput}
        />
      ) : inputType === 'color' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="color"
            value={props[key] || '#000000'}
            onChange={e => onUpdate({ [key]: e.target.value })}
            style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 4 }}
          />
          <input
            type="text"
            value={props[key] || ''}
            onChange={e => onUpdate({ [key]: e.target.value })}
            style={{ ...s.editorInput, flex: 1 }}
          />
        </div>
      ) : (
        <input
          type="text"
          value={props[key] || ''}
          onChange={e => onUpdate({ [key]: e.target.value })}
          style={s.editorInput}
        />
      )}
    </div>
  );

  switch (type) {
    case 'hero':
      return (<>
        {field('Title', 'title')}
        {field('Subtitle', 'subtitle', 'textarea')}
        {field('CTA Button Text', 'cta')}
        {field('Badge Text', 'badge')}
        {field('Background Color', 'bg_color', 'color')}
        {field('Background Image URL', 'bg_image')}
      </>);
    case 'product_grid':
      return (<>
        {field('Title', 'title')}
        {field('Category', 'category', 'select', [
          { value: 'all', label: 'All Categories' },
          { value: 'Lips', label: 'Lips' },
          { value: 'Eyes', label: 'Eyes' },
          { value: 'Face', label: 'Face' },
        ])}
        {field('Limit', 'limit', 'number')}
        {field('Columns', 'columns', 'select', [
          { value: 2, label: '2 Columns' },
          { value: 3, label: '3 Columns' },
          { value: 4, label: '4 Columns' },
        ])}
      </>);
    case 'category_shop':
      return (<>
        {field('Title', 'title')}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Show Category Sidebar</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={props.show_sidebar !== false}
              onChange={e => onUpdate({ show_sidebar: e.target.checked })}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: '0.88rem', color: 'var(--admin-text)' }}>Enable sidebar navigation</span>
          </label>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-hint)', marginTop: 8 }}>
          This block displays all products grouped by category with a sticky sidebar for navigation.
        </p>
      </>);
    case 'text':
      return (<>
        {field('Title', 'title')}
        {field('Body', 'body', 'textarea')}
        {field('Alignment', 'align', 'select', [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ])}
      </>);
    case 'banner':
      return (<>
        {field('Text', 'text')}
        {field('Background Color', 'bg_color', 'color')}
        {field('Text Color', 'text_color', 'color')}
      </>);
    case 'image':
      return (<>
        {field('Image URL', 'src')}
        {field('Alt Text', 'alt')}
        {field('Caption', 'caption')}
        {field('Width', 'width', 'select', [
          { value: 'contained', label: 'Contained' },
          { value: 'full', label: 'Full Width' },
        ])}
      </>);
    case 'spacer':
      return field('Height (px)', 'height', 'number');
    case 'divider':
      return (<>
        {field('Color', 'color', 'color')}
        {field('Thickness (px)', 'thickness', 'number')}
      </>);
    case 'testimonial':
      return (<>
        {field('Quote', 'quote', 'textarea')}
        {field('Author', 'author')}
        {field('Role', 'role')}
      </>);
    case 'two_column':
      return (
        <div style={{ fontSize: '0.85rem', color: 'var(--admin-text-secondary)', padding: 8 }}>
          <p>Two-column layout. Each side contains a text block by default.</p>
          <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={s.editorLabel}>Left Title</label>
              <input
                value={props.left?.props?.title || ''}
                onChange={e => onUpdate({ left: { ...props.left, props: { ...props.left?.props, title: e.target.value } } })}
                style={s.editorInput}
              />
              <label style={{ ...s.editorLabel, marginTop: 8 }}>Left Body</label>
              <textarea
                value={props.left?.props?.body || ''}
                onChange={e => onUpdate({ left: { ...props.left, props: { ...props.left?.props, body: e.target.value } } })}
                style={{ ...s.editorInput, minHeight: 60 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.editorLabel}>Right Title</label>
              <input
                value={props.right?.props?.title || ''}
                onChange={e => onUpdate({ right: { ...props.right, props: { ...props.right?.props, title: e.target.value } } })}
                style={s.editorInput}
              />
              <label style={{ ...s.editorLabel, marginTop: 8 }}>Right Body</label>
              <textarea
                value={props.right?.props?.body || ''}
                onChange={e => onUpdate({ right: { ...props.right, props: { ...props.right?.props, body: e.target.value } } })}
                style={{ ...s.editorInput, minHeight: 60 }}
              />
            </div>
          </div>
        </div>
      );
    case 'category_grid':
      return (<>
        {field('Title', 'title')}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Categories</label>
          {(props.categories || []).map((cat, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                value={cat.name}
                onChange={e => {
                  const cats = [...(props.categories || [])];
                  cats[idx] = { ...cats[idx], name: e.target.value };
                  onUpdate({ categories: cats });
                }}
                placeholder="Name"
                style={{ ...s.editorInput, flex: 1 }}
              />
              <input
                value={cat.image || ''}
                onChange={e => {
                  const cats = [...(props.categories || [])];
                  cats[idx] = { ...cats[idx], image: e.target.value };
                  onUpdate({ categories: cats });
                }}
                placeholder="Image URL"
                style={{ ...s.editorInput, flex: 1 }}
              />
              <input
                value={cat.link || ''}
                onChange={e => {
                  const cats = [...(props.categories || [])];
                  cats[idx] = { ...cats[idx], link: e.target.value };
                  onUpdate({ categories: cats });
                }}
                placeholder="Link"
                style={{ ...s.editorInput, flex: 1 }}
              />
              <button
                onClick={() => {
                  const cats = (props.categories || []).filter((_, i) => i !== idx);
                  onUpdate({ categories: cats });
                }}
                style={{ ...s.blockBtn, color: '#e57373' }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => onUpdate({ categories: [...(props.categories || []), { name: '', image: '', link: '' }] })}
            style={{ ...s.textBtn, fontSize: '0.8rem', color: 'var(--brand)' }}
          >
            + Add Category
          </button>
        </div>
      </>);
    default:
      return <p style={{ color: 'var(--admin-text-hint)', fontSize: '0.85rem' }}>No editor for this block type.</p>;
  }
}

// ─── Block Preview (simplified) ───────────────────────────────────────────

function BlockPreview({ block }) {
  const { type, props } = block;
  const p = props || {};

  switch (type) {
    case 'hero':
      return (
        <div style={{
          background: p.bg_image ? `url(${p.bg_image}) center/cover` : (p.bg_color || '#0d0d0d'),
          padding: '100px 40px',
          textAlign: 'center',
          color: '#f5f0eb',
        }}>
          {p.badge && <div style={{ fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16, color: '#C2185B' }}>{p.badge}</div>}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 500, marginBottom: 16 }}>{p.title}</h1>
          <p style={{ fontSize: '1.1rem', color: '#a89f96', maxWidth: 500, margin: '0 auto 28px' }}>{p.subtitle}</p>
          {p.cta && <span style={{ display: 'inline-block', padding: '14px 36px', background: '#C2185B', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem' }}>{p.cta}</span>}
        </div>
      );
    case 'product_grid':
      return (
        <div style={{ padding: '60px 40px', background: '#0d0d0d' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: '#f5f0eb', textAlign: 'center', marginBottom: 32 }}>{p.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${p.columns || 3}, 1fr)`, gap: 20 }}>
            {Array.from({ length: Math.min(p.limit || 3, 6) }).map((_, i) => (
              <div key={i} style={{ background: '#1c1c1c', borderRadius: 12, aspectRatio: '3/4', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ padding: 16, width: '100%' }}>
                  <div style={{ height: 10, background: '#252525', borderRadius: 4, marginBottom: 8, width: '70%' }} />
                  <div style={{ height: 8, background: '#252525', borderRadius: 4, width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'category_shop':
      return (
        <div style={{ display: 'flex', background: '#0d0d0d', minHeight: 300 }}>
          {p.show_sidebar !== false && (
            <div style={{ width: 180, background: '#141414', borderRight: '1px solid #252525', padding: '24px 0' }}>
              <div style={{ padding: '0 20px 16px', fontSize: '0.7rem', fontWeight: 600, color: '#a89f96', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Categories</div>
              {['Lips', 'Eyes', 'Face'].map((cat, i) => (
                <div key={cat} style={{ padding: '12px 20px', fontSize: '0.85rem', color: i === 0 ? '#C2185B' : '#a89f96', background: i === 0 ? '#1c1c1c' : 'transparent', borderLeft: i === 0 ? '3px solid #C2185B' : '3px solid transparent' }}>{cat}</div>
              ))}
            </div>
          )}
          <div style={{ flex: 1, padding: '40px 32px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#C2185B', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #252525' }}>{p.title || 'Category Name'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ background: '#1c1c1c', borderRadius: 10, aspectRatio: '1/1' }}>
                  <div style={{ padding: 12, marginTop: 'auto' }}>
                    <div style={{ height: 8, background: '#252525', borderRadius: 4, marginBottom: 6, width: '60%' }} />
                    <div style={{ height: 6, background: '#252525', borderRadius: 4, width: '35%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case 'text':
      return (
        <div style={{ padding: '48px 40px', background: '#0d0d0d', textAlign: p.align || 'left' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#f5f0eb', marginBottom: 12 }}>{p.title}</h2>
          <p style={{ color: '#a89f96', maxWidth: 700, lineHeight: 1.7, margin: p.align === 'center' ? '0 auto' : 0 }}>{p.body}</p>
        </div>
      );
    case 'banner':
      return (
        <div style={{ background: p.bg_color || '#C2185B', color: p.text_color || '#fff', textAlign: 'center', padding: '14px 24px', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.04em' }}>
          {p.text}
        </div>
      );
    case 'image':
      return (
        <div style={{ padding: p.width === 'full' ? 0 : '40px', background: '#0d0d0d', textAlign: 'center' }}>
          {p.src ? (
            <img src={p.src} alt={p.alt || ''} style={{ maxWidth: p.width === 'full' ? '100%' : 800, width: '100%', borderRadius: p.width === 'full' ? 0 : 12 }} />
          ) : (
            <div style={{ height: 200, background: '#1c1c1c', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a89f96' }}>Image placeholder</div>
          )}
          {p.caption && <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#a89f96' }}>{p.caption}</p>}
        </div>
      );
    case 'spacer':
      return <div style={{ height: p.height || 60, background: '#0d0d0d' }} />;
    case 'divider':
      return (
        <div style={{ padding: '0 40px', background: '#0d0d0d' }}>
          <hr style={{ border: 'none', height: p.thickness || 1, background: p.color || '#2a2a2a' }} />
        </div>
      );
    case 'testimonial':
      return (
        <div style={{ padding: '60px 40px', background: '#0d0d0d', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontStyle: 'italic', color: '#f5f0eb', maxWidth: 600, margin: '0 auto 20px' }}>"{p.quote}"</p>
          <p style={{ fontWeight: 600, color: '#f5f0eb', fontSize: '0.9rem' }}>{p.author}</p>
          <p style={{ color: '#a89f96', fontSize: '0.8rem' }}>{p.role}</p>
        </div>
      );
    case 'two_column':
      return (
        <div style={{ display: 'flex', gap: 24, padding: '48px 40px', background: '#0d0d0d' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#f5f0eb', marginBottom: 8 }}>{p.left?.props?.title}</h3>
            <p style={{ color: '#a89f96', fontSize: '0.9rem' }}>{p.left?.props?.body}</p>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', color: '#f5f0eb', marginBottom: 8 }}>{p.right?.props?.title}</h3>
            <p style={{ color: '#a89f96', fontSize: '0.9rem' }}>{p.right?.props?.body}</p>
          </div>
        </div>
      );
    case 'category_grid':
      return (
        <div style={{ padding: '60px 40px', background: '#0d0d0d' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: '#f5f0eb', textAlign: 'center', marginBottom: 32 }}>{p.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {(p.categories || []).map((cat, i) => (
              <div key={i} style={{ background: '#1c1c1c', borderRadius: 12, padding: 24, textAlign: 'center' }}>
                <div style={{ fontWeight: 500, color: '#f5f0eb' }}>{cat.name || 'Category'}</div>
              </div>
            ))}
          </div>
        </div>
      );
    default:
      return <div style={{ padding: 24, background: '#1c1c1c', color: '#a89f96' }}>Unknown block: {type}</div>;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--admin-text)', marginBottom: 4 },
  subtitle: { fontSize: '0.85rem', color: 'var(--admin-text-hint)' },
  addBtn: { padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', background: 'var(--brand)', borderRadius: 'var(--radius-md)', minHeight: 44 },
  loading: { display: 'flex', justifyContent: 'center', padding: 60 },
  spinner: { width: 32, height: 32, border: '3px solid var(--admin-border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  empty: { textAlign: 'center', padding: '80px 24px', background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--admin-text)', marginBottom: 8 },
  emptyText: { fontSize: '0.875rem', color: 'var(--admin-text-hint)' },
  newPageCard: { background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)', padding: '20px 24px', marginBottom: 20 },
  newPageRow: { display: 'flex', gap: 16, alignItems: 'flex-end' },
  field: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '10px 14px', fontSize: '0.88rem', border: '1.5px solid var(--admin-border)', borderRadius: 'var(--radius-md)', background: 'var(--admin-surface)', color: 'var(--admin-text)', outline: 'none' },
  saveBtn: { padding: '10px 20px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', background: 'var(--brand)', borderRadius: 'var(--radius-md)', minHeight: 40 },
  cancelBtn: { padding: '10px 20px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--admin-text-secondary)', background: 'var(--admin-surface)', borderRadius: 'var(--radius-md)', minHeight: 40 },
  pageList: { display: 'flex', flexDirection: 'column', gap: 8 },
  pageCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', background: 'var(--admin-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)' },
  pageInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  pageName: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--admin-text)' },
  pageSlug: { fontSize: '0.8rem', color: 'var(--admin-text-hint)' },
  homeBadge: { fontSize: '0.65rem', fontWeight: 600, color: 'var(--brand)', background: 'var(--brand-light)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  pageActions: { display: 'flex', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  textBtn: { fontSize: '0.8rem', fontWeight: 500, color: 'var(--admin-text-secondary)' },
  editPageBtn: { padding: '6px 16px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--brand)', background: 'var(--brand-light)', borderRadius: 'var(--radius-sm)', minHeight: 32 },
  deletePageBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e57373', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' },

  // Editor
  editorHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  editorNav: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: { fontSize: '0.85rem', fontWeight: 500, color: 'var(--admin-text-secondary)', padding: '8px 0', minHeight: 36 },
  editorTitle: { fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, color: 'var(--admin-text)' },
  editorSlug: { fontSize: '0.8rem', color: 'var(--admin-text-hint)' },
  previewBtn: { padding: '10px 20px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--admin-text-secondary)', background: 'var(--admin-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)', minHeight: 40 },
  previewBtnActive: { background: 'var(--brand-light)', color: 'var(--brand)', borderColor: 'var(--brand)' },

  // Preview
  previewContainer: { background: '#0d0d0d', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--admin-border)' },
  previewFrame: { maxWidth: 1024, margin: '0 auto' },

  // Split View
  splitContainer: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  editorPane: { flex: 1, minWidth: 0 },
  previewPane: { width: 400, flexShrink: 0, position: 'sticky', top: 20, background: '#0d0d0d', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--admin-border)', maxHeight: 'calc(100vh - 140px)' },
  previewPaneHeader: { padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a89f96', background: '#141414', borderBottom: '1px solid #252525' },
  previewPaneContent: { overflowY: 'auto', maxHeight: 'calc(100vh - 190px)' },

  // Canvas
  canvas: { display: 'flex', flexDirection: 'column', gap: 8 },
  blockItem: { background: 'var(--admin-card)', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--admin-border)', overflow: 'hidden', transition: 'border-color 0.15s, opacity 0.15s, transform 0.15s', cursor: 'grab' },
  blockItemActive: { borderColor: 'var(--brand)' },
  blockDragging: { opacity: 0.5, transform: 'scale(0.98)' },
  blockDragOver: { borderColor: 'var(--brand)', borderStyle: 'dashed', background: 'var(--brand-light)' },
  dragHandle: { color: 'var(--admin-text-hint)', fontSize: '0.9rem', cursor: 'grab', marginRight: 4, letterSpacing: '-2px' },
  blockHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', minHeight: 48 },
  blockLabel: { display: 'flex', alignItems: 'center', gap: 10 },
  blockIcon: { fontSize: '1rem', width: 24, textAlign: 'center', color: 'var(--admin-text-hint)' },
  blockType: { fontSize: '0.88rem', fontWeight: 500, color: 'var(--admin-text)' },
  blockActions: { display: 'flex', gap: 4 },
  blockBtn: { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', borderRadius: 'var(--radius-sm)', minWidth: 30 },
  blockEditor: { padding: '0 18px 18px', borderTop: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 },

  // Editor fields
  editorField: { display: 'flex', flexDirection: 'column', gap: 6 },
  editorLabel: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  editorInput: { padding: '10px 12px', fontSize: '0.88rem', border: '1.5px solid var(--admin-border)', borderRadius: 'var(--radius-sm)', background: 'var(--admin-surface)', color: 'var(--admin-text)', outline: 'none', width: '100%' },

  // Palette
  addBlockBtn: { padding: '16px', fontSize: '0.88rem', fontWeight: 500, color: 'var(--brand)', background: 'var(--brand-light)', border: '2px dashed var(--brand)', borderRadius: 'var(--radius-md)', textAlign: 'center', minHeight: 52 },
  palette: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8, background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)', padding: 16 },
  paletteItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', borderRadius: 'var(--radius-md)', border: '1px solid var(--admin-border)', transition: 'border-color 0.15s, background 0.15s', minHeight: 60 },
  paletteIcon: { fontSize: '1.25rem', width: 32, textAlign: 'center', color: 'var(--brand)', flexShrink: 0 },
  paletteName: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text)', marginBottom: 2 },
  paletteDesc: { fontSize: '0.72rem', color: 'var(--admin-text-hint)', lineHeight: 1.3 },
};
