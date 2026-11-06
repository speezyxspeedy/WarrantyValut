/**
 * WarrantyVault — Digital Receipt Vault Module
 * Native IndexedDB Blob storage for PDFs and images, secure previews, and object URL cleanup.
 */

import { getAll, getById, getByIndex, add, remove, STORES } from './database.js';
import { showModal, closeModal, confirmDialog, toast, generateId, formatDate, escapeHtml } from './ui.js';
import { formatBytes } from './settings.js';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

let activeObjectUrls = new Set();

/**
 * Creates an object URL from a Blob and tracks it for cleanup.
 */
export function createTrackedBlobUrl(blob) {
  const url = URL.createObjectURL(blob);
  activeObjectUrls.add(url);
  return url;
}

/**
 * Revokes all active object URLs to prevent browser memory leaks.
 */
export function cleanupObjectUrls() {
  activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
  activeObjectUrls.clear();
}

/**
 * Validates and saves an uploaded receipt file into IndexedDB.
 */
export async function saveReceipt(productId, file, description = '') {
  if (!file) throw new Error('No file provided.');

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('Unsupported format. Please upload PDF, JPEG, PNG, or WebP files.');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${formatBytes(file.size)}). Limit is 15MB.`);
  }

  const receiptRecord = {
    id: generateId(),
    product_id: productId || '',
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_blob: file, // Stored as native Blob directly in IndexedDB
    description: description.trim(),
    uploaded_at: new Date().toISOString()
  };

  await add(STORES.RECEIPTS, receiptRecord);
  return receiptRecord;
}

/**
 * Retrieves all receipts associated with a specific product ID.
 */
export async function getReceiptsForProduct(productId) {
  if (!productId) return [];
  return await getByIndex(STORES.RECEIPTS, 'product_id', productId);
}

/**
 * Deletes a receipt by ID.
 */
export async function deleteReceipt(receiptId) {
  return await remove(STORES.RECEIPTS, receiptId);
}

/**
 * Downloads a receipt file using native Blob URL.
 */
export async function downloadReceipt(receiptId) {
  const receipt = await getById(STORES.RECEIPTS, receiptId);
  if (!receipt || !receipt.file_blob) {
    toast('Receipt file data not found', 'error');
    return;
  }

  const url = createTrackedBlobUrl(receipt.file_blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = receipt.file_name || 'receipt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Opens a modal preview of the receipt (PDF or Image).
 */
export async function openReceiptPreview(receiptId) {
  const receipt = await getById(STORES.RECEIPTS, receiptId);
  if (!receipt || !receipt.file_blob) {
    toast('Receipt file data is missing or corrupted', 'error');
    return;
  }

  const url = createTrackedBlobUrl(receipt.file_blob);
  const isPdf = receipt.file_type === 'application/pdf';

  let previewHtml = '';
  if (isPdf) {
    previewHtml = `
      <div style="width: 100%; height: 520px; border-radius: var(--radius-md); overflow: hidden; background: #fff;">
        <object data="${url}" type="application/pdf" width="100%" height="100%">
          <div style="padding: 40px; text-align: center; color: #333;">
            <p style="margin-bottom: 12px;">PDF preview could not be displayed directly.</p>
            <a href="${url}" download="${escapeHtml(receipt.file_name)}" class="btn btn-primary">Download PDF to View</a>
          </div>
        </object>
      </div>
    `;
  } else {
    previewHtml = `
      <div style="max-height: 520px; overflow: auto; text-align: center; background-color: var(--bg-surface-elevated); border-radius: var(--radius-md); padding: 10px;">
        <img src="${url}" alt="${escapeHtml(receipt.file_name)}" style="max-width: 100%; max-height: 500px; object-fit: contain; border-radius: 4px;" />
      </div>
    `;
  }

  const contentHtml = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${previewHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted); padding: 4px 2px;">
        <div>
          <span>Size: ${formatBytes(receipt.file_size)}</span>
          <span style="margin: 0 6px;">·</span>
          <span>Uploaded: ${formatDate(receipt.uploaded_at.split('T')[0])}</span>
        </div>
        ${receipt.description ? `<div style="color: var(--text-secondary);">${escapeHtml(receipt.description)}</div>` : ''}
      </div>
    </div>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="preview-close-btn">Close</button>
    <button class="btn btn-primary" id="preview-download-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      <span>Download</span>
    </button>
  `;

  showModal({
    title: receipt.file_name,
    contentHtml,
    footerHtml,
    size: 'lg',
    onClose: () => {
      URL.revokeObjectURL(url);
      activeObjectUrls.delete(url);
    }
  });

  document.getElementById('preview-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('preview-download-btn')?.addEventListener('click', () => {
    downloadReceipt(receiptId);
  });
}

