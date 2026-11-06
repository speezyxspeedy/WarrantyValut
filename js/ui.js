/**
 * WarrantyVault — UI Component & Utilities Engine
 * Accessible modals, confirmation dialogs, toasts, date/currency formatters, and HTML sanitization.
 */

import { getSetting } from './settings.js';

let activeModalCallback = null;

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Generates a unique UUID-style identifier.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'wv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Formats monetary amounts using user's configured currency symbol.
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const currencySymbol = getSetting('currency') || '$';
  return `${currencySymbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Formats a date string (YYYY-MM-DD) according to user preferences.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    const format = getSetting('dateFormat') || 'YYYY-MM-DD';

    if (format === 'MM/DD/YYYY') {
      return `${month}/${day}/${year}`;
    }
    if (format === 'DD/MM/YYYY') {
      return `${day}/${month}/${year}`;
    }
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}

/**
 * Displays an ephemeral toast message.
 */
export function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;

  const iconSvg = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
  }[type] || '';

  toastEl.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toastEl);

  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(8px)';
    toastEl.style.transition = 'all 0.25s ease';
    setTimeout(() => toastEl.remove(), 250);
  }, duration);
}

/**
 * Open a modal window.
 */
export function showModal({ title, contentHtml, footerHtml = '', size = 'md', onClose = null }) {
  const modalRoot = document.getElementById('modal-root');
  const modalContainer = document.getElementById('modal-container');
  if (!modalRoot || !modalContainer) return;

  activeModalCallback = onClose;

  modalContainer.className = `modal-container ${size === 'lg' ? 'modal-lg' : ''}`;
  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${escapeHtml(title)}</h3>
      <button class="modal-close-btn" id="modal-global-close-btn" aria-label="Close dialog">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="modal-body">
      ${contentHtml}
    </div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  `;

  modalRoot.style.display = 'flex';

  const closeBtn = document.getElementById('modal-global-close-btn');
  closeBtn?.addEventListener('click', closeModal);

  const backdrop = document.getElementById('modal-backdrop');
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  // Esc key listener
  const escListener = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escListener);
    }
  };
  document.addEventListener('keydown', escListener);
}

/**
 * Closes the active modal window.
 */
export function closeModal() {
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) {
    modalRoot.style.display = 'none';
  }
  if (typeof activeModalCallback === 'function') {
    activeModalCallback();
    activeModalCallback = null;
  }
}

/**
 * Accessible Confirmation Dialog.
 */
export function confirmDialog({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
}) {
  return new Promise((resolve) => {
    const contentHtml = `
      <div style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.5;">
        ${escapeHtml(message)}
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="confirm-modal-cancel">${escapeHtml(cancelText)}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-modal-ok">${escapeHtml(confirmText)}</button>
    `;

    showModal({
      title,
      contentHtml,
      footerHtml,
      size: 'md',
      onClose: () => resolve(false)
    });

    document.getElementById('confirm-modal-cancel')?.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });

    document.getElementById('confirm-modal-ok')?.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}

/**
 * Returns user-friendly status badge markup.
 */
export function renderStatusBadge(status, label) {
  const normalized = (status || '').toLowerCase().replace(/\s+/g, '_');
  return `<span class="status-badge ${escapeHtml(normalized)}">${escapeHtml(label || status)}</span>`;
}
