/**
 * WarrantyVault — Warranty Tracking Engine & Calendar
 * Bulletproof timezone-safe calendar math, leap-year calculations, and status classification.
 */

import { getAll, STORES } from './database.js';
import { getSetting } from './settings.js';
import { formatDate, escapeHtml } from './ui.js';
import { openProductDetailModal } from './products.js';

export const WARRANTY_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  NO_WARRANTY: 'NO_WARRANTY'
};

/**
 * Normalizes a date string or Date object to a UTC midnight timestamp to avoid timezone shifts.
 */
export function parseDateToUtcMidnight(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return Date.UTC(year, month, day);
}

/**
 * Calculates current warranty status and days remaining.
 */
export function calculateWarrantyStatus(product, customWarningDays = null) {
  if (!product || !product.warranty_end || product.warranty_duration === 0) {
    return {
      status: WARRANTY_STATUS.NO_WARRANTY,
      daysRemaining: null,
      label: 'No Warranty',
      cssClass: 'no_warranty',
      color: 'var(--status-neutral-color)'
    };
  }

  const warningDays = customWarningDays !== null ? customWarningDays : (getSetting('expiryWarningDays') || 30);

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const endUtc = parseDateToUtcMidnight(product.warranty_end);

  if (!endUtc) {
    return {
      status: WARRANTY_STATUS.NO_WARRANTY,
      daysRemaining: null,
      label: 'No Warranty',
      cssClass: 'no_warranty',
      color: 'var(--text-muted)'
    };
  }

  const diffMs = endUtc - todayUtc;
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return {
      status: WARRANTY_STATUS.EXPIRED,
      daysRemaining,
      label: 'Expired',
      cssClass: 'expired',
      color: 'var(--status-expired-color)'
    };
  } else if (daysRemaining <= warningDays) {
    return {
      status: WARRANTY_STATUS.EXPIRING_SOON,
      daysRemaining,
      label: 'Expiring Soon',
      cssClass: 'expiring',
      color: 'var(--status-expiring-color)'
    };
  } else {
    return {
      status: WARRANTY_STATUS.ACTIVE,
      daysRemaining,
      label: 'Active',
      cssClass: 'active',
      color: 'var(--status-active-color)'
    };
  }
}

/**
 * Computes warranty end date safely handling month-ends and leap years.
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {number} duration
 * @param {string} unit - 'months' or 'years'
 * @returns {string} - YYYY-MM-DD
 */
export function computeWarrantyEnd(startDateStr, duration, unit) {
  if (!startDateStr || !duration || duration <= 0) return '';
  const parts = startDateStr.split('-');
  if (parts.length !== 3) return '';

  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10); // 1-12
  let day = parseInt(parts[2], 10);

  if (unit === 'years') {
    year += parseInt(duration, 10);
    // Check leap year handling for Feb 29
    if (month === 2 && day === 29) {
      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (!isLeapYear) {
        day = 28;
      }
    }
  } else {
    // months
    const totalMonths = month - 1 + parseInt(duration, 10);
    year += Math.floor(totalMonths / 12);
    month = (totalMonths % 12) + 1;

    // Check maximum days in target month
    const daysInTargetMonth = new Date(year, month, 0).getDate();
    if (day > daysInTargetMonth) {
      day = daysInTargetMonth;
    }
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Format remaining days into human-friendly text.
 */
export function formatRemainingDays(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) return 'No warranty date';
  if (daysRemaining < 0) {
    const abs = Math.abs(daysRemaining);
    return abs === 1 ? 'Expired 1 day ago' : `Expired ${abs} days ago`;
  }
  if (daysRemaining === 0) return 'Expires today';
  if (daysRemaining === 1) return '1 day remaining';
  if (daysRemaining < 30) return `${daysRemaining} days remaining`;

  const months = Math.floor(daysRemaining / 30.44);
  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'} remaining`;
  }
  const years = (daysRemaining / 365.25).toFixed(1);
  return `${years} years remaining`;
}

/**
 * State for interactive calendar navigation.
 */
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11
let currentTrackerFilter = 'ALL';
let currentTrackerView = 'LIST'; // 'LIST' or 'CALENDAR'

/**
 * Renders the Warranty Tracker Module.
 */
