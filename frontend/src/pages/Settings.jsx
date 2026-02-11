import { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { auth as authApi } from '../api';
import {
  User,
  Lock,
  Shield,
  Monitor,
  Smartphone,
  MessageCircle,
  FolderOpen,
  ArrowLeftRight,
  MapPin,
  Download,
  Trash2,
  Camera,
  CircleDollarSign,
  Calendar,
  ChevronRight,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

function UserAvatar({ username, photoUrl, size = 'lg', className = '' }) {
  const initial = username ? username.charAt(0).toUpperCase() : '?';
  const sizeClass =
    size === 'lg' ? 'w-20 h-20 text-2xl' :
    size === 'md' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-sm';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`rounded-full object-cover bg-primary/10 ${sizeClass} ${className}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-primary/20 text-primary font-semibold ${sizeClass} ${className}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

const SIDEBAR_SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: MessageCircle },
  { id: 'preferences', label: 'PREFERENCES', isHeader: true },
  { id: 'general', label: 'General', icon: FolderOpen },
  { id: 'expense-defaults', label: 'Expense Defaults', icon: ArrowLeftRight },
  { id: 'regional', label: 'Regional', icon: MapPin },
  { id: 'data-privacy', label: 'DATA & PRIVACY', isHeader: true },
  { id: 'export', label: 'Export Data', icon: Download },
  { id: 'delete', label: 'Delete Account', icon: Trash2 },
];

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { currency, startOfWeek, setCurrency, setStartOfWeek, currencies, startOfWeekOptions } = usePreferences();
  const [activeSection, setActiveSection] = useState('profile');
  const [displayName, setDisplayName] = useState(user?.display_name ?? user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [startOfWeekModalOpen, setStartOfWeekModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef(null);

  const NOTIFICATION_PREFS_KEY = 'equilo_notification_prefs';
  const defaultNotificationPrefs = { expenseAdded: true, paymentRequested: true, weeklySummary: false, settlementReminder: true };
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try {
      const s = localStorage.getItem(NOTIFICATION_PREFS_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        return { ...defaultNotificationPrefs, ...parsed };
      }
    } catch {}
    return defaultNotificationPrefs;
  });
  const [notificationPrefsSaved, setNotificationPrefsSaved] = useState(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? user?.username ?? '');
    setEmail(user?.email ?? '');
  }, [user?.id, user?.display_name, user?.username, user?.email]);

  const photoPreviewUrl = useMemo(() => {
    if (photoFile) return URL.createObjectURL(photoFile);
    return null;
  }, [photoFile]);
  useEffect(() => {
    return () => { if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); };
  }, [photoPreviewUrl]);

  const effectivePhotoUrl = photoPreviewUrl ?? (removePhoto ? '' : user?.profile_photo ?? '');
  const displayLabel = displayName.trim() || user?.username || '';

  const handleSelectPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoFile(file);
    setRemovePhoto(false);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      let updated;
      if (photoFile || removePhoto) {
        const form = new FormData();
        form.append('email', email.trim());
        form.append('display_name', displayName.trim());
        if (photoFile) form.append('profile_photo', photoFile);
        if (removePhoto && !photoFile) form.append('remove_profile_photo', '1');
        updated = await authApi.updateProfileWithPhoto(form);
      } else {
        updated = await authApi.updateProfile({ email: email.trim(), display_name: displayName.trim() });
      }
      updateUser(updated);
      setPhotoFile(null);
      setRemovePhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Profile updated.' });
    } catch (err) {
      const msg = err.username?.[0] || err.email?.[0] || err.display_name?.[0] || err.detail || err.message || 'Failed to save';
      setMessage({ type: 'error', text: msg });
} finally {
    setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setPasswordChanging(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordMessage({ type: 'success', text: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setPasswordModalOpen(false); setPasswordMessage({ type: '', text: '' }); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }, 1500);
    } catch (err) {
      const msg = err.current_password?.[0] || err.new_password?.[0] || err.detail || err.message || 'Failed to change password.';
      setPasswordMessage({ type: 'error', text: msg });
    } finally {
      setPasswordChanging(false);
    }
  };

  return (
    <div className="pb-8">
      {/* Single container: rounded corners, shadow, thin vertical border between columns (no overflow-hidden to avoid clipping nav) */}
      <div className="rounded-xl border border-base-300 bg-surface shadow-card flex flex-col lg:flex-row min-h-0">
        {/* Sidebar: light gray/blue background, separated by border-r; rounded corners on its side */}
        <aside className="lg:w-64 lg:min-w-64 shrink-0 flex flex-row lg:flex-col gap-4 lg:gap-0 overflow-x-auto lg:overflow-visible bg-base-200/70 lg:border-r border-base-300 rounded-t-xl lg:rounded-tl-xl lg:rounded-bl-xl lg:rounded-tr-none lg:rounded-br-none">
          <div className="hidden lg:flex flex-col items-center lg:items-start gap-3 p-4 mb-2 shrink-0">
            <UserAvatar username={displayLabel} photoUrl={user?.profile_photo} size="md" />
            <div className="min-w-0 text-center lg:text-left">
              <p className="font-medium text-text-primary truncate m-0">{displayLabel}</p>
              <p className="text-xs text-text-secondary m-0">Member</p>
            </div>
          </div>
          <nav className="flex lg:flex-col gap-0.5 shrink-0 min-w-0 px-2 lg:px-3 pb-2 lg:pb-4" aria-label="Settings">
            {SIDEBAR_SECTIONS.map((item) => {
              if (item.isHeader) {
                return (
                  <p key={item.id} className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-2 px-3 py-1 first:mt-0 shrink-0">
                    {item.label}
                  </p>
                );
              }
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary border-l-4 border-l-primary' : 'text-text-primary hover:bg-base-300/50 border-l-4 border-l-transparent'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content: white background; rounded corners on its side */}
        <main className="flex-1 min-w-0 bg-base-100 rounded-b-xl lg:rounded-bl-none lg:rounded-r-xl lg:rounded-tr-xl lg:rounded-br-xl">
          <div>
          {activeSection === 'profile' && (
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-text-primary m-0 mb-1">Profile</h1>
              <p className="text-sm text-text-secondary m-0 mb-6">Manage your personal account information.</p>

              {/* Profile card: rounded corners, thin border */}
              <div className="rounded-xl border border-base-300 bg-base-100 p-5 sm:p-6 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                  <div className="flex flex-col items-center sm:items-start gap-3">
                    <UserAvatar username={displayLabel} photoUrl={effectivePhotoUrl} size="lg" />
                    <div className="flex flex-col gap-1 text-center sm:text-left">
                      <p className="font-semibold text-text-primary m-0">{displayLabel}</p>
                      <p className="text-sm text-text-secondary m-0">{user?.email || '—'}</p>
                      <p className="text-xs text-text-muted m-0">Member</p>
                    </div>
                    <div className="flex gap-2">
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelectPhoto} aria-label="Change photo" />
                      <button type="button" className="btn btn-outline btn-sm gap-1.5 border-base-300 rounded-lg" onClick={() => fileInputRef.current?.click()}>
                        <Camera className="w-4 h-4" /> Change photo
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm text-text-secondary hover:text-error rounded-lg" onClick={handleRemovePhoto}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-4 max-w-md">
                <div>
                  <label htmlFor="settings-username" className="block text-sm font-medium text-text-primary mb-1.5">Username</label>
                  <div className="relative">
                    <input
                      id="settings-username"
                      type="text"
                      value={user?.username ?? ''}
                      readOnly
                      className="input input-bordered w-full bg-base-200 border-base-300 rounded-lg cursor-not-allowed pr-10"
                      aria-readonly="true"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" aria-hidden />
                  </div>
                </div>
                <div>
                  <label htmlFor="settings-name" className="block text-sm font-medium text-text-primary mb-1.5">Full Name</label>
                  <input
                    id="settings-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input input-bordered w-full bg-base-100 border-base-300 rounded-lg"
                    placeholder="Your display name"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="settings-email" className="block text-sm font-medium text-text-primary mb-1.5">Email Address</label>
                  <input
                    id="settings-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input input-bordered w-full bg-base-100 border-base-300 rounded-lg"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                {message.text && (
                  <p className={`text-sm m-0 ${message.type === 'error' ? 'text-error' : 'text-success'}`} role="alert">{message.text}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn btn-primary rounded-lg" disabled={saving}>Save Changes</button>
                  <button type="button" className="btn btn-ghost bg-base-100 border border-base-300 rounded-lg" onClick={() => { setDisplayName(user?.display_name ?? user?.username ?? ''); setEmail(user?.email ?? ''); setPhotoFile(null); setRemovePhoto(false); }}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {activeSection === 'general' && (
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-text-primary m-0 mb-1">General</h1>
              <p className="text-sm text-text-secondary m-0 mb-6">Currency and date preferences.</p>
              <div className="space-y-1 max-w-md">
                <div>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-base-200/60 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset border border-base-300 bg-base-100"
                    aria-expanded={currencyModalOpen}
                    onClick={() => { setCurrencyModalOpen((o) => !o); setStartOfWeekModalOpen(false); }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><CircleDollarSign className="w-5 h-5" /></span>
                    <span className="flex-1 text-sm font-medium text-text-primary">Currency</span>
                    <span className="text-sm text-text-secondary shrink-0">{currency.label}</span>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>
                  {currencyModalOpen && (
                    <div className="mt-1 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden">
                      <ul className="list-none p-1 m-0 max-h-56 overflow-auto">
                        {currencies.map((c) => (
                          <li key={c.code}>
                            <button type="button" className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-left text-sm font-medium ${currency.code === c.code ? 'bg-primary/15 text-primary' : 'text-text-primary hover:bg-base-200'}`} onClick={() => { setCurrency(c.code); setCurrencyModalOpen(false); }}>
                              <span>{c.label}</span>
                              {currency.code === c.code && <span className="text-primary">✓</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-base-200/60 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset border border-base-300 bg-base-100"
                    aria-expanded={startOfWeekModalOpen}
                    onClick={() => { setStartOfWeekModalOpen((o) => !o); setCurrencyModalOpen(false); }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Calendar className="w-5 h-5" /></span>
                    <span className="flex-1 text-sm font-medium text-text-primary">Start of Week</span>
                    <span className="text-sm text-text-secondary shrink-0">{startOfWeek === 'sunday' ? 'Sunday' : 'Monday'}</span>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>
                  {startOfWeekModalOpen && (
                    <div className="mt-1 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden">
                      <ul className="list-none p-1 m-0">
                        {startOfWeekOptions.map((opt) => (
                          <li key={opt.value}>
                            <button type="button" className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-left text-sm font-medium ${startOfWeek === opt.value ? 'bg-primary/15 text-primary' : 'text-text-primary hover:bg-base-200'}`} onClick={() => { setStartOfWeek(opt.value); setStartOfWeekModalOpen(false); }}>
                              <span>{opt.label}</span>
                              {startOfWeek === opt.value && <span className="text-primary">✓</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-text-primary m-0 mb-1">Security</h1>
              <p className="text-sm text-text-secondary m-0 mb-6">Manage your account&apos;s security settings.</p>

              <div className="space-y-4 max-w-2xl">
                {/* Password */}
                <div className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Lock className="w-5 h-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-text-primary m-0 mb-0.5">Password</h2>
                      <p className="text-sm text-text-secondary m-0">Change your account password.</p>
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm shrink-0 rounded-lg" onClick={() => setPasswordModalOpen(true)}>
                    Update now
                  </button>
                </div>

                {/* Two-Factor Authentication */}
                <div className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Shield className="w-5 h-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-text-primary m-0 mb-0.5">Two-Factor Authentication</h2>
                      <p className="text-sm text-text-secondary m-0">Status: Off</p>
                      <p className="text-xs text-text-muted m-0 mt-0.5">Add an extra layer of security to your account.</p>
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm shrink-0 rounded-lg">
                    Enable 2FA
                  </button>
                </div>

                {/* Active Sessions */}
                <div className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
                  <h2 className="font-semibold text-text-primary m-0 mb-3">Active Sessions</h2>
                  <ul className="list-none p-0 m-0 space-y-2">
                    <li>
                      <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-primary/5 border-primary/30">
                        <Monitor className="w-5 h-5 text-text-muted shrink-0" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-text-primary text-sm m-0">This device</p>
                          <p className="text-xs text-text-secondary m-0">Active</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                      </div>
                    </li>
                  </ul>
                  <button type="button" className="mt-3 text-sm text-primary hover:underline font-medium" onClick={() => logout()}>
                    Log out from all devices
                  </button>
                </div>

                <div className="flex gap-3 pt-2 justify-end">
                  <button type="button" className="btn btn-primary rounded-lg">Save Changes</button>
                  <button type="button" className="btn bg-base-100 border border-base-300 rounded-lg">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-text-primary m-0 mb-1">Notifications</h1>
              <p className="text-sm text-text-secondary m-0 mb-6">Manage your notification preferences.</p>

              <div className="space-y-3 max-w-2xl">
                {[
                  { key: 'expenseAdded', title: 'Expense Added', description: 'Someone adds a new expense' },
                  { key: 'paymentRequested', title: 'Payment Requested', description: 'Someone requests a payment' },
                  { key: 'weeklySummary', title: 'Weekly Summary Email', description: 'Receive a weekly summary of group expenses via email' },
                  { key: 'settlementReminder', title: 'Settlement Reminder', description: 'Someone owes you money for too long' },
                ].map(({ key, title, description }) => (
                  <div key={key} className="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-text-primary m-0 mb-0.5">{title}</h2>
                      <p className="text-sm text-text-secondary m-0">{description}</p>
                    </div>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary shrink-0"
                      checked={!!notificationPrefs[key]}
                      onChange={(e) => setNotificationPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                      aria-label={`Toggle ${title}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-6 justify-end">
                <button
                  type="button"
                  className="btn bg-base-100 border border-base-300 rounded-lg"
                  onClick={() => {
                    try {
                      const s = localStorage.getItem(NOTIFICATION_PREFS_KEY);
                      if (s) setNotificationPrefs({ ...defaultNotificationPrefs, ...JSON.parse(s) });
                      else setNotificationPrefs(defaultNotificationPrefs);
                    } catch {}
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary rounded-lg"
                  onClick={() => {
                    try {
                      localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPrefs));
                      setNotificationPrefsSaved(true);
                      setTimeout(() => setNotificationPrefsSaved(null), 2000);
                    } catch {}
                  }}
                >
                  Save Changes
                </button>
              </div>
              {notificationPrefsSaved && <p className="text-sm text-success mt-2 m-0">Preferences saved.</p>}
            </div>
          )}

          {['expense-defaults', 'regional', 'export', 'delete'].includes(activeSection) && (
            <div className="p-6 sm:p-8">
              <h1 className="text-2xl font-bold text-text-primary m-0 mb-1">
                {SIDEBAR_SECTIONS.find((s) => s.id === activeSection)?.label ?? activeSection}
              </h1>
              <p className="text-sm text-text-secondary m-0">This section is not available yet.</p>
            </div>
          )}
        </div>
      </main>
      </div>

      {/* Change password modal */}
      {passwordModalOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-black/30" aria-hidden onClick={() => { setPasswordModalOpen(false); setPasswordMessage({ type: '', text: '' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }} />
          <div className="fixed left-1/2 top-1/2 z-[9999] w-[min(calc(100vw-2rem),400px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-base-100 border border-base-300 shadow-xl p-6" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="password-dialog-title" className="text-lg font-semibold text-text-primary m-0">Change password</h2>
              <button type="button" className="btn btn-ghost btn-sm btn-square rounded-lg" onClick={() => { setPasswordModalOpen(false); setPasswordMessage({ type: '', text: '' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-text-primary mb-1.5">Current password</label>
                <div className="relative">
                  <input id="current-password" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input input-bordered w-full rounded-lg pr-10" placeholder="Enter current password" required autoComplete="current-password" />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-square rounded-lg text-text-muted hover:text-text-primary" onClick={() => setShowCurrentPassword((v) => !v)} aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}>
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-text-primary mb-1.5">New password</label>
                <div className="relative">
                  <input id="new-password" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input input-bordered w-full rounded-lg pr-10" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-square rounded-lg text-text-muted hover:text-text-primary" onClick={() => setShowNewPassword((v) => !v)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-text-primary mb-1.5">Confirm new password</label>
                <div className="relative">
                  <input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input input-bordered w-full rounded-lg pr-10" placeholder="Confirm new password" required autoComplete="new-password" />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-square rounded-lg text-text-muted hover:text-text-primary" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {passwordMessage.text && <p className={`text-sm m-0 ${passwordMessage.type === 'error' ? 'text-error' : 'text-success'}`} role="alert">{passwordMessage.text}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" className="btn bg-base-100 border border-base-300 rounded-lg" onClick={() => { setPasswordModalOpen(false); setPasswordMessage({ type: '', text: '' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmPassword(false); }}>Cancel</button>
                <button type="submit" className="btn btn-primary rounded-lg" disabled={passwordChanging}>{passwordChanging ? 'Updating…' : 'Update password'}</button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
