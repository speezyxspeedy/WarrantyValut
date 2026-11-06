/**
 * WarrantyVault — Settings & Preferences Module
 * Manages persistence of application settings, theme states, and storage estimates.
 */

import { getDB, getById, put, clearAllData, STORES, add } from './database.js';
import { toast, confirmDialog, showModal, closeModal, escapeHtml } from './ui.js';

const SETTINGS_ID = 'app_settings';

const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  theme: 'dark',
  currency: '$',
  dateFormat: 'YYYY-MM-DD',
  expiryWarningDays: 30,
  reminderIntervals: [30, 7, 1, 0],
  desktopNotifications: false,
  updated_at: new Date().toISOString()
};

let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Initializes settings from IndexedDB (or seeds default if empty).
 */
export async function loadSettings() {
  try {
    const stored = await getById(STORES.SETTINGS, SETTINGS_ID);
    if (stored) {
      currentSettings = { ...DEFAULT_SETTINGS, ...stored };
    } else {
      // Check localStorage for quick theme preference fallback
      const cachedTheme = localStorage.getItem('wv_theme');
      if (cachedTheme === 'light' || cachedTheme === 'dark') {
        currentSettings.theme = cachedTheme;
      }
      await put(STORES.SETTINGS, currentSettings);
    }
  } catch (err) {
    console.warn('Could not load settings from IndexedDB, using defaults:', err);
  }

  applyTheme(currentSettings.theme);
  return currentSettings;
}

/**
 * Retrieves a single setting value.
 */
export function getSetting(key) {
  return currentSettings[key] !== undefined ? currentSettings[key] : DEFAULT_SETTINGS[key];
}

/**
 * Updates a single setting and saves to IndexedDB.
 */
export async function updateSetting(key, value) {
  currentSettings[key] = value;
  currentSettings.updated_at = new Date().toISOString();

  if (key === 'theme') {
    applyTheme(value);
  }

  try {
    await put(STORES.SETTINGS, currentSettings);
  } catch (err) {
    console.error('Failed to save setting to IndexedDB:', err);
  }
}

/**
 * Applies the visual theme class to <html> and updates the button icon/label.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  const label = document.getElementById('theme-toggle-label');
  const iconContainer = document.getElementById('theme-icon-container');

  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    localStorage.setItem('wv_theme', 'light');
    if (label) label.textContent = 'Dark Mode';
    if (iconContainer) {
      iconContainer.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    localStorage.setItem('wv_theme', 'dark');
    if (label) label.textContent = 'Light Mode';
    if (iconContainer) {
      iconContainer.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    }
  }
}

/**
 * Estimates storage usage in bytes via Browser Storage API.
 */
export async function getStorageQuotaEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0
      };
    } catch {
      // ignore
    }
  }
  return { usage: 0, quota: 0, percentage: 0 };
}

/**
 * Format bytes into human readable KB/MB/GB.
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Renders the Settings View.
 */
