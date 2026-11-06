/**
 * WarrantyVault — Smart Reminder Engine & In-App Notification Center
 * Derived strictly from real product expiration dates and custom user schedules.
 */

import { getAll, getById, getByIndex, add, put, remove, STORES } from './database.js';
import { getSetting } from './settings.js';
import { showModal, closeModal, confirmDialog, toast, generateId, formatDate, escapeHtml } from './ui.js';
import { parseDateToUtcMidnight } from './warranty.js';
import { openProductDetailModal } from './products.js';

export const REMINDER_TYPES = {
  WARRANTY_EXPIRY: 'WARRANTY_EXPIRY',
  SERVICE: 'SERVICE',
  REPAIR_COMPLETION: 'REPAIR_COMPLETION',
  CUSTOM: 'CUSTOM'
};

/**
 * Synchronizes auto-generated expiry reminders for a product based on user settings.
 */
export async function syncRemindersForProduct(product) {
  if (!product || !product.warranty_end || product.warranty_duration === 0) {
    return;
  }

  const intervals = getSetting('reminderIntervals') || [30, 7, 1, 0];
  const endUtc = parseDateToUtcMidnight(product.warranty_end);
  if (!endUtc) return;

  const existingReminders = await getByIndex(STORES.REMINDERS, 'product_id', product.id);

  for (const daysBefore of intervals) {
    const reminderUtc = endUtc - (daysBefore * 24 * 60 * 60 * 1000);
    const remDateObj = new Date(reminderUtc);
    const yyyy = remDateObj.getUTCFullYear();
    const mm = String(remDateObj.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(remDateObj.getUTCDate()).padStart(2, '0');
    const reminderDateStr = `${yyyy}-${mm}-${dd}`;

    // Check if duplicate already exists
    const duplicate = existingReminders.find(r => 
      r.reminder_type === REMINDER_TYPES.WARRANTY_EXPIRY &&
      r.reminder_date === reminderDateStr
    );

    if (!duplicate) {
      const title = daysBefore === 0
        ? `Warranty expires TODAY: ${product.name}`
        : `Warranty expires in ${daysBefore} days: ${product.name}`;

      const description = `Warranty coverage registered under ${product.brand || 'product'} expires on ${product.warranty_end}. Verify condition or file claim if repairs are needed.`;

      await add(STORES.REMINDERS, {
        id: generateId(),
        product_id: product.id,
        reminder_type: REMINDER_TYPES.WARRANTY_EXPIRY,
        reminder_date: reminderDateStr,
        days_before: daysBefore,
        title,
        description,
        is_read: false,
        is_completed: false,
        created_at: new Date().toISOString()
      });
    }
  }
}

/**
 * Counts unread in-app notifications.
 */
export async function getUnreadRemindersCount() {
  const reminders = await getAll(STORES.REMINDERS);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // Only count reminders whose date is on or before today and unread
  return reminders.filter(r => !r.is_read && r.reminder_date <= todayStr).length;
}

/**
 * Mark a single reminder as read.
 */
export async function markReminderRead(reminderId) {
  const r = await getById(STORES.REMINDERS, reminderId);
  if (r) {
    r.is_read = true;
    await put(STORES.REMINDERS, r);
  }
}

/**
 * Mark all reminders as read.
 */
export async function markAllRemindersRead() {
  const reminders = await getAll(STORES.REMINDERS);
  for (const r of reminders) {
    if (!r.is_read) {
      r.is_read = true;
      await put(STORES.REMINDERS, r);
    }
  }
  updateNotificationBadges();
}

/**
 * Mark reminder as completed.
 */
export async function toggleReminderCompleted(reminderId, isCompleted) {
  const r = await getById(STORES.REMINDERS, reminderId);
  if (r) {
    r.is_completed = isCompleted;
    r.is_read = true;
    await put(STORES.REMINDERS, r);
  }
}

/**
 * Delete a reminder.
 */
export async function deleteReminder(reminderId) {
  return await remove(STORES.REMINDERS, reminderId);
}

/**
 * Update notification badge counters in DOM.
 */
export async function updateNotificationBadges() {
  const count = await getUnreadRemindersCount();
  const topBadge = document.getElementById('topbar-notification-badge');
  const mobileBadge = document.getElementById('mobile-notification-badge');
  const navBadge = document.getElementById('nav-count-reminders');

  if (topBadge) {
    topBadge.textContent = count;
    topBadge.style.display = count > 0 ? 'block' : 'none';
  }
  if (mobileBadge) {
    mobileBadge.textContent = count;
    mobileBadge.style.display = count > 0 ? 'block' : 'none';
  }
  if (navBadge) {
    navBadge.textContent = count;
    navBadge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

/**
 * Renders the topbar notification flyout list.
 */
export async function renderNotificationFlyout() {
  const listContainer = document.getElementById('notification-flyout-list');
  if (!listContainer) return;

  const reminders = await getAll(STORES.REMINDERS);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // Filter to reminders due today or overdue, sort newest first
  const activeAlerts = reminders
    .filter(r => !r.is_completed && r.reminder_date <= todayStr)
    .sort((a, b) => new Date(b.reminder_date) - new Date(a.reminder_date));

  if (activeAlerts.length === 0) {
    listContainer.innerHTML = `
      <div class="flyout-empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 6px; color: var(--status-active-color);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <div>All caught up! No overdue warranty deadlines.</div>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = activeAlerts.map(r => `
    <div class="flyout-item ${!r.is_read ? 'unread' : ''}" data-id="${escapeHtml(r.id)}" data-prod-id="${escapeHtml(r.product_id || '')}">
      <div class="flyout-item-content">
        <div class="flyout-item-title">${escapeHtml(r.title)}</div>
        <div class="flyout-item-desc">${escapeHtml(r.description)}</div>
        <div class="flyout-item-date tabular-nums">Due Date: ${formatDate(r.reminder_date)}</div>
      </div>
    </div>
  `).join('');

  listContainer.querySelectorAll('.flyout-item').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-id');
      const prodId = el.getAttribute('data-prod-id');
      if (id) await markReminderRead(id);
      updateNotificationBadges();
      const flyout = document.getElementById('notification-flyout');
      if (flyout) flyout.style.display = 'none';

      if (prodId) openProductDetailModal(prodId);
    });
  });
}

/**
 * Opens custom reminder modal.
 */
export async function openCreateCustomReminderModal(defaultProductId = null, onSaved = null) {
  const products = await getAll(STORES.PRODUCTS);

  const productOptions = products.map(p => `
    <option value="${escapeHtml(p.id)}" ${p.id === defaultProductId ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${escapeHtml(p.brand || 'Unbranded')})
    </option>
  `).join('');

  const todayStr = new Date().toISOString().split('T')[0];

  const contentHtml = `
    <form id="custom-reminder-form" class="form-grid">
      <div class="form-group col-span-2">
        <label class="form-label" for="rem-prod-select">Target Product (Optional)</label>
        <select id="rem-prod-select" class="form-select">
          <option value="">General reminder (no specific product)</option>
          ${productOptions}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="rem-type-select">Reminder Type *</label>
        <select id="rem-type-select" class="form-select">
          <option value="SERVICE">Product Service / Inspection</option>
          <option value="REPAIR_COMPLETION">Repair Pick-up Follow-up</option>
          <option value="WARRANTY_EXPIRY">Warranty Check</option>
          <option value="CUSTOM">Custom Personal Reminder</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="rem-date-input">Due Date *</label>
        <input type="date" id="rem-date-input" class="form-input" value="${todayStr}" required />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="rem-title-input">Reminder Title *</label>
        <input type="text" id="rem-title-input" class="form-input" placeholder="e.g. Annual filter replacement service for Dyson V15" required />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="rem-desc-input">Additional Notes (Optional)</label>
        <textarea id="rem-desc-input" class="form-textarea" placeholder="Instructions, part numbers, or contact phone numbers..."></textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-rem">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-rem">Create Schedule</button>
  `;

  showModal({
    title: 'Schedule Product Reminder',
    contentHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('modal-cancel-rem')?.addEventListener('click', closeModal);

  document.getElementById('modal-submit-rem')?.addEventListener('click', async () => {
    const prodId = document.getElementById('rem-prod-select').value;
    const type = document.getElementById('rem-type-select').value;
    const date = document.getElementById('rem-date-input').value;
    const title = document.getElementById('rem-title-input').value.trim();
    const desc = document.getElementById('rem-desc-input').value.trim();

    if (!title) {
      toast('Please enter a reminder title', 'warn');
      return;
    }
    if (!date) {
      toast('Please select a due date', 'warn');
      return;
    }

    await add(STORES.REMINDERS, {
      id: generateId(),
      product_id: prodId,
      reminder_type: type,
      reminder_date: date,
      title,
      description: desc,
      is_read: false,
      is_completed: false,
      created_at: new Date().toISOString()
    });

    closeModal();
    toast('Reminder scheduled successfully', 'success');
    updateNotificationBadges();
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
    if (typeof onSaved === 'function') onSaved();
  });
}

/**
 * Renders the dedicated Reminders View.
 */
export async function renderRemindersView(container) {
  const reminders = await getAll(STORES.REMINDERS);
  const products = await getAll(STORES.PRODUCTS);

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  const completed = [];

  reminders.forEach(r => {
    if (r.is_completed) {
      completed.push(r);
    } else if (r.reminder_date < todayStr) {
      overdue.push(r);
    } else if (r.reminder_date === todayStr) {
      dueToday.push(r);
    } else {
      upcoming.push(r);
    }
  });

  // Sort upcoming chronologically
  upcoming.sort((a, b) => a.reminder_date.localeCompare(b.reminder_date));
  overdue.sort((a, b) => b.reminder_date.localeCompare(a.reminder_date));

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Reminder Center</h2>
          <p>Upcoming warranty expirations, maintenance reminders, and repair follow-ups.</p>
        </div>

        <div class="section-controls">
          <button id="btn-create-reminder-top" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Schedule Custom Reminder</span>
          </button>
        </div>
      </div>

      <div class="reminder-groups">
        ${dueToday.length > 0 ? `
          <div>
            <div class="reminder-group-title" style="color: var(--status-expiring-color);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Due Today (${dueToday.length})</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${dueToday.map(r => renderReminderCard(r, 'today', productMap)).join('')}
            </div>
          </div>
        ` : ''}

        ${overdue.length > 0 ? `
          <div>
            <div class="reminder-group-title" style="color: var(--status-expired-color);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
              <span>Overdue Deadlines (${overdue.length})</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${overdue.map(r => renderReminderCard(r, 'overdue', productMap)).join('')}
            </div>
          </div>
        ` : ''}

        <div>
          <div class="reminder-group-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>
            <span>Upcoming Schedules (${upcoming.length})</span>
          </div>
          ${upcoming.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${upcoming.map(r => renderReminderCard(r, '', productMap)).join('')}
            </div>
          ` : `
            <div class="card empty-state" style="padding: 30px;">
              <div class="empty-desc">No upcoming deadlines scheduled. Expiry reminders are automatically generated when you add products.</div>
            </div>
          `}
        </div>

        ${completed.length > 0 ? `
          <div>
            <div class="reminder-group-title" style="color: var(--text-muted);">
              <span>Completed / Resolved (${completed.length})</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${completed.map(r => renderReminderCard(r, 'completed', productMap)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('btn-create-reminder-top')?.addEventListener('click', () => {
    openCreateCustomReminderModal(null, () => renderRemindersView(container));
  });

  attachReminderActionListeners(container);
}

function renderReminderCard(r, modifier, productMap) {
  const prod = productMap[r.product_id];

  return `
    <div class="reminder-card ${modifier}">
      <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1;">
        <input type="checkbox" class="reminder-complete-checkbox" data-id="${escapeHtml(r.id)}" ${r.is_completed ? 'checked' : ''} style="margin-top: 4px; cursor: pointer; transform: scale(1.15);" title="Mark as resolved / completed" />
        <div class="reminder-info">
          <div class="reminder-title" style="${r.is_completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
            ${escapeHtml(r.title)}
          </div>
          <div class="reminder-details">
            <span class="tabular-nums font-semibold">Due: ${formatDate(r.reminder_date)}</span>
            ${prod ? `<span>·</span><span>Product: <strong>${escapeHtml(prod.name)}</strong></span>` : ''}
            <span>·</span>
            <span>${escapeHtml(r.reminder_type.replace('_', ' '))}</span>
          </div>
          ${r.description ? `<div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(r.description)}</div>` : ''}
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 8px;">
        ${prod ? `<button class="btn btn-secondary btn-sm rem-view-prod-btn" data-prod-id="${escapeHtml(prod.id)}">View Product</button>` : ''}
        <button class="btn btn-danger btn-sm rem-delete-btn" data-id="${escapeHtml(r.id)}" title="Delete reminder">Delete</button>
      </div>
    </div>
  `;
}

function attachReminderActionListeners(container) {
  document.querySelectorAll('.reminder-complete-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.getAttribute('data-id');
      if (id) {
        await toggleReminderCompleted(id, cb.checked);
        toast(cb.checked ? 'Reminder marked as completed' : 'Reminder restored to active', 'info');
        updateNotificationBadges();
        renderRemindersView(container);
      }
    });
  });

  document.querySelectorAll('.rem-view-prod-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-prod-id');
      if (prodId) openProductDetailModal(prodId);
    });
  });

  document.querySelectorAll('.rem-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const ok = await confirmDialog({
        title: 'Delete Reminder',
        message: 'Remove this reminder from your schedule?',
        confirmText: 'Delete'
      });
      if (!ok) return;

      await deleteReminder(id);
      toast('Reminder removed', 'info');
      updateNotificationBadges();
      renderRemindersView(container);
    });
  });
}
