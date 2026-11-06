/**
 * WarrantyVault — Product Repair History Module
 * Full lifecycle repair management, costs calculations, and service timelines.
 */

import { getAll, getById, getByIndex, add, put, remove, STORES } from './database.js';
import { showModal, closeModal, confirmDialog, toast, generateId, formatCurrency, formatDate, escapeHtml } from './ui.js';

export const REPAIR_STATUS = {
  REQUESTED: 'REQUESTED',
  UNDER_REPAIR: 'UNDER_REPAIR',
  WAITING_FOR_PARTS: 'WAITING_FOR_PARTS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

export const REPAIR_STATUS_LABELS = {
  REQUESTED: 'Requested',
  UNDER_REPAIR: 'Under Repair',
  WAITING_FOR_PARTS: 'Waiting for Parts',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

/**
 * Retrieve all repair records for a product.
 */
export async function getRepairsForProduct(productId) {
  if (!productId) return [];
  const repairs = await getByIndex(STORES.REPAIRS, 'product_id', productId);
  repairs.sort((a, b) => new Date(b.repair_date || b.created_at) - new Date(a.repair_date || a.created_at));
  return repairs;
}

/**
 * Calculate total repair expenditures for a product.
 */
export async function getTotalRepairCostForProduct(productId) {
  const repairs = await getRepairsForProduct(productId);
  return repairs.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
}

/**
 * Calculate global repair spend.
 */
export async function getTotalGlobalRepairCost() {
  const repairs = await getAll(STORES.REPAIRS);
  return repairs.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
}

/**
 * Delete a repair record.
 */
export async function deleteRepair(repairId) {
  return await remove(STORES.REPAIRS, repairId);
}

/**
 * Opens Add / Edit Repair Modal.
 */
export async function openAddEditRepairModal(param = null, onSaved = null) {
  let repair = null;
  let defaultProductId = null;

  if (typeof param === 'string') {
    // If it's a product ID or repair ID
    const existingRepair = await getById(STORES.REPAIRS, param);
    if (existingRepair) {
      repair = existingRepair;
    } else {
      defaultProductId = param;
    }
  } else if (param && param.id) {
    repair = param;
  }

  const products = await getAll(STORES.PRODUCTS);
  const selectedProdId = repair ? repair.product_id : defaultProductId;

  const productOptions = products.map(p => `
    <option value="${escapeHtml(p.id)}" ${p.id === selectedProdId ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${escapeHtml(p.brand || 'Unbranded')})
    </option>
  `).join('');

  const todayStr = new Date().toISOString().split('T')[0];

  const contentHtml = `
    <form id="repair-form" class="form-grid">
      <div class="form-group col-span-2">
        <label class="form-label" for="repair-product-select">Product *</label>
        <select id="repair-product-select" class="form-select" required>
          <option value="">Select a registered product...</option>
          ${productOptions}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-date-input">Service / Repair Date *</label>
        <input type="date" id="repair-date-input" class="form-input" value="${repair ? repair.repair_date : todayStr}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-status-select">Status *</label>
        <select id="repair-status-select" class="form-select">
          <option value="REQUESTED" ${repair?.status === 'REQUESTED' ? 'selected' : ''}>Requested</option>
          <option value="UNDER_REPAIR" ${(!repair || repair?.status === 'UNDER_REPAIR') ? 'selected' : ''}>Under Repair</option>
          <option value="WAITING_FOR_PARTS" ${repair?.status === 'WAITING_FOR_PARTS' ? 'selected' : ''}>Waiting for Parts</option>
          <option value="COMPLETED" ${repair?.status === 'COMPLETED' ? 'selected' : ''}>Completed</option>
          <option value="CANCELLED" ${repair?.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-centre-input">Service Centre / Technician</label>
        <input type="text" id="repair-centre-input" class="form-input" placeholder="e.g. Apple Genius Bar, Local Repair Lab" value="${escapeHtml(repair?.service_centre || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-cost-input">
          <span>Repair Cost</span>
          <span class="helper">0 if under warranty</span>
        </label>
        <input type="number" id="repair-cost-input" class="form-input" step="0.01" min="0" placeholder="0.00" value="${repair?.cost !== undefined ? repair.cost : ''}" />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="repair-issue-input">Issue Description *</label>
        <textarea id="repair-issue-input" class="form-textarea" placeholder="Describe the symptom, malfunction, or required maintenance..." required>${escapeHtml(repair?.issue_description || '')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-parts-input">Parts Replaced</label>
        <input type="text" id="repair-parts-input" class="form-input" placeholder="e.g. Battery, screen glass, logic board" value="${escapeHtml(repair?.parts_replaced || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="repair-expected-date">Expected Completion</label>
        <input type="date" id="repair-expected-date" class="form-input" value="${repair?.expected_completion_date || ''}" />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="repair-notes-input">Service Notes / Warranty Coverage Details</label>
        <input type="text" id="repair-notes-input" class="form-input" placeholder="e.g. Covered 100% under AppleCare+ claim #9821" value="${escapeHtml(repair?.notes || '')}" />
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-repair">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-repair">${repair ? 'Save Changes' : 'Log Repair Record'}</button>
  `;

  showModal({
    title: repair ? 'Edit Repair Record' : 'Log Product Repair',
    contentHtml,
    footerHtml,
    size: 'lg'
  });

  document.getElementById('modal-cancel-repair')?.addEventListener('click', closeModal);

  document.getElementById('modal-submit-repair')?.addEventListener('click', async () => {
    const productId = document.getElementById('repair-product-select').value;
    const repairDate = document.getElementById('repair-date-input').value;
    const status = document.getElementById('repair-status-select').value;
    const serviceCentre = document.getElementById('repair-centre-input').value.trim();
    const cost = parseFloat(document.getElementById('repair-cost-input').value) || 0;
    const issueDescription = document.getElementById('repair-issue-input').value.trim();
    const partsReplaced = document.getElementById('repair-parts-input').value.trim();
    const expectedDate = document.getElementById('repair-expected-date').value;
    const notes = document.getElementById('repair-notes-input').value.trim();

    if (!productId) {
      toast('Please select a product for this repair', 'warn');
      return;
    }
    if (!issueDescription) {
      toast('Please describe the issue', 'warn');
      return;
    }

    const payload = {
      id: repair ? repair.id : generateId(),
      product_id: productId,
      repair_date: repairDate || todayStr,
      service_centre: serviceCentre,
      issue_description: issueDescription,
      status,
      cost,
      parts_replaced: partsReplaced,
      expected_completion_date: expectedDate,
      completion_date: status === REPAIR_STATUS.COMPLETED ? (repair?.completion_date || todayStr) : '',
      notes,
      created_at: repair ? repair.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (repair) {
      await put(STORES.REPAIRS, payload);
      toast('Repair record updated', 'success');
    } else {
      await add(STORES.REPAIRS, payload);
      toast('Repair record logged successfully', 'success');
    }

    closeModal();
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
    if (typeof onSaved === 'function') onSaved();
  });
}

/**
 * Renders the dedicated Repair History Module.
 */
export async function renderRepairsView(container) {
  const repairs = await getAll(STORES.REPAIRS);
  const products = await getAll(STORES.PRODUCTS);

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  const totalCost = repairs.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
  const underRepairCount = repairs.filter(r => r.status === REPAIR_STATUS.UNDER_REPAIR || r.status === REPAIR_STATUS.WAITING_FOR_PARTS).length;
  const completedCount = repairs.filter(r => r.status === REPAIR_STATUS.COMPLETED).length;

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Product Repair History</h2>
          <p>Track service center visits, component replacements, out-of-pocket costs, and maintenance logs.</p>
        </div>

        <div class="section-controls">
          <button id="btn-add-repair-top" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Log New Repair</span>
          </button>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card">
          <div class="stat-label">Total Repair Costs</div>
          <div class="stat-value tabular-nums">${formatCurrency(totalCost)}</div>
          <div class="stat-subtext">Lifetime maintenance spending</div>
        </div>
        <div class="stat-card" style="border-left: 3px solid #818cf8;">
          <div class="stat-label">Currently in Service</div>
          <div class="stat-value tabular-nums" style="color: #818cf8;">${underRepairCount}</div>
          <div class="stat-subtext">Under repair or awaiting components</div>
        </div>
        <div class="stat-card active-warranty">
          <div class="stat-label">Completed Repairs</div>
          <div class="stat-value tabular-nums">${completedCount}</div>
          <div class="stat-subtext">Resolved successfully</div>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="toolbar-bar">
        <div class="toolbar-group">
          <input type="text" id="repair-search-input" class="input-text" placeholder="Search service center, issue, parts..." style="min-width: 280px;" />
          <select id="repair-status-filter" class="input-select">
            <option value="ALL">All Statuses</option>
            <option value="UNDER_REPAIR">Under Repair</option>
            <option value="WAITING_FOR_PARTS">Waiting for Parts</option>
            <option value="REQUESTED">Requested</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          <span>Total Records: <strong class="tabular-nums" style="color: var(--text-primary);">${repairs.length}</strong></span>
        </div>
      </div>

      <div id="repairs-list-mount">
        ${renderRepairsListHtml(repairs, productMap)}
      </div>
    </div>
  `;

  document.getElementById('btn-add-repair-top')?.addEventListener('click', () => {
    openAddEditRepairModal(null, () => renderRepairsView(container));
  });

  const searchInput = document.getElementById('repair-search-input');
  const statusFilter = document.getElementById('repair-status-filter');

  const filterRepairs = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const st = statusFilter.value;

    const filtered = repairs.filter(r => {
      const matchStatus = st === 'ALL' || r.status === st;
      const matchText = !q ||
        (r.issue_description && r.issue_description.toLowerCase().includes(q)) ||
        (r.service_centre && r.service_centre.toLowerCase().includes(q)) ||
        (r.parts_replaced && r.parts_replaced.toLowerCase().includes(q)) ||
        (productMap[r.product_id]?.name.toLowerCase().includes(q));
      return matchStatus && matchText;
    });

    const mount = document.getElementById('repairs-list-mount');
    if (mount) {
      mount.innerHTML = renderRepairsListHtml(filtered, productMap);
      attachRepairActionListeners(container);
    }
  };

  searchInput?.addEventListener('input', filterRepairs);
  statusFilter?.addEventListener('change', filterRepairs);

  attachRepairActionListeners(container);
}

function renderRepairsListHtml(repairs, productMap) {
  if (repairs.length === 0) {
    return `
      <div class="card empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        </div>
        <div class="empty-title">No repair records found</div>
        <div class="empty-desc">Keep track of warranty servicing, component repairs, and warranty repair costs.</div>
        <button class="btn btn-primary" id="btn-empty-add-repair">Log First Repair</button>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="timeline-list-vertical">
        ${repairs.map(r => {
          const prod = productMap[r.product_id];
          const statusClass = (r.status || '').toLowerCase();
          const statusLabel = REPAIR_STATUS_LABELS[r.status] || r.status;

          return `
            <div class="timeline-record">
              <div class="record-header">
                <div>
                  <span class="record-title">${prod ? escapeHtml(prod.name) : 'Unknown Product'}</span>
                  <span style="margin: 0 6px; color: var(--text-muted);">·</span>
                  <span style="font-size: 0.8rem; color: var(--text-muted);">${formatDate(r.repair_date)}</span>
                  ${r.service_centre ? `<span style="margin: 0 6px; color: var(--text-muted);">·</span><span style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(r.service_centre)}</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="record-cost tabular-nums">${formatCurrency(r.cost)}</span>
                  <span class="status-badge ${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
                </div>
              </div>

              <div class="record-desc">${escapeHtml(r.issue_description)}</div>

              <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                  ${r.parts_replaced ? `<span>Parts: <strong>${escapeHtml(r.parts_replaced)}</strong></span>` : ''}
                  ${r.expected_completion_date ? `<span>Target: <strong>${formatDate(r.expected_completion_date)}</strong></span>` : ''}
                  ${r.notes ? `<span>Notes: ${escapeHtml(r.notes)}</span>` : ''}
                </div>

                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-secondary btn-sm repair-edit-btn" data-id="${escapeHtml(r.id)}">Edit</button>
                  <button class="btn btn-danger btn-sm repair-delete-btn" data-id="${escapeHtml(r.id)}">Delete</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function attachRepairActionListeners(container) {
  document.getElementById('btn-empty-add-repair')?.addEventListener('click', () => {
    openAddEditRepairModal(null, () => renderRepairsView(container));
  });

  document.querySelectorAll('.repair-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) openAddEditRepairModal(id, () => renderRepairsView(container));
    });
  });

  document.querySelectorAll('.repair-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const ok = await confirmDialog({
        title: 'Delete Repair Record',
        message: 'Are you sure you want to delete this repair record? This cannot be undone.',
        confirmText: 'Delete Record',
        danger: true
      });
      if (!ok) return;

      await deleteRepair(id);
      toast('Repair record removed', 'info');
      window.dispatchEvent(new CustomEvent('wv-data-changed'));
      renderRepairsView(container);
    });
  });
}
