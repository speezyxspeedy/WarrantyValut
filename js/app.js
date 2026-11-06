/**
 * WarrantyVault — Master Application Controller
 * Module routing, navigation, dashboard rendering, real calculated statistics, and PWA setup.
 */

import { getDB, getAll, STORES } from './database.js';
import { loadSettings, getSetting, applyTheme, getStorageQuotaEstimate, formatBytes } from './settings.js';
import { calculateWarrantyStatus, WARRANTY_STATUS, formatRemainingDays, renderWarrantyTrackerView } from './warranty.js';
import { renderProductsView, openAddEditProductModal, openProductDetailModal } from './products.js';
import { renderReceiptsView, openUploadReceiptModal } from './receipts.js';
import { renderRepairsView, openAddEditRepairModal, REPAIR_STATUS } from './repairs.js';
import { renderClaimsView, openAddEditClaimModal, CLAIM_STATUS } from './claims.js';
import { renderRemindersView, renderNotificationFlyout, updateNotificationBadges } from './reminders.js';
import { renderAnalyticsView } from './analytics.js';
import { renderBackupView } from './backup.js';
import { renderSettingsView } from './settings.js';
import { showSearchResultsModal } from './search.js';
import { formatCurrency, formatDate, escapeHtml, showModal, closeModal } from './ui.js';

let currentRoute = 'dashboard';
let deferredInstallPrompt = null;

/**
 * Main application bootstrap.
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialize DB & Settings
    await getDB();
    await loadSettings();

    // 2. Setup Service Worker for offline capability
    registerServiceWorker();

    // 3. Setup PWA Install Handler
    setupPwaInstall();

    // 4. Setup Online/Offline Network Listeners
    setupNetworkListeners();

    // 5. Wire App Shell (Sidebar, Topbar, Search, Notifications)
    setupShellEventListeners();

    // 6. Handle Routing
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('wv-data-changed', () => {
      refreshNavBadges();
      updateStorageMeter();
      handleRoute();
    });

    // 7. Initial badge and storage check
    await refreshNavBadges();
    await updateStorageMeter();

    // 8. Load initial route
    handleRoute();
  } catch (err) {
    console.error('Fatal initialization error:', err);
    const viewport = document.getElementById('content-viewport');
    if (viewport) {
      viewport.innerHTML = `
        <div class="card empty-state" style="border-color: var(--status-expired-color);">
          <div class="empty-title" style="color: var(--status-expired-color);">Application Initialization Error</div>
          <div class="empty-desc">${escapeHtml(err.message)}</div>
          <button class="btn btn-primary" onclick="location.reload()">Reload Application</button>
        </div>
      `;
    }
  }
});

/**
 * Registers Service Worker.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('WarrantyVault ServiceWorker registered:', reg.scope);
    }).catch((err) => {
      console.warn('ServiceWorker registration error:', err);
    });
  }
}

/**
 * In-App PWA Install Prompt handling.
 */
function setupPwaInstall() {
  const pwaBtn = document.getElementById('pwa-install-btn');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) {
    if (pwaBtn) pwaBtn.style.display = 'none';
    return;
  }

  // Chromium / Android / Desktop flow
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaBtn) pwaBtn.style.display = 'flex';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (pwaBtn) pwaBtn.style.display = 'none';
  });

  // Detect iOS Safari
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);

  if (pwaBtn) {
    if (isIOS && !isStandalone) {
      pwaBtn.style.display = 'flex';
    }

    pwaBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          pwaBtn.style.display = 'none';
        }
        deferredInstallPrompt = null;
      } else if (isIOS) {
        showModal({
          title: 'Install WarrantyVault on iOS',
          contentHtml: `
            <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
              <p style="margin-bottom: 8px;">To install this web app on your iPhone or iPad:</p>
              <ol style="padding-left: 20px; display: flex; flex-direction: column; gap: 8px;">
                <li>Tap the <strong>Share</strong> button in Safari's bottom toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top right corner.</li>
              </ol>
            </div>
          `,
          footerHtml: `<button class="btn btn-primary" id="btn-close-ios-guide">Got it</button>`,
          size: 'md'
        });
        document.getElementById('btn-close-ios-guide')?.addEventListener('click', closeModal);
      }
    });
  }
}

/**
 * Setup Online/Offline Status Banners.
 */
