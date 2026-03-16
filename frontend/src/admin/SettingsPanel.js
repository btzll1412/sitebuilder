import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../components/Toast';
import * as api from '../api';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Puerto_Rico', label: 'Atlantic Time (AT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

export default function SettingsPanel() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);
  const toast = useToast();

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAdminSettings();
      setSettings(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    const e = {};
    if (passwordForm.password.length < 6) e.password = 'At least 6 characters required';
    if (passwordForm.password !== passwordForm.confirm) e.confirm = 'Passwords do not match';
    setPasswordErrors(e);
    if (Object.keys(e).length > 0) return;

    setChangingPassword(true);
    try {
      await api.changePassword(passwordForm.password);
      toast.success('Password changed');
      setPasswordForm({ password: '', confirm: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await api.exportBackup();
      // Convert base64 to blob and download
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup exported successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.error('Please select a valid backup ZIP file');
      return;
    }

    const confirmed = window.confirm(
      'WARNING: This will replace ALL existing data including products, pages, orders, and settings. ' +
      'This action cannot be undone. Are you sure you want to continue?'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const result = await api.importBackup(file);
      toast.success(
        `Restored: ${result.restored.products} products, ${result.restored.pages} pages, ` +
        `${result.restored.orders} orders, ${result.restored.settings} settings`
      );
      // Reload settings to reflect restored data
      loadSettings();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={s.spinner} />
      </div>
    );
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Settings</h2>
          <p style={s.subtitle}>Configure your store</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...s.saveBtn, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div style={s.sections}>
        {/* Branding */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Branding</h3>
          <div style={s.grid}>
            <Field label="Store Name" value={settings.site_name || ''} onChange={v => update('site_name', v)} />
            <Field label="Logo Text" value={settings.logo_text || ''} onChange={v => update('logo_text', v)} />
          </div>
        </section>

        {/* Colors */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Colors</h3>
          <div style={s.grid}>
            <ColorField label="Primary Color" value={settings.primary_color || '#C2185B'} onChange={v => update('primary_color', v)} />
            <ColorField label="Accent Color" value={settings.accent_color || '#C2185B'} onChange={v => update('accent_color', v)} />
          </div>
          <div style={s.colorPreview}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: settings.primary_color || '#C2185B' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>
              Preview: This is how your brand color looks
            </span>
          </div>
        </section>

        {/* Background */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Background</h3>
          <div style={s.grid}>
            <ColorField label="Background Color" value={settings.bg_color || '#0d0d0d'} onChange={v => update('bg_color', v)} />
            <Field label="Background Image URL" value={settings.bg_image || ''} onChange={v => update('bg_image', v)} placeholder="https://... or /uploads/..." />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={s.label}>Or Upload Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  try {
                    const result = await api.uploadFile(file);
                    update('bg_image', result.url);
                  } catch (err) {
                    toast.error('Failed to upload image');
                  }
                }
              }}
              style={{ marginTop: 6 }}
            />
          </div>
          {(settings.bg_image || settings.bg_color) && (
            <div style={{ marginTop: 16 }}>
              <label style={s.label}>Preview</label>
              <div style={{
                marginTop: 8,
                width: '100%',
                height: 120,
                borderRadius: 8,
                background: settings.bg_image
                  ? `url(${settings.bg_image}) center/cover`
                  : (settings.bg_color || '#0d0d0d'),
                border: '1px solid var(--admin-border)',
              }} />
            </div>
          )}
        </section>

        {/* Tax & Timezone */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Tax & Localization</h3>
          <div style={s.grid}>
            <Field
              label="Tax Rate (%)"
              value={settings.tax_rate || '8.25'}
              onChange={v => update('tax_rate', v)}
              type="number"
            />
            <Field
              label="Low Stock Threshold"
              value={settings.low_stock_threshold || '5'}
              onChange={v => update('low_stock_threshold', v)}
              type="number"
              placeholder="5"
            />
            <SelectField
              label="Timezone"
              value={settings.timezone || 'America/New_York'}
              onChange={v => update('timezone', v)}
              options={TIMEZONES}
            />
          </div>
        </section>

        {/* Kiosk Settings */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Kiosk Settings</h3>
          <p style={s.sectionDesc}>
            Configure idle timeout for kiosk mode. Set to 0 to disable.
          </p>
          <div style={s.grid}>
            <Field
              label="Screen Timeout (seconds)"
              value={settings.screen_timeout || '120'}
              onChange={v => update('screen_timeout', v)}
              type="number"
              placeholder="120"
            />
            <Field
              label="Warning Duration (seconds)"
              value={settings.screen_timeout_warning || '30'}
              onChange={v => update('screen_timeout_warning', v)}
              type="number"
              placeholder="30"
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-hint)', marginTop: 8 }}>
            After the timeout, a "Still here?" message appears for the warning duration. If no response, cart is cleared and kiosk returns to home.
          </p>
        </section>

        {/* Payment */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Payment — USAePay</h3>
          <p style={s.sectionDesc}>
            Leave API key blank to use simulation mode. All transactions will be approved with a simulated reference number.
          </p>
          <div style={s.grid}>
            <Field label="API Key" value={settings.usaepay_key || ''} onChange={v => update('usaepay_key', v)} placeholder="Leave blank for simulation" />
            <Field label="PIN" value={settings.usaepay_pin || ''} onChange={v => update('usaepay_pin', v)} type="password" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={s.toggleLabel}>
              <span style={{
                ...s.toggle,
                background: settings.usaepay_sandbox === '1' ? 'var(--brand)' : 'var(--admin-border)',
              }}>
                <span style={{
                  ...s.toggleDot,
                  transform: settings.usaepay_sandbox === '1' ? 'translateX(18px)' : 'translateX(2px)',
                }} />
              </span>
              Sandbox Mode
            </label>
          </div>
          {!settings.usaepay_key && (
            <div style={s.simNotice}>
              Simulation mode is active. Payments will be auto-approved.
            </div>
          )}
        </section>

        {/* Change Password */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Change Password</h3>
          <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={s.field}>
              <label style={s.label}>New Password</label>
              <input
                type="password"
                value={passwordForm.password}
                onChange={e => { setPasswordForm(p => ({ ...p, password: e.target.value })); setPasswordErrors({}); }}
                style={{ ...s.input, ...(passwordErrors.password ? s.inputError : {}) }}
                placeholder="Min 6 characters"
              />
              {passwordErrors.password && <span style={s.errorText}>{passwordErrors.password}</span>}
            </div>
            <div style={s.field}>
              <label style={s.label}>Confirm Password</label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={e => { setPasswordForm(p => ({ ...p, confirm: e.target.value })); setPasswordErrors({}); }}
                style={{ ...s.input, ...(passwordErrors.confirm ? s.inputError : {}) }}
                placeholder="Repeat password"
              />
              {passwordErrors.confirm && <span style={s.errorText}>{passwordErrors.confirm}</span>}
            </div>
            <button
              onClick={handlePasswordChange}
              disabled={changingPassword}
              style={{ ...s.changePassBtn, opacity: changingPassword ? 0.7 : 1 }}
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </section>

        {/* Backup & Restore */}
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Backup & Restore</h3>
          <p style={s.sectionDesc}>
            Export a complete backup of your store including all products, pages, settings, orders, and uploaded images.
            Use restore to recover from a backup file.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ ...s.backupBtn, opacity: exporting ? 0.7 : 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? 'Exporting...' : 'Export Backup'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              style={{ ...s.restoreBtn, opacity: importing ? 0.7 : 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {importing ? 'Restoring...' : 'Restore from Backup'}
            </button>
          </div>
          <div style={s.backupWarning}>
            <strong>Note:</strong> Restoring a backup will replace all existing data. Your admin login credentials will be preserved.
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={s.input}
        placeholder={placeholder}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 44, height: 40, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...s.input, flex: 1 }}
        />
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={s.select}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

const s = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--admin-text)', marginBottom: 4 },
  subtitle: { fontSize: '0.85rem', color: 'var(--admin-text-hint)' },
  saveBtn: { padding: '12px 28px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', background: 'var(--brand)', borderRadius: 'var(--radius-md)', minHeight: 44, transition: 'opacity 0.15s' },
  spinner: { width: 32, height: 32, border: '3px solid var(--admin-border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  sections: { display: 'flex', flexDirection: 'column', gap: 8 },
  section: { background: 'var(--admin-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)', padding: '28px 32px' },
  sectionTitle: { fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--admin-text)', marginBottom: 18 },
  sectionDesc: { fontSize: '0.85rem', color: 'var(--admin-text-hint)', marginBottom: 18, lineHeight: 1.5 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { padding: '12px 14px', fontSize: '0.9rem', border: '1.5px solid var(--admin-border)', borderRadius: 'var(--radius-md)', background: 'var(--admin-surface)', color: 'var(--admin-text)', outline: 'none', width: '100%', transition: 'border-color 0.2s' },
  select: { padding: '12px 14px', fontSize: '0.9rem', border: '1.5px solid var(--admin-border)', borderRadius: 'var(--radius-md)', background: 'var(--admin-surface)', color: 'var(--admin-text)', outline: 'none', width: '100%', cursor: 'pointer' },
  inputError: { borderColor: '#C2185B', boxShadow: '0 0 0 3px rgba(194, 24, 91, 0.1)' },
  errorText: { fontSize: '0.75rem', color: '#C2185B', fontWeight: 500 },

  colorPreview: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 },

  toggleLabel: { display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', fontWeight: 500, color: 'var(--admin-text)', cursor: 'pointer' },
  toggle: { width: 40, height: 22, borderRadius: 11, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleDot: { width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },

  simNotice: { marginTop: 12, fontSize: '0.8rem', color: '#ff9800', background: 'rgba(255, 152, 0, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 152, 0, 0.15)' },

  changePassBtn: { padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', background: 'var(--brand)', borderRadius: 'var(--radius-md)', minHeight: 44, alignSelf: 'flex-start', transition: 'opacity 0.15s' },

  backupBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', background: 'var(--brand)', borderRadius: 'var(--radius-md)', minHeight: 44, transition: 'opacity 0.15s' },
  restoreBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text)', background: 'var(--admin-surface)', border: '1.5px solid var(--admin-border)', borderRadius: 'var(--radius-md)', minHeight: 44, transition: 'opacity 0.15s' },
  backupWarning: { marginTop: 16, fontSize: '0.8rem', color: 'var(--admin-text-secondary)', background: 'var(--admin-surface)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--admin-border)', lineHeight: 1.5 },
};