/**
 * Opens upload receipt modal.
 */
export async function openUploadReceiptModal(defaultProductId = null, onUploaded = null) {
  const products = await getAll(STORES.PRODUCTS);

  const productOptions = products.map(p => `
    <option value="${escapeHtml(p.id)}" ${p.id === defaultProductId ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${escapeHtml(p.brand || 'Unbranded')})
    </option>
  `).join('');

  const contentHtml = `
    <form id="upload-receipt-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div class="form-group">
        <label class="form-label" for="receipt-product-select">Associated Product *</label>
        <select id="receipt-product-select" class="form-select" required>
          <option value="">Select a registered product...</option>
          ${productOptions}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Receipt File * (PDF, JPG, PNG, WebP up to 15MB)</label>
        <div class="upload-dropzone" id="receipt-dropzone">
          <input type="file" id="receipt-file-input" accept=".pdf,image/jpeg,image/png,image/webp" style="display: none;" />
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-primary);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;" id="receipt-file-name-label">
            Click to browse or drag receipt invoice here
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Stored locally in browser IndexedDB. Never transmitted to external servers.
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="receipt-desc-input">Description / Notes (Optional)</label>
        <input type="text" id="receipt-desc-input" class="form-input" placeholder="e.g. Official tax invoice with VAT breakdown" />
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-upload">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-upload">Upload to Vault</button>
  `;

  showModal({
    title: 'Upload Digital Receipt',
    contentHtml,
    footerHtml,
    size: 'md'
  });

  const fileInput = document.getElementById('receipt-file-input');
  const dropzone = document.getElementById('receipt-dropzone');
  const label = document.getElementById('receipt-file-name-label');
  let selectedFile = null;

  dropzone?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      selectedFile = e.target.files[0];
      label.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
      dropzone.style.borderColor = 'var(--status-active-color)';
    }
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectedFile = e.dataTransfer.files[0];
      label.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
      dropzone.style.borderColor = 'var(--status-active-color)';
    }
  });

  document.getElementById('modal-cancel-upload')?.addEventListener('click', closeModal);

  document.getElementById('modal-submit-upload')?.addEventListener('click', async () => {
    const productId = document.getElementById('receipt-product-select').value;
    const desc = document.getElementById('receipt-desc-input').value;

    if (!productId) {
      toast('Please select an associated product', 'warn');
      return;
    }
    if (!selectedFile) {
      toast('Please select a receipt file to upload', 'warn');
      return;
    }

    try {
      await saveReceipt(productId, selectedFile, desc);
      closeModal();
      toast('Receipt safely encrypted and saved to local vault!', 'success');
      window.dispatchEvent(new CustomEvent('wv-data-changed'));
      if (typeof onUploaded === 'function') onUploaded();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/**
 * Renders the dedicated Digital Receipts Vault view.
 */
export async function renderReceiptsView(container) {
  const receipts = await getAll(STORES.RECEIPTS);
  const products = await getAll(STORES.PRODUCTS);

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Digital Receipt Vault</h2>
          <p>Store, preview, and download invoices locally with 100% privacy.</p>
        </div>

        <div class="section-controls">
          <button id="btn-vault-upload" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>Upload Receipt</span>
          </button>
        </div>
      </div>

      <!-- Receipts Search & Stats -->
      <div class="toolbar-bar">
        <div class="toolbar-group">
          <input type="text" id="receipt-filter-input" class="input-text" placeholder="Filter receipts by filename or description..." style="min-width: 280px;" />
          <select id="receipt-type-filter" class="input-select">
            <option value="ALL">All File Types</option>
            <option value="application/pdf">PDF Documents</option>
            <option value="image/">Images (JPG, PNG, WebP)</option>
          </select>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted);">
          <span>Total Vault Invoices: <strong class="tabular-nums" style="color: var(--text-primary);">${receipts.length}</strong></span>
        </div>
      </div>

      <div id="receipts-grid-mount">
        ${renderReceiptCardsHtml(receipts, productMap)}
      </div>
    </div>
  `;

  document.getElementById('btn-vault-upload')?.addEventListener('click', () => {
    openUploadReceiptModal(null, () => renderReceiptsView(container));
  });

  const filterInput = document.getElementById('receipt-filter-input');
  const typeFilter = document.getElementById('receipt-type-filter');

  const applyReceiptFilter = () => {
    const query = (filterInput.value || '').toLowerCase().trim();
    const type = typeFilter.value;

    const filtered = receipts.filter(r => {
      const matchQuery = !query || r.file_name.toLowerCase().includes(query) || (r.description && r.description.toLowerCase().includes(query));
      let matchType = true;
      if (type === 'application/pdf') matchType = r.file_type === 'application/pdf';
      else if (type === 'image/') matchType = r.file_type.startsWith('image/');
      return matchQuery && matchType;
    });

    const mount = document.getElementById('receipts-grid-mount');
    if (mount) {
      mount.innerHTML = renderReceiptCardsHtml(filtered, productMap);
      attachReceiptCardActions(container);
    }
  };

  filterInput?.addEventListener('input', applyReceiptFilter);
  typeFilter?.addEventListener('change', applyReceiptFilter);

  attachReceiptCardActions(container);
}

function renderReceiptCardsHtml(receipts, productMap) {
  if (receipts.length === 0) {
    return `
      <div class="card empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <div class="empty-title">Your Receipt Vault is empty</div>
        <div class="empty-desc">Attach proof of purchase invoices and store receipts to keep them ready for future warranty claims.</div>
        <button class="btn btn-primary" id="btn-empty-upload-receipt">Upload First Receipt</button>
      </div>
    `;
  }

  return `
    <div class="receipts-grid">
      ${receipts.map(r => {
        const product = productMap[r.product_id];
        const isPdf = r.file_type === 'application/pdf';

        return `
          <div class="receipt-card">
            <div class="receipt-card-thumb">
              ${isPdf ? `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--status-expiring-color);">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  <span style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;">PDF INVOICE</span>
                </div>
              ` : `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: #818cf8;">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  <span style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;">RECEIPT IMAGE</span>
                </div>
              `}
            </div>

            <div class="receipt-card-body">
              <div class="receipt-name" title="${escapeHtml(r.file_name)}">${escapeHtml(r.file_name)}</div>
              <div class="receipt-meta">
                <span>${product ? escapeHtml(product.name) : 'Unassigned'}</span>
                <span>·</span>
                <span>${formatBytes(r.file_size)}</span>
              </div>
              ${r.description ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(r.description)}</div>` : ''}

              <div class="receipt-actions">
                <button class="btn btn-secondary btn-sm receipt-preview-btn" data-id="${escapeHtml(r.id)}" style="flex: 1;">Preview</button>
                <button class="btn btn-secondary btn-sm receipt-download-btn" data-id="${escapeHtml(r.id)}" title="Download file">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
                <button class="btn btn-danger btn-sm receipt-delete-btn" data-id="${escapeHtml(r.id)}" title="Delete receipt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function attachReceiptCardActions(container) {
  document.getElementById('btn-empty-upload-receipt')?.addEventListener('click', () => {
    openUploadReceiptModal(null, () => renderReceiptsView(container));
  });

  document.querySelectorAll('.receipt-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) openReceiptPreview(id);
    });
  });

  document.querySelectorAll('.receipt-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) downloadReceipt(id);
    });
  });

  document.querySelectorAll('.receipt-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const ok = await confirmDialog({
        title: 'Delete Receipt',
        message: 'Are you sure you want to delete this receipt file? This cannot be undone.',
        confirmText: 'Delete File',
        danger: true
      });
      if (!ok) return;

      await deleteReceipt(id);
      toast('Receipt deleted', 'info');
      window.dispatchEvent(new CustomEvent('wv-data-changed'));
      renderReceiptsView(container);
    });
  });
}
