/**
 * WarrantyVault — Product Management Module
 * Comprehensive CRUD, automatic warranty calculations, rich detail views, and filtering.
 */

import { getAll, getById, add, put, remove, STORES } from './database.js';
import { calculateWarrantyStatus, computeWarrantyEnd, formatRemainingDays } from './warranty.js';
import { getReceiptsForProduct, openUploadReceiptModal, openReceiptPreview, downloadReceipt } from './receipts.js';
import { getRepairsForProduct, openAddEditRepairModal, getTotalRepairCostForProduct } from './repairs.js';
import { getClaimsForProduct, openAddEditClaimModal } from './claims.js';
import { syncRemindersForProduct } from './reminders.js';
import { showModal, closeModal, confirmDialog, toast, generateId, formatCurrency, formatDate, escapeHtml } from './ui.js';

export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Computers & Laptops',
  'Smartphones',
  'Home Appliances',
  'Accessories',
  'Furniture',
  'Vehicles',
  'Other'
];

let currentProductLayout = 'GRID'; // 'GRID' or 'TABLE'
let currentCategoryFilter = 'ALL';
let currentWarrantyFilter = 'ALL';
let currentSortOrder = 'NEWEST_PURCHASE';

/**
 * Renders My Products View.
 */
export async function renderProductsView(container) {
  const products = await getAll(STORES.PRODUCTS);

  // Classify products with warranty info
  const enriched = products.map(p => ({
    ...p,
    warrantyInfo: calculateWarrantyStatus(p)
  }));

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>My Products</h2>
          <p>Manage registered personal purchases, warranty dates, digital receipts, and repairs.</p>
        </div>

        <div class="section-controls">
          <div class="segmented-control">
            <button class="segment-btn ${currentProductLayout === 'GRID' ? 'active' : ''}" id="prod-view-grid">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <span>Grid</span>
            </button>
            <button class="segment-btn ${currentProductLayout === 'TABLE' ? 'active' : ''}" id="prod-view-table">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span>Table</span>
            </button>
          </div>

          <button id="btn-add-product-page" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Product</span>
          </button>
        </div>
      </div>

      <!-- Toolbar with Category, Warranty Filter, and Sorting -->
      <div class="toolbar-bar">
        <div class="toolbar-group">
          <select id="prod-category-filter" class="input-select">
            <option value="ALL" ${currentCategoryFilter === 'ALL' ? 'selected' : ''}>All Categories</option>
            ${PRODUCT_CATEGORIES.map(cat => `
              <option value="${escapeHtml(cat)}" ${currentCategoryFilter === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>
            `).join('')}
          </select>

          <select id="prod-warranty-filter" class="input-select">
            <option value="ALL" ${currentWarrantyFilter === 'ALL' ? 'selected' : ''}>All Warranty Statuses</option>
            <option value="ACTIVE" ${currentWarrantyFilter === 'ACTIVE' ? 'selected' : ''}>Active Coverage</option>
            <option value="EXPIRING_SOON" ${currentWarrantyFilter === 'EXPIRING_SOON' ? 'selected' : ''}>Expiring Soon</option>
            <option value="EXPIRED" ${currentWarrantyFilter === 'EXPIRED' ? 'selected' : ''}>Expired</option>
            <option value="NO_WARRANTY" ${currentWarrantyFilter === 'NO_WARRANTY' ? 'selected' : ''}>No Warranty</option>
          </select>

          <select id="prod-sort-order" class="input-select">
            <option value="NEWEST_PURCHASE" ${currentSortOrder === 'NEWEST_PURCHASE' ? 'selected' : ''}>Newest Purchase</option>
            <option value="OLDEST_PURCHASE" ${currentSortOrder === 'OLDEST_PURCHASE' ? 'selected' : ''}>Oldest Purchase</option>
            <option value="HIGHEST_PRICE" ${currentSortOrder === 'HIGHEST_PRICE' ? 'selected' : ''}>Highest Price</option>
            <option value="LOWEST_PRICE" ${currentSortOrder === 'LOWEST_PRICE' ? 'selected' : ''}>Lowest Price</option>
            <option value="EARLIEST_EXPIRY" ${currentSortOrder === 'EARLIEST_EXPIRY' ? 'selected' : ''}>Earliest Expiry</option>
            <option value="LATEST_EXPIRY" ${currentSortOrder === 'LATEST_EXPIRY' ? 'selected' : ''}>Latest Expiry</option>
          </select>
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted);">
          <span>Registered Products: <strong class="tabular-nums" style="color: var(--text-primary);">${products.length}</strong></span>
        </div>
      </div>

      <!-- Mount for Products -->
      <div id="products-list-mount">
        ${renderFilteredProducts(enriched)}
      </div>
    </div>
  `;

  // Attach controls
  document.getElementById('prod-view-grid')?.addEventListener('click', () => {
    currentProductLayout = 'GRID';
    renderProductsView(container);
  });

  document.getElementById('prod-view-table')?.addEventListener('click', () => {
    currentProductLayout = 'TABLE';
    renderProductsView(container);
  });

  document.getElementById('btn-add-product-page')?.addEventListener('click', () => {
    openAddEditProductModal(null, () => renderProductsView(container));
  });

  const categorySelect = document.getElementById('prod-category-filter');
  const warrantySelect = document.getElementById('prod-warranty-filter');
  const sortSelect = document.getElementById('prod-sort-order');

  const onFilterChanged = () => {
    currentCategoryFilter = categorySelect.value;
    currentWarrantyFilter = warrantySelect.value;
    currentSortOrder = sortSelect.value;

    const mount = document.getElementById('products-list-mount');
    if (mount) {
      mount.innerHTML = renderFilteredProducts(enriched);
      attachProductCardListeners(container);
    }
  };

  categorySelect?.addEventListener('change', onFilterChanged);
  warrantySelect?.addEventListener('change', onFilterChanged);
  sortSelect?.addEventListener('change', onFilterChanged);

  attachProductCardListeners(container);
}

function renderFilteredProducts(enriched) {
  let list = enriched;

  if (currentCategoryFilter !== 'ALL') {
    list = list.filter(p => p.category === currentCategoryFilter);
  }

  if (currentWarrantyFilter !== 'ALL') {
    list = list.filter(p => p.warrantyInfo.status === currentWarrantyFilter);
  }

  // Sorting
  list.sort((a, b) => {
    switch (currentSortOrder) {
      case 'NEWEST_PURCHASE':
        return (b.purchase_date || '').localeCompare(a.purchase_date || '');
      case 'OLDEST_PURCHASE':
        return (a.purchase_date || '').localeCompare(b.purchase_date || '');
      case 'HIGHEST_PRICE':
        return (b.purchase_price || 0) - (a.purchase_price || 0);
      case 'LOWEST_PRICE':
        return (a.purchase_price || 0) - (b.purchase_price || 0);
      case 'EARLIEST_EXPIRY':
        if (!a.warranty_end) return 1;
        if (!b.warranty_end) return -1;
        return a.warranty_end.localeCompare(b.warranty_end);
      case 'LATEST_EXPIRY':
        if (!a.warranty_end) return 1;
        if (!b.warranty_end) return -1;
        return b.warranty_end.localeCompare(a.warranty_end);
      default:
        return 0;
    }
  });

  if (list.length === 0) {
    return `
      <div class="card empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
        </div>
        <div class="empty-title">No matching products found</div>
        <div class="empty-desc">Try clearing your filters or register a new product to keep your warranties protected.</div>
        <button class="btn btn-primary" id="btn-empty-add-prod">Register First Product</button>
      </div>
    `;
  }

  if (currentProductLayout === 'TABLE') {
    return `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Purchase Date</th>
              <th>Price</th>
              <th>Store / Seller</th>
              <th>Warranty Expiry</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(p => `
              <tr class="product-row" data-id="${escapeHtml(p.id)}" style="cursor: pointer;">
                <td>
                  <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.name)}</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(p.brand || '—')} ${p.model ? `· ${escapeHtml(p.model)}` : ''}</div>
                </td>
                <td><span style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(p.category)}</span></td>
                <td class="tabular-nums">${formatDate(p.purchase_date)}</td>
                <td class="tabular-nums font-semibold">${formatCurrency(p.purchase_price)}</td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(p.seller || '—')}</td>
                <td class="tabular-nums" style="color: ${p.warrantyInfo.color}; font-weight: 600;">
                  ${formatDate(p.warranty_end)}
                </td>
                <td>
                  <span class="product-status-tag ${p.warrantyInfo.cssClass}">
                    ${escapeHtml(p.warrantyInfo.label)}
                  </span>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm prod-view-btn" data-id="${escapeHtml(p.id)}">Details</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Default: Grid View
  return `
    <div class="products-grid">
      ${list.map(p => {
        let imageUrl = '';
        if (p.image_blob) {
          imageUrl = URL.createObjectURL(p.image_blob);
        }

        return `
          <div class="product-card" data-id="${escapeHtml(p.id)}">
            <div class="product-card-hero">
              ${imageUrl ? `
                <img src="${imageUrl}" class="product-card-img" alt="${escapeHtml(p.name)}" onload="URL.revokeObjectURL(this.src)" />
              ` : `
                <div class="product-card-placeholder">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                  <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(p.category)}</span>
                </div>
              `}
              <span class="product-status-tag ${p.warrantyInfo.cssClass}">
                ${escapeHtml(p.warrantyInfo.label)}
              </span>
            </div>

            <div class="product-card-body">
              <div>
                <div class="product-brand">${escapeHtml(p.brand || 'Unbranded')}</div>
                <h3 class="product-name">${escapeHtml(p.name)}</h3>
              </div>

              <div class="product-metadata-row">
                <span>Purchased: ${formatDate(p.purchase_date)}</span>
                ${p.seller ? `<span class="meta-separator">·</span><span>${escapeHtml(p.seller)}</span>` : ''}
              </div>

              <div class="product-card-footer">
                <span class="product-price tabular-nums">${formatCurrency(p.purchase_price)}</span>
                <span class="product-warranty-expiry-text ${p.warrantyInfo.cssClass}">
                  ${p.warranty_end ? formatRemainingDays(p.warrantyInfo.daysRemaining) : 'No warranty'}
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function attachProductCardListeners(container) {
  document.getElementById('btn-empty-add-prod')?.addEventListener('click', () => {
    openAddEditProductModal(null, () => renderProductsView(container));
  });

  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });

  document.querySelectorAll('.product-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });

  document.querySelectorAll('.prod-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });
}

/**
 * Opens Add / Edit Product Modal with automatic warranty end calculations.
 */
export async function openAddEditProductModal(productId = null, onSaved = null) {
  let product = null;
  if (productId) {
    product = await getById(STORES.PRODUCTS, productId);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const purchaseDate = product ? product.purchase_date : todayStr;
  const warrantyStart = product ? (product.warranty_start || product.purchase_date) : todayStr;
  const warrantyDuration = product ? product.warranty_duration : 1;
  const warrantyUnit = product ? product.warranty_unit : 'years';
  const warrantyEnd = product ? product.warranty_end : computeWarrantyEnd(warrantyStart, warrantyDuration, warrantyUnit);

  const contentHtml = `
    <form id="product-form" class="form-grid">
      <div class="form-group col-span-2">
        <label class="form-label" for="prod-name-input">Product Name *</label>
        <input type="text" id="prod-name-input" class="form-input" placeholder="e.g. MacBook Pro 16, Sony Headphones, OLED TV" value="${escapeHtml(product?.name || '')}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-brand-input">Brand / Manufacturer</label>
        <input type="text" id="prod-brand-input" class="form-input" placeholder="e.g. Apple, Sony, Dyson, LG" value="${escapeHtml(product?.brand || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-category-select">Category *</label>
        <select id="prod-category-select" class="form-select" required>
          ${PRODUCT_CATEGORIES.map(cat => `
            <option value="${escapeHtml(cat)}" ${product?.category === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-model-input">Model Number</label>
        <input type="text" id="prod-model-input" class="form-input" placeholder="e.g. A2991, WH1000XM5" value="${escapeHtml(product?.model || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-serial-input">Serial Number</label>
        <input type="text" id="prod-serial-input" class="form-input" placeholder="e.g. C02G899KMD6R" value="${escapeHtml(product?.serial_number || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-purchase-date">Purchase Date *</label>
        <input type="date" id="prod-purchase-date" class="form-input" value="${purchaseDate}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-price-input">
          <span>Purchase Price *</span>
          <span class="helper">Tax inclusive</span>
        </label>
        <input type="number" id="prod-price-input" class="form-input" step="0.01" min="0" placeholder="0.00" value="${product?.purchase_price !== undefined ? product.purchase_price : ''}" required />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="prod-seller-input">Store / Seller Name</label>
        <input type="text" id="prod-seller-input" class="form-input" placeholder="e.g. Best Buy, Amazon, Apple Store, Official Web" value="${escapeHtml(product?.seller || '')}" />
      </div>

      <!-- Warranty Section -->
      <div class="form-group" style="grid-column: span 2; border-top: 1px solid var(--border-subtle); padding-top: 14px; margin-top: 4px;">
        <span style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">Warranty Period Specifications</span>
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Expiry date automatically calculates based on duration, but can be manually overridden.</span>
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-warranty-duration">Warranty Duration</label>
        <input type="number" id="prod-warranty-duration" class="form-input" min="0" max="100" value="${warrantyDuration}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-warranty-unit">Duration Unit</label>
        <select id="prod-warranty-unit" class="form-select">
          <option value="years" ${warrantyUnit === 'years' ? 'selected' : ''}>Years</option>
          <option value="months" ${warrantyUnit === 'months' ? 'selected' : ''}>Months</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-warranty-start">Warranty Start Date</label>
        <input type="date" id="prod-warranty-start" class="form-input" value="${warrantyStart}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="prod-warranty-end">
          <span>Warranty Expiry Date</span>
          <span class="helper" id="warranty-calc-hint">Auto-calculated</span>
        </label>
        <input type="date" id="prod-warranty-end" class="form-input" value="${warrantyEnd}" />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="prod-notes-input">Notes & Extended Warranty Terms</label>
        <textarea id="prod-notes-input" class="form-textarea" placeholder="e.g. Includes 3-year accidental damage protection, receipt filed in vault...">${escapeHtml(product?.notes || '')}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-prod">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-prod">${product ? 'Save Changes' : 'Register Product'}</button>
  `;

  showModal({
    title: product ? `Edit: ${product.name}` : 'Register New Product',
    contentHtml,
    footerHtml,
    size: 'lg'
  });

  // Automatic calculation logic with manual adjustment safeguarding
  const purchaseDateInput = document.getElementById('prod-purchase-date');
  const durationInput = document.getElementById('prod-warranty-duration');
  const unitSelect = document.getElementById('prod-warranty-unit');
  const startInput = document.getElementById('prod-warranty-start');
  const endInput = document.getElementById('prod-warranty-end');
  const calcHint = document.getElementById('warranty-calc-hint');

  let isManualEndDate = false;

  endInput?.addEventListener('input', () => {
    isManualEndDate = true;
    if (calcHint) calcHint.textContent = 'Manual override';
  });

  const recalculateWarranty = () => {
    const pDate = purchaseDateInput.value;
    if (!startInput.value || startInput.value === purchaseDate) {
      startInput.value = pDate;
    }

    if (!isManualEndDate) {
      const dur = parseInt(durationInput.value, 10) || 0;
      const unit = unitSelect.value;
      endInput.value = computeWarrantyEnd(startInput.value, dur, unit);
      if (calcHint) calcHint.textContent = 'Auto-calculated';
    }
  };

  purchaseDateInput?.addEventListener('change', recalculateWarranty);
  durationInput?.addEventListener('input', recalculateWarranty);
  unitSelect?.addEventListener('change', recalculateWarranty);
  startInput?.addEventListener('change', recalculateWarranty);

  document.getElementById('modal-cancel-prod')?.addEventListener('click', closeModal);

  document.getElementById('modal-submit-prod')?.addEventListener('click', async () => {
    const name = document.getElementById('prod-name-input').value.trim();
    const brand = document.getElementById('prod-brand-input').value.trim();
    const category = document.getElementById('prod-category-select').value;
    const model = document.getElementById('prod-model-input').value.trim();
    const serial = document.getElementById('prod-serial-input').value.trim();
    const pDate = document.getElementById('prod-purchase-date').value;
    const price = parseFloat(document.getElementById('prod-price-input').value) || 0;
    const seller = document.getElementById('prod-seller-input').value.trim();
    const duration = parseInt(document.getElementById('prod-warranty-duration').value, 10) || 0;
    const unit = document.getElementById('prod-warranty-unit').value;
    const wStart = document.getElementById('prod-warranty-start').value;
    const wEnd = document.getElementById('prod-warranty-end').value;
    const notes = document.getElementById('prod-notes-input').value.trim();

    if (!name) {
      toast('Please enter a product name', 'warn');
      return;
    }
    if (!pDate) {
      toast('Please enter the purchase date', 'warn');
      return;
    }

    const payload = {
      id: product ? product.id : generateId(),
      name,
      brand,
      category,
      model,
      serial_number: serial,
      purchase_date: pDate,
      purchase_price: price,
      seller,
      warranty_duration: duration,
      warranty_unit: unit,
      warranty_start: wStart || pDate,
      warranty_end: wEnd,
      notes,
      image_blob: product ? product.image_blob : null,
      created_at: product ? product.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (product) {
      await put(STORES.PRODUCTS, payload);
      toast('Product updated successfully', 'success');
    } else {
      await add(STORES.PRODUCTS, payload);
      toast('Product registered to WarrantyVault!', 'success');
    }

    // Auto-generate / sync reminders
    await syncRemindersForProduct(payload);

    closeModal();
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
    if (typeof onSaved === 'function') onSaved();
  });
}

/**
 * Opens the comprehensive Product Detail view modal with receipts, repairs, and claims.
 */
export async function openProductDetailModal(productId) {
  const product = await getById(STORES.PRODUCTS, productId);
  if (!product) {
    toast('Product not found', 'error');
    return;
  }

  const warrantyInfo = calculateWarrantyStatus(product);
  const receipts = await getReceiptsForProduct(productId);
  const repairs = await getRepairsForProduct(productId);
  const claims = await getClaimsForProduct(productId);
  const totalRepairCost = repairs.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);

  const contentHtml = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Hero Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-muted); letter-spacing: 0.05em;">
            ${escapeHtml(product.brand || 'Unbranded')} · ${escapeHtml(product.category)}
          </div>
          <h2 style="font-size: 1.35rem; font-weight: 700; color: var(--text-primary); margin-top: 2px;">
            ${escapeHtml(product.name)}
          </h2>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
            ${product.model ? `<span>Model: <strong>${escapeHtml(product.model)}</strong></span>` : ''}
            ${product.serial_number ? `<span style="margin: 0 8px;">·</span><span>Serial: <strong class="tabular-nums">${escapeHtml(product.serial_number)}</strong></span>` : ''}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
          <span class="product-status-tag ${warrantyInfo.cssClass}" style="font-size: 0.78rem;">
            ${escapeHtml(warrantyInfo.label)}
          </span>
          <span style="font-size: 0.8rem; font-weight: 600; color: ${warrantyInfo.color};">
            ${formatRemainingDays(warrantyInfo.daysRemaining)}
          </span>
        </div>
      </div>

      <!-- Quick Specs Strip -->
      <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="stat-card" style="padding: 12px 14px;">
          <div class="stat-label">Purchase Price</div>
          <div class="stat-value tabular-nums" style="font-size: 1.3rem;">${formatCurrency(product.purchase_price)}</div>
        </div>
        <div class="stat-card" style="padding: 12px 14px;">
          <div class="stat-label">Purchased On</div>
          <div class="stat-value tabular-nums" style="font-size: 1.15rem; color: var(--text-primary);">${formatDate(product.purchase_date)}</div>
        </div>
        <div class="stat-card" style="padding: 12px 14px;">
          <div class="stat-label">Warranty Expires</div>
          <div class="stat-value tabular-nums" style="font-size: 1.15rem; color: ${warrantyInfo.color};">${formatDate(product.warranty_end)}</div>
        </div>
        <div class="stat-card" style="padding: 12px 14px;">
          <div class="stat-label">Total Repair Costs</div>
          <div class="stat-value tabular-nums" style="font-size: 1.3rem;">${formatCurrency(totalRepairCost)}</div>
        </div>
      </div>

      ${product.seller || product.notes ? `
        <div style="background-color: var(--bg-surface-elevated); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); font-size: 0.82rem;">
          ${product.seller ? `<div style="color: var(--text-secondary); margin-bottom: 4px;">Store / Merchant: <strong style="color: var(--text-primary);">${escapeHtml(product.seller)}</strong></div>` : ''}
          ${product.notes ? `<div style="color: var(--text-muted);">${escapeHtml(product.notes)}</div>` : ''}
        </div>
      ` : ''}

      <!-- Tabbed / Sub-sections -->
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
        <!-- Attached Receipts -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Proof of Purchase Receipts (${receipts.length})</h4>
          <button class="btn btn-secondary btn-sm" id="detail-add-receipt-btn">
            + Upload Receipt
          </button>
        </div>

        ${receipts.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
            ${receipts.map(r => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                <div>
                  <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${escapeHtml(r.file_name)}</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">Uploaded ${formatDate(r.uploaded_at.split('T')[0])}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-secondary btn-sm detail-preview-receipt-btn" data-id="${escapeHtml(r.id)}">Preview</button>
                  <button class="btn btn-secondary btn-sm detail-download-receipt-btn" data-id="${escapeHtml(r.id)}">Download</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); background-color: var(--bg-surface-elevated); border-radius: var(--radius-md); margin-bottom: 20px;">
            No receipts attached to this product yet.
          </div>
        `}

        <!-- Repair Records -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Repair History (${repairs.length})</h4>
          <button class="btn btn-secondary btn-sm" id="detail-add-repair-btn">
            + Log Repair
          </button>
        </div>

        ${repairs.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
            ${repairs.map(rep => `
              <div style="padding: 10px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary);">${formatDate(rep.repair_date)} · ${escapeHtml(rep.service_centre || 'Service Lab')}</span>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="tabular-nums font-semibold" style="font-size: 0.85rem;">${formatCurrency(rep.cost)}</span>
                    <span class="status-badge ${escapeHtml(rep.status.toLowerCase())}">${escapeHtml(rep.status.replace('_', ' '))}</span>
                  </div>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(rep.issue_description)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); background-color: var(--bg-surface-elevated); border-radius: var(--radius-md); margin-bottom: 20px;">
            No repairs reported for this device.
          </div>
        `}

        <!-- Warranty Claims -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">Warranty Claims (${claims.length})</h4>
          <button class="btn btn-secondary btn-sm" id="detail-add-claim-btn">
            + File Claim
          </button>
        </div>

        ${claims.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${claims.map(c => `
              <div style="padding: 10px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary);">${formatDate(c.claim_date)} ${c.reference_number ? `· RMA #${escapeHtml(c.reference_number)}` : ''}</span>
                  <span class="status-badge ${escapeHtml(c.status.toLowerCase())}">${escapeHtml(c.status.replace('_', ' '))}</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(c.description)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); background-color: var(--bg-surface-elevated); border-radius: var(--radius-md);">
            No claims filed for this product.
          </div>
        `}
      </div>
    </div>
  `;

  const footerHtml = `
    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
      <button class="btn btn-danger btn-sm" id="detail-delete-prod-btn">Delete Product</button>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="detail-edit-prod-btn">Edit Product</button>
        <button class="btn btn-primary" id="detail-close-btn">Done</button>
      </div>
    </div>
  `;

  showModal({
    title: 'Product Overview & History',
    contentHtml,
    footerHtml,
    size: 'lg'
  });

  document.getElementById('detail-close-btn')?.addEventListener('click', closeModal);

  document.getElementById('detail-edit-prod-btn')?.addEventListener('click', () => {
    closeModal();
    openAddEditProductModal(productId, () => openProductDetailModal(productId));
  });

  document.getElementById('detail-delete-prod-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: `Delete ${product.name}?`,
      message: 'This will delete the product, its linked reminders, and claims from your database.',
      confirmText: 'Delete Permanently',
      danger: true
    });
    if (!ok) return;

    await remove(STORES.PRODUCTS, productId);
    toast('Product deleted', 'info');
    closeModal();
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
  });

  document.getElementById('detail-add-receipt-btn')?.addEventListener('click', () => {
    openUploadReceiptModal(productId, () => openProductDetailModal(productId));
  });

  document.getElementById('detail-add-repair-btn')?.addEventListener('click', () => {
    openAddEditRepairModal(productId, () => openProductDetailModal(productId));
  });

  document.getElementById('detail-add-claim-btn')?.addEventListener('click', () => {
    openAddEditClaimModal(productId, () => openProductDetailModal(productId));
  });

  document.querySelectorAll('.detail-preview-receipt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) openReceiptPreview(id);
    });
  });

  document.querySelectorAll('.detail-download-receipt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) downloadReceipt(id);
    });
  });
}
