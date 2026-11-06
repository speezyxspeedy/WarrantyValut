/**
 * WarrantyVault — Backup & Restore Module
 * Full JSON export/import with binary Blob serialization, duplicate checking, and UTF-8 CSV download.
 */

import { getAll, put, clearAllData, STORES } from './database.js';
import { calculateWarrantyStatus, formatRemainingDays } from './warranty.js';
import { showModal, closeModal, confirmDialog, toast, escapeHtml } from './ui.js';

const BACKUP_VERSION = '1.0';

/**
 * Converts a Blob or File to a Base64 data URL string for JSON portability.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts a Base64 data URL string back to a binary Blob.
 */
function base64ToBlob(dataUrl, defaultMime = 'application/octet-stream') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : defaultMime;
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Exports complete JSON backup including receipts and metadata.
 */
export async function exportJsonBackup() {
  toast('Preparing complete backup archive...', 'info');

  const products = await getAll(STORES.PRODUCTS);
  const receipts = await getAll(STORES.RECEIPTS);
  const repairs = await getAll(STORES.REPAIRS);
  const claims = await getAll(STORES.CLAIMS);
  const reminders = await getAll(STORES.REMINDERS);
  const settings = await getAll(STORES.SETTINGS);

  // Encode receipt blobs safely
  const encodedReceipts = [];
  for (const r of receipts) {
    let base64Content = null;
    if (r.file_blob instanceof Blob) {
      base64Content = await blobToBase64(r.file_blob);
    }
    encodedReceipts.push({
      ...r,
      file_blob: null,
      file_base64: base64Content
    });
  }

  // Encode product images if present
  const encodedProducts = [];
  for (const p of products) {
    let imgBase64 = null;
    if (p.image_blob instanceof Blob) {
      imgBase64 = await blobToBase64(p.image_blob);
    }
    encodedProducts.push({
      ...p,
      image_blob: null,
      image_base64: imgBase64
    });
  }

  const backupPayload = {
    app: 'WarrantyVault',
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    record_counts: {
      products: encodedProducts.length,
      receipts: encodedReceipts.length,
      repairs: repairs.length,
      claims: claims.length,
      reminders: reminders.length
    },
    data: {
      products: encodedProducts,
      receipts: encodedReceipts,
      repairs,
      claims,
      reminders,
      settings
    }
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const nowStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `warrantyvault_backup_${nowStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('JSON backup exported successfully!', 'success');
}

/**
 * Imports and restores a JSON backup file with inspection preview.
 */
export async function importJsonBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    // Schema validation
    if (!payload || payload.app !== 'WarrantyVault' || !payload.data) {
      throw new Error('Invalid backup file. The selected JSON was not created by WarrantyVault.');
    }

    const { products = [], receipts = [], repairs = [], claims = [], reminders = [], settings = [] } = payload.data;

    // Check existing records for duplicates
    const existingProducts = await getAll(STORES.PRODUCTS);
    const existingIds = new Set(existingProducts.map(p => p.id));
    const duplicates = products.filter(p => existingIds.has(p.id));

    // Show Restore Preview Modal
    const contentHtml = `
      <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.85rem;">
        <div style="background-color: var(--bg-surface-elevated); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">Backup Metadata</div>
          <div style="color: var(--text-secondary); line-height: 1.5;">
            <div>Exported on: <strong>${payload.exported_at ? new Date(payload.exported_at).toLocaleString() : 'Unknown'}</strong></div>
            <div>Format Version: <strong>v${escapeHtml(payload.version || '1.0')}</strong></div>
          </div>
        </div>

        <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="stat-card" style="padding: 10px 14px;">
            <div class="stat-label">Products</div>
            <div class="stat-value tabular-nums" style="font-size: 1.3rem;">${products.length}</div>
          </div>
          <div class="stat-card" style="padding: 10px 14px;">
            <div class="stat-label">Receipt Invoices</div>
            <div class="stat-value tabular-nums" style="font-size: 1.3rem;">${receipts.length}</div>
          </div>
          <div class="stat-card" style="padding: 10px 14px;">
            <div class="stat-label">Repairs & Claims</div>
            <div class="stat-value tabular-nums" style="font-size: 1.3rem;">${repairs.length + claims.length}</div>
          </div>
        </div>

        ${duplicates.length > 0 ? `
          <div style="background-color: var(--status-expiring-bg); border: 1px solid var(--status-expiring-border); padding: 10px 14px; border-radius: var(--radius-md); color: var(--status-expiring-color);">
            <strong>Notice:</strong> ${duplicates.length} product(s) match IDs already in your vault. Choose how to handle them below.
          </div>
        ` : ''}

        <div class="form-group" style="margin-top: 6px;">
          <label class="form-label">Restore Mode</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="radio" name="restore-mode" value="merge" checked />
              <span><strong>Merge:</strong> Add new records and update existing matching records without wiping unrelated data.</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="radio" name="restore-mode" value="replace" />
              <span><strong>Replace All:</strong> Clear current database completely and restore this backup clean.</span>
            </label>
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="restore-cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="restore-confirm-btn">Confirm & Restore Data</button>
    `;

    showModal({
      title: 'Inspect Backup Before Restoring',
      contentHtml,
      footerHtml,
      size: 'md'
    });

    document.getElementById('restore-cancel-btn')?.addEventListener('click', closeModal);

    document.getElementById('restore-confirm-btn')?.addEventListener('click', async () => {
      const mode = document.querySelector('input[name="restore-mode"]:checked')?.value || 'merge';

      closeModal();
      toast('Restoring records into local vault...', 'info');

      if (mode === 'replace') {
        await clearAllData();
      }

      // Restore products
      for (const p of products) {
        const restoredProd = { ...p };
        if (p.image_base64) {
          restoredProd.image_blob = base64ToBlob(p.image_base64, 'image/jpeg');
          delete restoredProd.image_base64;
        }
        await put(STORES.PRODUCTS, restoredProd);
      }

      // Restore receipts (decode base64 to binary Blob)
      for (const r of receipts) {
        const restoredReceipt = { ...r };
        if (r.file_base64) {
          restoredReceipt.file_blob = base64ToBlob(r.file_base64, r.file_type || 'application/pdf');
          delete restoredReceipt.file_base64;
        }
        await put(STORES.RECEIPTS, restoredReceipt);
      }

      // Restore repairs
      for (const rep of repairs) {
        await put(STORES.REPAIRS, rep);
      }

      // Restore claims
      for (const c of claims) {
        await put(STORES.CLAIMS, c);
      }

      // Restore reminders
      for (const rem of reminders) {
        await put(STORES.REMINDERS, rem);
      }

      // Restore settings
      for (const s of settings) {
        await put(STORES.SETTINGS, s);
      }

      toast('Backup restored successfully!', 'success');
      window.dispatchEvent(new CustomEvent('wv-data-changed'));
      window.location.hash = '#dashboard';
    });
  } catch (err) {
    toast(`Import failed: ${err.message}`, 'error');
  }
}

/**
 * Exports products as a clean UTF-8 CSV spreadsheet with BOM.
 */
export async function exportCsv() {
  const products = await getAll(STORES.PRODUCTS);

  if (products.length === 0) {
    toast('No products to export to CSV', 'warn');
    return;
  }

  const headers = [
    'Product Name',
    'Brand',
    'Model',
    'Serial Number',
    'Category',
    'Purchase Date',
    'Purchase Price',
    'Seller / Store',
    'Warranty Start Date',
    'Warranty Expiry Date',
    'Warranty Status',
    'Days Remaining',
    'Notes'
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = products.map(p => {
    const status = calculateWarrantyStatus(p);
    return [
      escapeCsv(p.name),
      escapeCsv(p.brand),
      escapeCsv(p.model),
      escapeCsv(p.serial_number),
      escapeCsv(p.category),
      escapeCsv(p.purchase_date),
      escapeCsv(p.purchase_price),
      escapeCsv(p.seller),
      escapeCsv(p.warranty_start || p.purchase_date),
      escapeCsv(p.warranty_end),
      escapeCsv(status.label),
      escapeCsv(status.daysRemaining !== null ? status.daysRemaining : ''),
      escapeCsv(p.notes)
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const nowStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `warrantyvault_products_${nowStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('CSV exported successfully!', 'success');
}

/**
 * Renders the Backup & Restore Module.
 */
export async function renderBackupView(container) {
  const products = await getAll(STORES.PRODUCTS);
  const receipts = await getAll(STORES.RECEIPTS);

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Backup & Data Portability</h2>
          <p>Export complete portable archives, transfer records between devices, or download CSV spreadsheets.</p>
        </div>
      </div>

      <div class="dashboard-grid-2col">
        <!-- JSON Full Backup Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Full Vault Backup (JSON)</h3>
              <span class="card-subtitle">Includes all products, warranty dates, and digital receipts</span>
            </div>
          </div>

          <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 14px;">
            <p>
              Exports a complete, tamper-proof JSON backup containing all product records, warranty claim notes, repair histories, and safely encoded digital invoice files.
            </p>

            <div style="background-color: var(--bg-surface-elevated); padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between;">
              <span>Current Vault Records:</span>
              <strong class="tabular-nums" style="color: var(--text-primary);">${products.length} Products · ${receipts.length} Receipts</strong>
            </div>

            <button id="btn-export-json" class="btn btn-primary" style="width: fit-content;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Export Full JSON Backup</span>
            </button>
          </div>
        </div>

        <!-- Restore Backup Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Restore from Backup (JSON)</h3>
              <span class="card-subtitle">Safely restore previously exported archive</span>
            </div>
          </div>

          <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 14px;">
            <p>
              Select a previously exported <code>.json</code> file. You will be shown an inspection preview before any database changes are made.
            </p>

            <input type="file" id="import-json-input" accept=".json,application/json" style="display: none;" />

            <button id="btn-import-json-trigger" class="btn btn-secondary" style="width: fit-content;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              <span>Select Backup File to Restore</span>
            </button>
          </div>
        </div>

        <!-- CSV Export Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Export Products to CSV</h3>
              <span class="card-subtitle">Excel / Numbers / Google Sheets compatible</span>
            </div>
          </div>

          <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 14px;">
            <p>
              Downloads all product metadata, purchase amounts, warranty deadlines, and status classifications into a cleanly formatted UTF-8 CSV spreadsheet.
            </p>

            <button id="btn-export-csv" class="btn btn-secondary" style="width: fit-content;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              <span>Download Product CSV</span>
            </button>
          </div>
        </div>

        <!-- Security & Privacy Guarantee Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Portability & Privacy Architecture</h3>
              <span class="card-subtitle">Zero lock-in commitment</span>
            </div>
          </div>

          <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5;">
            <p style="margin-bottom: 8px;">
              WarrantyVault does not require an account, has zero tracking, and keeps your purchase history completely private.
            </p>
            <p>
              We recommend saving a monthly JSON backup to your local computer drive or encrypted USB disk to ensure your digital receipts are preserved even if browser storage is cleared.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-export-json')?.addEventListener('click', exportJsonBackup);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCsv);

  const importInput = document.getElementById('import-json-input');
  document.getElementById('btn-import-json-trigger')?.addEventListener('click', () => {
    importInput?.click();
  });

  importInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importJsonBackup(e.target.files[0]);
      e.target.value = '';
    }
  });
}
