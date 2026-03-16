import React, { useState, useEffect, useCallback } from 'react';
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
            <SelectField
              label="Timezone"
              value={settings.timezone || 'America/New_York'}
              onChange={v => update('timezone', v)}
              options={TIMEZONES}
            />
          </div>
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
};