export async function renderSettingsView(container) {
  const quota = await getStorageQuotaEstimate();

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Application Settings</h2>
          <p>Customize your currency, warranty calculation thresholds, and storage preferences.</p>
        </div>
      </div>

      <div class="dashboard-grid-2col">
        <!-- Left: Preferences Form -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">General Preferences</h3>
              <span class="card-subtitle">Values are automatically saved locally</span>
            </div>
          </div>

          <form id="settings-form" class="form-grid" onsubmit="return false;">
            <div class="form-group">
              <label class="form-label" for="setting-currency">Currency Symbol</label>
              <select id="setting-currency" class="form-select">
                <option value="$" ${getSetting('currency') === '$' ? 'selected' : ''}>$ (USD / CAD / AUD)</option>
                <option value="€" ${getSetting('currency') === '€' ? 'selected' : ''}>€ (EUR)</option>
                <option value="£" ${getSetting('currency') === '£' ? 'selected' : ''}>£ (GBP)</option>
                <option value="¥" ${getSetting('currency') === '¥' ? 'selected' : ''}>¥ (JPY / CNY)</option>
                <option value="₹" ${getSetting('currency') === '₹' ? 'selected' : ''}>₹ (INR)</option>
                <option value="CHF" ${getSetting('currency') === 'CHF' ? 'selected' : ''}>CHF (Swiss Franc)</option>
                <option value="kr" ${getSetting('currency') === 'kr' ? 'selected' : ''}>kr (SEK / NOK / DKK)</option>
                <option value="R$" ${getSetting('currency') === 'R$' ? 'selected' : ''}>R$ (BRL)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="setting-date-format">Date Display Format</label>
              <select id="setting-date-format" class="form-select">
                <option value="YYYY-MM-DD" ${getSetting('dateFormat') === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (ISO)</option>
                <option value="MM/DD/YYYY" ${getSetting('dateFormat') === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY" ${getSetting('dateFormat') === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (UK / EU)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="setting-expiry-days">
                <span>Expiring Soon Threshold</span>
                <span class="helper">Days</span>
              </label>
              <input type="number" id="setting-expiry-days" class="form-input" min="1" max="180" value="${getSetting('expiryWarningDays')}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="setting-theme">Color Theme</label>
              <select id="setting-theme" class="form-select">
                <option value="dark" ${getSetting('theme') === 'dark' ? 'selected' : ''}>Deep Charcoal (Dark)</option>
                <option value="light" ${getSetting('theme') === 'light' ? 'selected' : ''}>Clean Paper (Light)</option>
              </select>
            </div>

            <div class="form-group col-span-2">
              <label class="form-label">Default Expiry Reminder Intervals</label>
              <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="60" ${getSetting('reminderIntervals').includes(60) ? 'checked' : ''} />
                  <span>60 days before</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="30" ${getSetting('reminderIntervals').includes(30) ? 'checked' : ''} />
                  <span>30 days before</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="14" ${getSetting('reminderIntervals').includes(14) ? 'checked' : ''} />
                  <span>14 days before</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="7" ${getSetting('reminderIntervals').includes(7) ? 'checked' : ''} />
                  <span>7 days before</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="1" ${getSetting('reminderIntervals').includes(1) ? 'checked' : ''} />
                  <span>1 day before</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer;">
                  <input type="checkbox" class="reminder-interval-cb" value="0" ${getSetting('reminderIntervals').includes(0) ? 'checked' : ''} />
                  <span>On expiry date</span>
                </label>
              </div>
            </div>

            <div class="form-group col-span-2" style="margin-top: 8px;">
              <button id="btn-save-settings" class="btn btn-primary" style="width: fit-content;">Save Settings</button>
            </div>
          </form>
        </div>

        <!-- Right: Privacy, Storage & Quick Tools -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Storage & Privacy Card -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Browser Storage & Privacy</h3>
                <span class="card-subtitle">Zero cloud servers · 100% Client-Side Privacy</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.84rem;">
              <p style="color: var(--text-secondary); line-height: 1.5;">
                All your product records, receipts (PDFs & images), repair logs, and warranties are stored directly in your local browser’s IndexedDB sandbox.
              </p>

              <div class="storage-indicator" style="padding: 12px;">
                <div class="storage-bar" style="height: 6px; margin-bottom: 8px;">
                  <div class="storage-fill" style="width: ${Math.max(quota.percentage, 2)}%;"></div>
                </div>
                <div class="storage-text">
                  <span>Used: <strong>${formatBytes(quota.usage)}</strong></span>
                  <span>Quota: <strong>${formatBytes(quota.quota)}</strong></span>
                </div>
              </div>

              <div style="background-color: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Desktop Notifications</div>
                <div style="color: var(--text-secondary); font-size: 0.78rem; margin-bottom: 8px;">
                  Browser Notification Permission: <strong id="notif-permission-status">${typeof Notification !== 'undefined' ? Notification.permission : 'Not supported'}</strong>
                </div>
                <button id="btn-request-notif-perm" class="btn btn-secondary btn-sm">
                  Request Browser Permission
                </button>
              </div>
            </div>
          </div>

          <!-- Sample Data Loader Card -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Demo & Testing Sandbox</h3>
                <span class="card-subtitle">Need test data to evaluate the application?</span>
              </div>
            </div>
            <div style="font-size: 0.84rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 10px;">
              <p>You can seed 5 realistic products with varied warranty dates (active, expiring soon, expired, under repair, and claims) with a single click.</p>
              <button id="btn-seed-sample-data" class="btn btn-secondary" style="width: fit-content;">
                Seed Realistic Sample Products
              </button>
            </div>
          </div>

          <!-- Danger Zone Card -->
          <div class="card" style="border-color: rgba(239, 68, 68, 0.3);">
            <div class="card-header">
              <div>
                <h3 class="card-title" style="color: var(--status-expired-color);">Danger Zone</h3>
                <span class="card-subtitle">Irreversible actions</span>
              </div>
            </div>
            <div style="font-size: 0.84rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 10px;">
              <p>Permanently wipe all registered products, digital receipts, repair histories, claims, and reminders from IndexedDB.</p>
              <button id="btn-wipe-database" class="btn btn-danger" style="width: fit-content;">
                Clear All Local Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const currency = document.getElementById('setting-currency').value;
    const dateFormat = document.getElementById('setting-date-format').value;
    const expiryWarningDays = parseInt(document.getElementById('setting-expiry-days').value, 10) || 30;
    const theme = document.getElementById('setting-theme').value;

    const intervalCheckboxes = document.querySelectorAll('.reminder-interval-cb:checked');
    const reminderIntervals = Array.from(intervalCheckboxes).map(cb => parseInt(cb.value, 10));

    await updateSetting('currency', currency);
    await updateSetting('dateFormat', dateFormat);
    await updateSetting('expiryWarningDays', expiryWarningDays);
    await updateSetting('theme', theme);
    await updateSetting('reminderIntervals', reminderIntervals);

    toast('Settings saved successfully', 'success');
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
  });

  document.getElementById('setting-theme')?.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });

  document.getElementById('btn-request-notif-perm')?.addEventListener('click', async () => {
    if (typeof Notification === 'undefined') {
      toast('Browser notifications are not supported on this device/browser', 'warn');
      return;
    }
    const permission = await Notification.requestPermission();
    const statusEl = document.getElementById('notif-permission-status');
    if (statusEl) statusEl.textContent = permission;

    if (permission === 'granted') {
      await updateSetting('desktopNotifications', true);
      toast('Desktop notifications enabled!', 'success');
      new Notification('WarrantyVault Notifications Active', {
        body: 'You will receive timely alerts for upcoming warranty expirations.',
        icon: '/assets/logo.svg'
      });
    } else {
      await updateSetting('desktopNotifications', false);
      toast('Notification permission was ' + permission, 'info');
    }
  });

  // Seed realistic sample data
  document.getElementById('btn-seed-sample-data')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Load Realistic Sample Products',
      message: 'This will add 5 realistic test products (Apple MacBook Pro, Sony WH-1000XM5, LG OLED Smart TV, Dyson V15 Vacuum, and Breville Espresso Machine) with active warranties, repair history, and upcoming reminders so you can test all features.',
      confirmText: 'Load Sample Data'
    });
    if (!ok) return;

    await seedSampleData();
    toast('Loaded 5 sample products successfully!', 'success');
    window.location.hash = '#dashboard';
  });

  // Danger zone: Wipe data
  document.getElementById('btn-wipe-database')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Permanently Erase All Data?',
      message: 'WARNING: This will permanently delete ALL stored products, receipts, repairs, claims, and reminders from your browser. This action cannot be undone. Make sure you have exported a JSON backup first if needed.',
      confirmText: 'Wipe Everything',
      danger: true
    });
    if (!ok) return;

    await clearAllData();
    await loadSettings();
    toast('All local data has been erased', 'info');
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
    window.location.hash = '#dashboard';
  });
}