export async function renderWarrantyTrackerView(container) {
  const products = await getAll(STORES.PRODUCTS);

  // Classify products
  const classified = products.map(p => {
    const info = calculateWarrantyStatus(p);
    return { ...p, warrantyInfo: info };
  });

  const activeCount = classified.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.ACTIVE).length;
  const expiringCount = classified.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.EXPIRING_SOON).length;
  const expiredCount = classified.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.EXPIRED).length;
  const noWarrantyCount = classified.filter(p => p.warrantyInfo.status === WARRANTY_STATUS.NO_WARRANTY).length;

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Warranty Tracker</h2>
          <p>Monitor active coverage, expiring deadlines, and warranty calendar schedules.</p>
        </div>

        <div class="section-controls">
          <div class="segmented-control">
            <button class="segment-btn ${currentTrackerView === 'LIST' ? 'active' : ''}" id="tracker-view-list">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span>List View</span>
            </button>
            <button class="segment-btn ${currentTrackerView === 'CALENDAR' ? 'active' : ''}" id="tracker-view-cal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>Expiry Calendar</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="stat-card active-warranty" style="cursor: pointer;" id="filter-stat-active">
          <div class="stat-label">Active Coverage</div>
          <div class="stat-value tabular-nums">${activeCount}</div>
          <div class="stat-subtext">> ${getSetting('expiryWarningDays')} days remaining</div>
        </div>
        <div class="stat-card expiring-soon" style="cursor: pointer;" id="filter-stat-expiring">
          <div class="stat-label">Expiring Soon</div>
          <div class="stat-value tabular-nums">${expiringCount}</div>
          <div class="stat-subtext">Within ${getSetting('expiryWarningDays')} days</div>
        </div>
        <div class="stat-card expired-warranty" style="cursor: pointer;" id="filter-stat-expired">
          <div class="stat-label">Expired Warranties</div>
          <div class="stat-value tabular-nums">${expiredCount}</div>
          <div class="stat-subtext">Past coverage period</div>
        </div>
        <div class="stat-card" style="cursor: pointer;" id="filter-stat-nowarranty">
          <div class="stat-label">No Warranty Info</div>
          <div class="stat-value tabular-nums">${noWarrantyCount}</div>
          <div class="stat-subtext">As-is / Not registered</div>
        </div>
      </div>

      <!-- Main Content Area: List or Calendar -->
      <div id="tracker-content-mount">
        ${currentTrackerView === 'LIST' ? renderTrackerListHtml(classified) : renderTrackerCalendarHtml(classified)}
      </div>
    </div>
  `;

  // Attach controls
  document.getElementById('tracker-view-list')?.addEventListener('click', () => {
    currentTrackerView = 'LIST';
    renderWarrantyTrackerView(container);
  });

  document.getElementById('tracker-view-cal')?.addEventListener('click', () => {
    currentTrackerView = 'CALENDAR';
    renderWarrantyTrackerView(container);
  });

  // Filter clicks from stats
  document.getElementById('filter-stat-active')?.addEventListener('click', () => setTrackerFilter(WARRANTY_STATUS.ACTIVE, container));
  document.getElementById('filter-stat-expiring')?.addEventListener('click', () => setTrackerFilter(WARRANTY_STATUS.EXPIRING_SOON, container));
  document.getElementById('filter-stat-expired')?.addEventListener('click', () => setTrackerFilter(WARRANTY_STATUS.EXPIRED, container));
  document.getElementById('filter-stat-nowarranty')?.addEventListener('click', () => setTrackerFilter(WARRANTY_STATUS.NO_WARRANTY, container));

  // Wire list item clicks
  attachTrackerRowClickHandlers();
  attachCalendarNavHandlers(container);
}

function setTrackerFilter(status, container) {
  currentTrackerFilter = (currentTrackerFilter === status) ? 'ALL' : status;
  currentTrackerView = 'LIST';
  renderWarrantyTrackerView(container);
}

function renderTrackerListHtml(classified) {
  let filtered = classified;
  if (currentTrackerFilter !== 'ALL') {
    filtered = classified.filter(p => p.warrantyInfo.status === currentTrackerFilter);
  }

  // Sort by earliest expiration first (active/expiring), then expired
  filtered.sort((a, b) => {
    if (a.warrantyInfo.daysRemaining === null) return 1;
    if (b.warrantyInfo.daysRemaining === null) return -1;
    return a.warrantyInfo.daysRemaining - b.warrantyInfo.daysRemaining;
  });

  if (filtered.length === 0) {
    return `
      <div class="card empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <div class="empty-title">No products found for this warranty filter</div>
        <div class="empty-desc">Clear your filter or add a new purchase with warranty coverage details.</div>
      </div>
    `;
  }

  return `
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Purchase Date</th>
            <th>Warranty Start</th>
            <th>Warranty Expiry</th>
            <th>Remaining Days</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => `
            <tr class="tracker-row" data-id="${escapeHtml(p.id)}" style="cursor: pointer;">
              <td>
                <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.name)}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(p.brand || '—')} · ${escapeHtml(p.model || '')}</div>
              </td>
              <td><span style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(p.category)}</span></td>
              <td class="tabular-nums">${formatDate(p.purchase_date)}</td>
              <td class="tabular-nums">${formatDate(p.warranty_start || p.purchase_date)}</td>
              <td class="tabular-nums font-semibold" style="color: ${p.warrantyInfo.color};">${formatDate(p.warranty_end)}</td>
              <td class="tabular-nums" style="font-weight: 600; color: ${p.warrantyInfo.color};">
                ${formatRemainingDays(p.warrantyInfo.daysRemaining)}
              </td>
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
  `;
}