function setupNetworkListeners() {
  const offlineBanner = document.getElementById('offline-banner');
  const updateStatus = () => {
    if (!navigator.onLine) {
      if (offlineBanner) offlineBanner.style.display = 'flex';
    } else {
      if (offlineBanner) offlineBanner.style.display = 'none';
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

/**
 * Wires sidebar navigation, theme switch, notifications flyout, search input.
 */
function setupShellEventListeners() {
  // Mobile Menu Toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  const toggleSidebar = () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  };

  mobileMenuBtn?.addEventListener('click', toggleSidebar);
  overlay?.addEventListener('click', toggleSidebar);

  // Close sidebar on link click (mobile)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  });

  // Theme Toggle Button
  const themeBtn = document.getElementById('theme-toggle-btn');
  themeBtn?.addEventListener('click', () => {
    const current = getSetting('theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    import('./settings.js').then(m => m.updateSetting('theme', next));
  });

  // Global Primary "Add Product" Topbar Button
  document.getElementById('btn-add-product')?.addEventListener('click', () => {
    openAddEditProductModal(null, () => {
      refreshNavBadges();
      handleRoute();
    });
  });

  // Notification Bell Flyout
  const bellBtn = document.getElementById('notification-bell-btn');
  const mobileBellBtn = document.getElementById('mobile-notifications-btn');
  const flyout = document.getElementById('notification-flyout');

  const toggleFlyout = (e) => {
    e.stopPropagation();
    const isHidden = flyout.style.display === 'none' || !flyout.style.display;
    if (isHidden) {
      renderNotificationFlyout();
      flyout.style.display = 'flex';
    } else {
      flyout.style.display = 'none';
    }
  };

  bellBtn?.addEventListener('click', toggleFlyout);
  mobileBellBtn?.addEventListener('click', (e) => {
    window.location.hash = '#reminders';
  });

  document.addEventListener('click', (e) => {
    if (flyout && !flyout.contains(e.target) && e.target !== bellBtn) {
      flyout.style.display = 'none';
    }
  });

  document.getElementById('mark-all-reminders-read-btn')?.addEventListener('click', async () => {
    const { markAllRemindersRead } = await import('./reminders.js');
    await markAllRemindersRead();
    renderNotificationFlyout();
  });

  // Global Search Input
  const searchInput = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('search-clear-btn');

  searchInput?.addEventListener('input', () => {
    if (clearBtn) {
      clearBtn.style.display = searchInput.value ? 'block' : 'none';
    }
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      if (q) {
        showSearchResultsModal(q);
      }
    }
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    searchInput.focus();
  });
}

/**
 * Updates unread counts on navigation items.
 */
export async function refreshNavBadges() {
  const products = await getAll(STORES.PRODUCTS);
  const receipts = await getAll(STORES.RECEIPTS);
  const repairs = await getAll(STORES.REPAIRS);
  const claims = await getAll(STORES.CLAIMS);

  const prodCountEl = document.getElementById('nav-count-products');
  const receiptCountEl = document.getElementById('nav-count-receipts');
  const repairCountEl = document.getElementById('nav-count-repairs');
  const claimCountEl = document.getElementById('nav-count-claims');

  if (prodCountEl) prodCountEl.textContent = products.length;
  if (receiptCountEl) receiptCountEl.textContent = receipts.length;
  if (repairCountEl) {
    repairCountEl.textContent = repairs.length;
    repairCountEl.style.display = repairs.length > 0 ? 'inline-block' : 'none';
  }
  if (claimCountEl) {
    claimCountEl.textContent = claims.length;
    claimCountEl.style.display = claims.length > 0 ? 'inline-block' : 'none';
  }

  updateNotificationBadges();
}

/**
 * Updates the storage usage meter in the sidebar.
 */
async function updateStorageMeter() {
  const quota = await getStorageQuotaEstimate();
  const fill = document.getElementById('storage-bar-fill');
  const val = document.getElementById('storage-value');

  if (fill) fill.style.width = `${Math.max(quota.percentage, 2)}%`;
  if (val && quota.usage > 0) val.textContent = formatBytes(quota.usage);
}

/**
 * Handles module routing based on window.location.hash.
 */
function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  currentRoute = hash;

  // Sync sidebar active state
  document.querySelectorAll('.nav-link').forEach(link => {
    const mod = link.getAttribute('data-module');
    if (mod === currentRoute) link.classList.add('active');
    else link.classList.remove('active');
  });

  const pageTitle = document.getElementById('page-title');
  const breadcrumb = document.getElementById('page-breadcrumb');
  const viewport = document.getElementById('content-viewport');

  if (!viewport) return;

  const titles = {
    dashboard: { title: 'Dashboard', sub: 'Overview' },
    products: { title: 'My Products', sub: 'Catalog' },
    warranty: { title: 'Warranty Tracker', sub: 'Deadlines & Calendar' },
    receipts: { title: 'Digital Receipts', sub: 'Invoices Vault' },
    repairs: { title: 'Repair History', sub: 'Service Records' },
    claims: { title: 'Warranty Claims', sub: 'RMA Tracking' },
    reminders: { title: 'Reminder Center', sub: 'Schedules' },
    analytics: { title: 'Analytics', sub: 'Portfolio Insights' },
    backup: { title: 'Backup & Restore', sub: 'Portability' },
    settings: { title: 'Settings', sub: 'Preferences' }
  };

  const info = titles[currentRoute] || titles.dashboard;
  if (pageTitle) pageTitle.textContent = info.title;
  if (breadcrumb) breadcrumb.textContent = info.sub;

  // Render view
  switch (currentRoute) {
    case 'dashboard':
      renderDashboard(viewport);
      break;
    case 'products':
      renderProductsView(viewport);
      break;
    case 'warranty':
      renderWarrantyTrackerView(viewport);
      break;
    case 'receipts':
      renderReceiptsView(viewport);
      break;
    case 'repairs':
      renderRepairsView(viewport);
      break;
    case 'claims':
      renderClaimsView(viewport);
      break;
    case 'reminders':
      renderRemindersView(viewport);
      break;
    case 'analytics':
      renderAnalyticsView(viewport);
      break;
    case 'backup':
      renderBackupView(viewport);
      break;
    case 'settings':
      renderSettingsView(viewport);
      break;
    default:
      renderDashboard(viewport);
  }
}

/**
 * Renders the Professional Overview Dashboard with 100% calculated real metrics.
 */
async function renderDashboard(container) {
  const products = await getAll(STORES.PRODUCTS);
  const receipts = await getAll(STORES.RECEIPTS);
  const repairs = await getAll(STORES.REPAIRS);
  const claims = await getAll(STORES.CLAIMS);
  const reminders = await getAll(STORES.REMINDERS);

  // Calculate statistics from actual data
  const totalProducts = products.length;
  const totalPurchaseValue = products.reduce((acc, p) => acc + (Number(p.purchase_price) || 0), 0);

  // Classify products
  const classifiedProducts = products.map(p => ({
    ...p,
    warrantyInfo: calculateWarrantyStatus(p)
  }));

  const activeWarranties = classifiedProducts.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.ACTIVE).length;
  const expiringSoon = classifiedProducts.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.EXPIRING_SOON).length;
  const expiredWarranties = classifiedProducts.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.EXPIRED).length;

  const productsUnderRepair = repairs.filter(r => 
    r.status === REPAIR_STATUS.UNDER_REPAIR || r.status === REPAIR_STATUS.WAITING_FOR_PARTS
  ).length;

  const openClaims = claims.filter(c => 
    c.status !== CLAIM_STATUS.RESOLVED && c.status !== CLAIM_STATUS.REJECTED
  ).length;

  // A. Expiry Timeline (Products expiring soonest)
  const timelineProducts = classifiedProducts
    .filter(p => p.warranty_end && p.warrantyInfo.status !== WARRANTY_STATUS.NO_WARRANTY)
    .sort((a, b) => (a.warrantyInfo.daysRemaining || 0) - (b.warrantyInfo.daysRemaining || 0))
    .slice(0, 5);

  // B. Recent Purchases (Newest purchased)
  const recentPurchases = [...classifiedProducts]
    .sort((a, b) => (b.purchase_date || '').localeCompare(a.purchase_date || ''))
    .slice(0, 5);

  // C. Upcoming Reminders
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const upcomingReminders = reminders
    .filter(r => !r.is_completed)
    .sort((a, b) => a.reminder_date.localeCompare(b.reminder_date))
    .slice(0, 4);

  // D. Recent Activity Feed
  const activityItems = [];
  products.forEach(p => {
    activityItems.push({
      type: 'product',
      title: `Registered "${p.name}"`,
      time: p.created_at || p.purchase_date,
      dateStr: formatDate(p.purchase_date),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>'
    });
  });
  receipts.forEach(r => {
    activityItems.push({
      type: 'receipt',
      title: `Attached receipt "${r.file_name}"`,
      time: r.uploaded_at,
      dateStr: formatDate(r.uploaded_at.split('T')[0]),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>'
    });
  });
  repairs.forEach(rep => {
    activityItems.push({
      type: 'repair',
      title: `Logged repair (${rep.status.replace('_', ' ')})`,
      time: rep.created_at || rep.repair_date,
      dateStr: formatDate(rep.repair_date),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>'
    });
  });
  claims.forEach(c => {
    activityItems.push({
      type: 'claim',
      title: `Claim filed (${c.status.replace('_', ' ')})`,
      time: c.created_at || c.claim_date,
      dateStr: formatDate(c.claim_date),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>'
    });
  });
  activityItems.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const recentActivities = activityItems.slice(0, 5);

  // E. Product Categories
  const categoryCounts = {};
  products.forEach(p => {
    const c = p.category || 'Other';
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
  });

  container.innerHTML = `
    <div class="view-section">
      <!-- Welcome Header -->
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Purchase & Warranty Portfolio</h2>
          <p>Never lose a warranty again. All product data and digital receipts are stored locally on your device.</p>
        </div>

        <div class="section-controls">
          <button id="dash-quick-add-btn" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Register Product</span>
          </button>
        </div>
      </div>

      <!-- Real Calculated Statistics -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total Registered</div>
          <div class="stat-value tabular-nums">${totalProducts}</div>
          <div class="stat-subtext">Portfolio devices & assets</div>
        </div>
        <div class="stat-card active-warranty">
          <div class="stat-label">Active Warranties</div>
          <div class="stat-value tabular-nums">${activeWarranties}</div>
          <div class="stat-subtext">> ${getSetting('expiryWarningDays')} days remaining</div>
        </div>
        <div class="stat-card expiring-soon">
          <div class="stat-label">Expiring Soon</div>
          <div class="stat-value tabular-nums">${expiringSoon}</div>
          <div class="stat-subtext">Within ${getSetting('expiryWarningDays')} days</div>
        </div>
        <div class="stat-card expired-warranty">
          <div class="stat-label">Expired Warranties</div>
          <div class="stat-value tabular-nums">${expiredWarranties}</div>
          <div class="stat-subtext">Coverage lapsed</div>
        </div>
        <div class="stat-card" style="border-left: 3px solid #818cf8;">
          <div class="stat-label">Under Repair</div>
          <div class="stat-value tabular-nums" style="color: #818cf8;">${productsUnderRepair}</div>
          <div class="stat-subtext">Active service orders</div>
        </div>
        <div class="stat-card" style="border-left: 3px solid var(--accent-cyan);">
          <div class="stat-label">Open Claims</div>
          <div class="stat-value tabular-nums" style="color: var(--accent-cyan);">${openClaims}</div>
          <div class="stat-subtext">RMA / tickets under review</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Purchase Value</div>
          <div class="stat-value tabular-nums">${formatCurrency(totalPurchaseValue)}</div>
          <div class="stat-subtext">Across all registered products</div>
        </div>
      </div>

      <!-- Main Dashboard Grid -->
      <div class="dashboard-grid-2col">
        <!-- Left Column: A. Expiry Timeline & B. Recent Purchases -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- A. Warranty Expiry Timeline -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Warranty Expiry Timeline</h3>
                <span class="card-subtitle">Approaching deadlines sorted by priority</span>
              </div>
              <a href="#warranty" class="text-link">Full Tracker →</a>
            </div>

            ${timelineProducts.length > 0 ? `
              <div class="expiry-timeline-list">
                ${timelineProducts.map(p => {
                  const days = p.warrantyInfo.daysRemaining;
                  let fillPercent = 100;
                  if (days <= 0) fillPercent = 100;
                  else if (days < 365) fillPercent = Math.max(Math.min((days / 365) * 100, 100), 5);

                  let barClass = 'active';
                  if (p.warrantyInfo.status === WARRANTY_STATUS.EXPIRING_SOON) barClass = 'expiring';
                  else if (p.warrantyInfo.status === WARRANTY_STATUS.EXPIRED) barClass = 'expired';

                  return `
                    <div class="timeline-item dash-timeline-item" data-id="${escapeHtml(p.id)}" style="cursor: pointer;">
                      <div class="timeline-product-meta">
                        <div class="timeline-product-name">${escapeHtml(p.name)}</div>
                        <div class="timeline-product-details">
                          <span>${escapeHtml(p.brand || 'Unbranded')}</span>
                          <span>·</span>
                          <span class="tabular-nums">Expires ${formatDate(p.warranty_end)}</span>
                        </div>
                      </div>

                      <div class="timeline-progress-wrap">
                        <div class="timeline-bar">
                          <div class="timeline-fill ${barClass}" style="width: ${fillPercent}%;"></div>
                        </div>
                        <div class="timeline-days tabular-nums" style="color: ${p.warrantyInfo.color};">
                          ${formatRemainingDays(days)}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="empty-state" style="padding: 24px;">
                <div class="empty-desc">No active warranties registered yet.</div>
              </div>
            `}
          </div>

          <!-- B. Recent Purchases -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Recent Purchases</h3>
                <span class="card-subtitle">Newly added hardware & home assets</span>
              </div>
              <a href="#products" class="text-link">View All Products →</a>
            </div>

            ${recentPurchases.length > 0 ? `
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Purchase Date</th>
                      <th>Price</th>
                      <th>Warranty</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentPurchases.map(p => `
                      <tr class="dash-recent-row" data-id="${escapeHtml(p.id)}" style="cursor: pointer;">
                        <td>
                          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.name)}</div>
                          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(p.brand || '—')}</div>
                        </td>
                        <td><span style="font-size: 0.76rem; color: var(--text-secondary);">${escapeHtml(p.category)}</span></td>
                        <td class="tabular-nums">${formatDate(p.purchase_date)}</td>
                        <td class="tabular-nums font-semibold">${formatCurrency(p.purchase_price)}</td>
                        <td>
                          <span class="product-status-tag ${p.warrantyInfo.cssClass}">
                            ${escapeHtml(p.warrantyInfo.label)}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="empty-state" style="padding: 24px;">
                <div class="empty-desc">Your portfolio is empty. Register your first product to get started.</div>
              </div>
            `}
          </div>
        </div>

        <!-- Right Column: C. Reminders, D. Activity, E. Categories -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- C. Upcoming Reminders -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Approaching Deadlines</h3>
                <span class="card-subtitle">Critical warranty & service alerts</span>
              </div>
              <a href="#reminders" class="text-link">Reminder Center →</a>
            </div>

            ${upcomingReminders.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${upcomingReminders.map(r => `
                  <div style="padding: 10px 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(r.title)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Due: <strong class="tabular-nums">${formatDate(r.reminder_date)}</strong></div>
                    </div>
                    <span class="status-badge requested" style="font-size: 0.68rem;">Scheduled</span>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="font-size: 0.8rem; color: var(--text-muted); padding: 16px; text-align: center;">
                No urgent deadlines pending.
              </div>
            `}
          </div>

          <!-- D. Recent Activity -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Recent Activity</h3>
                <span class="card-subtitle">Log of receipts, claims, and updates</span>
              </div>
            </div>

            ${recentActivities.length > 0 ? `
              <div class="activity-list">
                ${recentActivities.map(act => `
                  <div class="activity-item">
                    <div class="activity-icon">${act.icon}</div>
                    <div class="activity-content">
                      <div class="activity-text">${escapeHtml(act.title)}</div>
                      <div class="activity-time tabular-nums">${act.dateStr}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="font-size: 0.8rem; color: var(--text-muted); padding: 16px; text-align: center;">
                No activity recorded yet.
              </div>
            `}
          </div>

          <!-- E. Product Categories -->
          <div class="card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Product Categories</h3>
                <span class="card-subtitle">Portfolio distribution</span>
              </div>
            </div>

            <div class="category-badges-grid">
              ${Object.keys(categoryCounts).map(cat => `
                <div class="category-chip dash-category-chip" data-category="${escapeHtml(cat)}">
                  <div class="category-chip-name">${escapeHtml(cat)}</div>
                  <div class="category-chip-count tabular-nums">${categoryCounts[cat]} ${categoryCounts[cat] === 1 ? 'item' : 'items'}</div>
                </div>
              `).join('')}
              ${Object.keys(categoryCounts).length === 0 ? `
                <div style="font-size: 0.8rem; color: var(--text-muted); padding: 10px; grid-column: span 2;">No categories registered.</div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach dashboard listeners
  document.getElementById('dash-quick-add-btn')?.addEventListener('click', () => {
    openAddEditProductModal(null, () => {
      refreshNavBadges();
      handleRoute();
    });
  });

  document.querySelectorAll('.dash-timeline-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });

  document.querySelectorAll('.dash-recent-row').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });

  document.querySelectorAll('.dash-category-chip').forEach(el => {
    el.addEventListener('click', () => {
      window.location.hash = '#products';
    });
  });
}