/**
 * Seeds 5 realistic products to facilitate testing all features.
 */
export async function seedSampleData() {
  const now = new Date();
  const formatYMD = (d) => d.toISOString().split('T')[0];

  const makeDate = (daysOffset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysOffset);
    return formatYMD(d);
  };

  const sampleProducts = [
    {
      id: 'prod_macbook_pro_16',
      name: 'MacBook Pro 16" M3 Max',
      brand: 'Apple',
      model: 'A2991 - Space Black',
      serial_number: 'C02G899KMD6R',
      category: 'Computers & Laptops',
      purchase_date: makeDate(-180),
      purchase_price: 3499.00,
      seller: 'Apple Store Regent Street',
      warranty_duration: 3,
      warranty_unit: 'years',
      warranty_start: makeDate(-180),
      warranty_end: makeDate(915), // active
      notes: 'Includes AppleCare+ with 3 years accidental damage protection.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod_sony_headphones',
      name: 'Sony WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH1000XM5/B',
      serial_number: 'SN-8829104',
      category: 'Accessories',
      purchase_date: makeDate(-350),
      purchase_price: 398.00,
      seller: 'Best Buy Downtown',
      warranty_duration: 1,
      warranty_unit: 'years',
      warranty_start: makeDate(-350),
      warranty_end: makeDate(15), // EXPIRING SOON!
      notes: 'Purchased on Black Friday discount. 1-year manufacturer warranty.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod_lg_oled_tv',
      name: 'LG OLED C3 65" 4K Smart TV',
      brand: 'LG Electronics',
      model: 'OLED65C3PUA',
      serial_number: '304RMVD8H029',
      category: 'Electronics',
      purchase_date: makeDate(-420),
      purchase_price: 1899.99,
      seller: 'Costco Wholesale',
      warranty_duration: 1,
      warranty_unit: 'years',
      warranty_start: makeDate(-420),
      warranty_end: makeDate(-55), // EXPIRED!
      notes: 'Extended panel replacement program through Costco Concierge.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod_dyson_v15',
      name: 'Dyson V15 Detect Cordless Vacuum',
      brand: 'Dyson',
      model: 'V15-Absolute',
      serial_number: 'DY-39481726',
      category: 'Home Appliances',
      purchase_date: makeDate(-90),
      purchase_price: 749.99,
      seller: 'Dyson Direct Web',
      warranty_duration: 2,
      warranty_unit: 'years',
      warranty_start: makeDate(-90),
      warranty_end: makeDate(640),
      notes: 'Currently undergoing trigger switch inspection.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'prod_breville_espresso',
      name: 'Breville Barista Touch Impress',
      brand: 'Breville',
      model: 'BES881BSS',
      serial_number: 'BR-2024-9912',
      category: 'Home Appliances',
      purchase_date: makeDate(-60),
      purchase_price: 1499.95,
      seller: 'Williams Sonoma',
      warranty_duration: 2,
      warranty_unit: 'years',
      warranty_start: makeDate(-60),
      warranty_end: makeDate(670),
      notes: 'Dual boiler thermal jet espresso machine.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  for (const prod of sampleProducts) {
    await put(STORES.PRODUCTS, prod);
  }

  // Add 1 sample repair for Dyson
  await put(STORES.REPAIRS, {
    id: 'rep_dyson_01',
    product_id: 'prod_dyson_v15',
    repair_date: makeDate(-5),
    service_centre: 'Dyson Authorized Service Center',
    issue_description: 'Trigger button sensor intermittent failure during high boost suction mode.',
    status: 'UNDER_REPAIR',
    cost: 0,
    parts_replaced: 'Handle mainboard assembly',
    notes: 'Covered 100% under manufacturer warranty.',
    expected_completion_date: makeDate(7),
    completion_date: '',
    created_at: new Date().toISOString()
  });

  // Add 1 sample claim for Sony headphones
  await put(STORES.CLAIMS, {
    id: 'claim_sony_01',
    product_id: 'prod_sony_headphones',
    claim_date: makeDate(-10),
    reference_number: 'SNY-CLM-2026-904',
    provider: 'Sony Electronics Support',
    description: 'Right earcup ANC hiss during flight travel.',
    status: 'UNDER_REVIEW',
    notes: 'Submitted audio diagnostic recording.',
    created_at: new Date().toISOString()
  });

  // Auto-generate reminders
  const { syncRemindersForProduct } = await import('./reminders.js');
  for (const p of sampleProducts) {
    await syncRemindersForProduct(p);
  }
}