function renderTrackerCalendarHtml(classified) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate();

  const now = new Date();
  const isCurrentMonth = (now.getFullYear() === calendarYear && now.getMonth() === calendarMonth);
  const todayDate = now.getDate();

  // Map products to date strings
  const expiringMap = {};
  classified.forEach(p => {
    if (p.warranty_end) {
      if (!expiringMap[p.warranty_end]) expiringMap[p.warranty_end] = [];
      expiringMap[p.warranty_end].push(p);
    }
  });

  const cells = [];

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({ day, isOther: true, dateStr: '' });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(calendarMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${calendarYear}-${mm}-${dd}`;
    const items = expiringMap[dateStr] || [];
    cells.push({
      day: d,
      isOther: false,
      isToday: (isCurrentMonth && d === todayDate),
      dateStr,
      items
    });
  }

  // Next month leading days to complete full 7-col rows
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let n = 1; n <= remaining; n++) {
    cells.push({ day: n, isOther: true, dateStr: '' });
  }

  return `
    <div class="calendar-card">
      <div class="calendar-header">
        <h3 class="calendar-month-title">${monthNames[calendarMonth]} ${calendarYear}</h3>
        <div class="calendar-nav-buttons">
          <button class="btn btn-secondary btn-sm" id="cal-prev-month">‹ Prev Month</button>
          <button class="btn btn-secondary btn-sm" id="cal-today">Today</button>
          <button class="btn btn-secondary btn-sm" id="cal-next-month">Next Month ›</button>
        </div>
      </div>

      <div class="calendar-grid">
        <div class="calendar-day-header">Sun</div>
        <div class="calendar-day-header">Mon</div>
        <div class="calendar-day-header">Tue</div>
        <div class="calendar-day-header">Wed</div>
        <div class="calendar-day-header">Thu</div>
        <div class="calendar-day-header">Fri</div>
        <div class="calendar-day-header">Sat</div>

        ${cells.map(c => {
          if (c.isOther) {
            return `
              <div class="calendar-day-cell other-month">
                <span class="calendar-day-number">${c.day}</span>
              </div>
            `;
          }
          return `
            <div class="calendar-day-cell ${c.isToday ? 'today' : ''}">
              <div class="calendar-day-number">${c.day}</div>
              ${(c.items || []).map(item => `
                <div class="calendar-event-item ${item.warrantyInfo.cssClass} cal-event" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name)} — ${escapeHtml(item.warrantyInfo.label)}">
                  ${escapeHtml(item.name)}
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function attachTrackerRowClickHandlers() {
  document.querySelectorAll('.tracker-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });

  document.querySelectorAll('.cal-event').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });
}

function attachCalendarNavHandlers(container) {
  document.getElementById('cal-prev-month')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderWarrantyTrackerView(container);
  });

  document.getElementById('cal-next-month')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    renderWarrantyTrackerView(container);
  });

  document.getElementById('cal-today')?.addEventListener('click', () => {
    calendarYear = new Date().getFullYear();
    calendarMonth = new Date().getMonth();
    renderWarrantyTrackerView(container);
  });
}
