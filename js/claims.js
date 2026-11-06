/**
 * WarrantyVault — Warranty Claims Tracker Module
 * Lifecycle management for manufacturer RMA, store claims, and repair resolutions.
 */

import { getAll, getById, getByIndex, add, put, remove, STORES } from './database.js';
import { showModal, closeModal, confirmDialog, toast, generateId, formatDate, escapeHtml } from './ui.js';

export const CLAIM_STATUS = {
  PREPARING: 'PREPARING',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESOLVED: 'RESOLVED'
};

export const CLAIM_STATUS_LABELS = {
  PREPARING: 'Preparing Claim',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESOLVED: 'Resolved'
};

export const CLAIM_PIPELINE_STEPS = [
  { key: 'PREPARING', label: '1. Prepare' },
  { key: 'SUBMITTED', label: '2. Submitted' },
  { key: 'UNDER_REVIEW', label: '3. Under Review' },
  { key: 'APPROVED', label: '4. Approved' },
  { key: 'RESOLVED', label: '5. Resolved' }
];

/**
 * Retrieves all claims for a product.
 */
export async function getClaimsForProduct(productId) {
  if (!productId) return [];
  const claims = await getByIndex(STORES.CLAIMS, 'product_id', productId);
  claims.sort((a, b) => new Date(b.claim_date || b.created_at) - new Date(a.claim_date || a.created_at));
  return claims;
}

/**
 * Delete a claim.
 */
export async function deleteClaim(claimId) {
  return await remove(STORES.CLAIMS, claimId);
}

/**
 * Opens Add / Edit Claim Modal.
 */
export async function openAddEditClaimModal(param = null, onSaved = null) {
  let claim = null;
  let defaultProductId = null;

  if (typeof param === 'string') {
    const existing = await getById(STORES.CLAIMS, param);
    if (existing) claim = existing;
    else defaultProductId = param;
  } else if (param && param.id) {
    claim = param;
  }

  const products = await getAll(STORES.PRODUCTS);
  const selectedProdId = claim ? claim.product_id : defaultProductId;

  const productOptions = products.map(p => `
    <option value="${escapeHtml(p.id)}" ${p.id === selectedProdId ? 'selected' : ''}>
      ${escapeHtml(p.name)} (${escapeHtml(p.brand || 'Unbranded')})
    </option>
  `).join('');

  const todayStr = new Date().toISOString().split('T')[0];

  const contentHtml = `
    <form id="claim-form" class="form-grid">
      <div class="form-group col-span-2">
        <label class="form-label" for="claim-product-select">Covered Product *</label>
        <select id="claim-product-select" class="form-select" required>
          <option value="">Select a registered product...</option>
          ${productOptions}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="claim-date-input">Filing / Incident Date *</label>
        <input type="date" id="claim-date-input" class="form-input" value="${claim ? claim.claim_date : todayStr}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="claim-status-select">Current Claim Status *</label>
        <select id="claim-status-select" class="form-select">
          <option value="PREPARING" ${claim?.status === 'PREPARING' ? 'selected' : ''}>Preparing Claim</option>
          <option value="SUBMITTED" ${(!claim || claim?.status === 'SUBMITTED') ? 'selected' : ''}>Submitted to Manufacturer</option>
          <option value="UNDER_REVIEW" ${claim?.status === 'UNDER_REVIEW' ? 'selected' : ''}>Under Review / RMA Inspection</option>
          <option value="APPROVED" ${claim?.status === 'APPROVED' ? 'selected' : ''}>Approved for Replacement / Reimbursement</option>
          <option value="RESOLVED" ${claim?.status === 'RESOLVED' ? 'selected' : ''}>Resolved & Closed</option>
          <option value="REJECTED" ${claim?.status === 'REJECTED' ? 'selected' : ''}>Rejected / Denied</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="claim-ref-input">RMA / Claim Reference Number</label>
        <input type="text" id="claim-ref-input" class="form-input" placeholder="e.g. RMA-2026-881923" value="${escapeHtml(claim?.reference_number || '')}" />
      </div>

      <div class="form-group">
        <label class="form-label" for="claim-provider-input">Warranty Provider / Insurer</label>
        <input type="text" id="claim-provider-input" class="form-input" placeholder="e.g. SquareTrade, Asurion, Manufacturer Direct" value="${escapeHtml(claim?.provider || '')}" />
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="claim-desc-input">Claim Details & Defect Description *</label>
        <textarea id="claim-desc-input" class="form-textarea" placeholder="Detail the fault, conditions under which failure occurred, and requested remedy..." required>${escapeHtml(claim?.description || '')}</textarea>
      </div>

      <div class="form-group col-span-2">
        <label class="form-label" for="claim-notes-input">Communication Notes / Tracking Updates</label>
        <input type="text" id="claim-notes-input" class="form-input" placeholder="e.g. Sent shipping label on Tuesday; awaiting return box" value="${escapeHtml(claim?.notes || '')}" />
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="modal-cancel-claim">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-claim">${claim ? 'Save Claim Changes' : 'Create Warranty Claim'}</button>
  `;

  showModal({
    title: claim ? 'Edit Warranty Claim' : 'Open New Warranty Claim',
    contentHtml,
    footerHtml,
    size: 'lg'
  });

  document.getElementById('modal-cancel-claim')?.addEventListener('click', closeModal);

  document.getElementById('modal-submit-claim')?.addEventListener('click', async () => {
    const productId = document.getElementById('claim-product-select').value;
    const claimDate = document.getElementById('claim-date-input').value;
    const status = document.getElementById('claim-status-select').value;
    const referenceNumber = document.getElementById('claim-ref-input').value.trim();
    const provider = document.getElementById('claim-provider-input').value.trim();
    const description = document.getElementById('claim-desc-input').value.trim();
    const notes = document.getElementById('claim-notes-input').value.trim();

    if (!productId) {
      toast('Please select a product for this claim', 'warn');
      return;
    }
    if (!description) {
      toast('Please enter the claim description', 'warn');
      return;
    }

    const payload = {
      id: claim ? claim.id : generateId(),
      product_id: productId,
      claim_date: claimDate || todayStr,
      reference_number: referenceNumber,
      provider,
      description,
      status,
      notes,
      created_at: claim ? claim.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (claim) {
      await put(STORES.CLAIMS, payload);
      toast('Warranty claim updated', 'success');
    } else {
      await add(STORES.CLAIMS, payload);
      toast('Warranty claim opened successfully', 'success');
    }

    closeModal();
    window.dispatchEvent(new CustomEvent('wv-data-changed'));
    if (typeof onSaved === 'function') onSaved();
  });
}

/**
 * Renders the dedicated Warranty Claims View.
 */
export async function renderClaimsView(container) {
  const claims = await getAll(STORES.CLAIMS);
  const products = await getAll(STORES.PRODUCTS);

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });

  const activeClaimsCount = claims.filter(c => c.status !== CLAIM_STATUS.RESOLVED && c.status !== CLAIM_STATUS.REJECTED).length;
  const approvedCount = claims.filter(c => c.status === CLAIM_STATUS.APPROVED || c.status === CLAIM_STATUS.RESOLVED).length;

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Warranty Claims Tracker</h2>
          <p>Monitor manufacturer claims, RMAs, customer service tickets, and replacements.</p>
        </div>

        <div class="section-controls">
          <button id="btn-add-claim-top" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>File New Claim</span>
          </button>
        </div>
      </div>

      <!-- Claim stats -->
      <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card" style="border-left: 3px solid #818cf8;">
          <div class="stat-label">Active / Open Claims</div>
          <div class="stat-value tabular-nums" style="color: #818cf8;">${activeClaimsCount}</div>
          <div class="stat-subtext">Under review or pending RMA</div>
        </div>
        <div class="stat-card active-warranty">
          <div class="stat-label">Approved & Resolved</div>
          <div class="stat-value tabular-nums">${approvedCount}</div>
          <div class="stat-subtext">Successful warranty fulfillment</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Claims Filed</div>
          <div class="stat-value tabular-nums">${claims.length}</div>
          <div class="stat-subtext">Lifetime claims history</div>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="toolbar-bar">
        <div class="toolbar-group">
          <input type="text" id="claim-search-input" class="input-text" placeholder="Search RMA #, provider, issue..." style="min-width: 280px;" />
          <select id="claim-status-filter" class="input-select">
            <option value="ALL">All Statuses</option>
            <option value="PREPARING">Preparing</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          <span>Total Records: <strong class="tabular-nums" style="color: var(--text-primary);">${claims.length}</strong></span>
        </div>
      </div>

      <div id="claims-list-mount">
        ${renderClaimsListHtml(claims, productMap)}
      </div>
    </div>
  `;

  document.getElementById('btn-add-claim-top')?.addEventListener('click', () => {
    openAddEditClaimModal(null, () => renderClaimsView(container));
  });

  const searchInput = document.getElementById('claim-search-input');
  const statusFilter = document.getElementById('claim-status-filter');

  const filterClaims = () => {
    const q = (searchInput.value || '').toLowerCase().trim();
    const st = statusFilter.value;

    const filtered = claims.filter(c => {
      const matchStatus = st === 'ALL' || c.status === st;
      const matchText = !q ||
        (c.reference_number && c.reference_number.toLowerCase().includes(q)) ||
        (c.provider && c.provider.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (productMap[c.product_id]?.name.toLowerCase().includes(q));
      return matchStatus && matchText;
    });

    const mount = document.getElementById('claims-list-mount');
    if (mount) {
      mount.innerHTML = renderClaimsListHtml(filtered, productMap);
      attachClaimActionListeners(container);
    }
  };

  searchInput?.addEventListener('input', filterClaims);
  statusFilter?.addEventListener('change', filterClaims);

  attachClaimActionListeners(container);
}

function renderClaimsListHtml(claims, productMap) {
  if (claims.length === 0) {
    return `
      <div class="card empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <div class="empty-title">No warranty claims filed yet</div>
        <div class="empty-desc">Track return merchandize authorizations (RMAs), extended warranty tickets, and repair reimbursements.</div>
        <button class="btn btn-primary" id="btn-empty-add-claim">File First Claim</button>
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${claims.map(c => {
        const prod = productMap[c.product_id];
        const statusLabel = CLAIM_STATUS_LABELS[c.status] || c.status;

        // Visual progress tracker
        const currentIdx = CLAIM_PIPELINE_STEPS.findIndex(step => step.key === c.status);

        return `
          <div class="card">
            <div class="card-header" style="margin-bottom: 12px;">
              <div>
                <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">
                  ${prod ? escapeHtml(prod.name) : 'Unknown Product'}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                  <span>Filed: <strong>${formatDate(c.claim_date)}</strong></span>
                  ${c.reference_number ? `<span>·</span><span>RMA Ref: <strong class="tabular-nums">${escapeHtml(c.reference_number)}</strong></span>` : ''}
                  ${c.provider ? `<span>·</span><span>Provider: <strong>${escapeHtml(c.provider)}</strong></span>` : ''}
                </div>
              </div>

              <div>
                <span class="status-badge ${escapeHtml(c.status.toLowerCase())}">
                  ${escapeHtml(statusLabel)}
                </span>
              </div>
            </div>

            <!-- Pipeline Visual Bar -->
            ${c.status !== 'REJECTED' ? `
              <div class="claims-pipeline">
                ${CLAIM_PIPELINE_STEPS.map((step, idx) => {
                  let stepStateClass = '';
                  if (idx < currentIdx || c.status === 'RESOLVED') stepStateClass = 'completed';
                  else if (idx === currentIdx) stepStateClass = 'current';

                  return `
                    <div class="pipeline-step ${stepStateClass}">
                      ${escapeHtml(step.label)}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div style="padding: 6px 12px; background-color: var(--status-expired-bg); border: 1px solid var(--status-expired-border); border-radius: var(--radius-sm); color: var(--status-expired-color); font-size: 0.75rem; font-weight: 600; margin-bottom: 12px;">
                CLAIM DENIED / REJECTED BY PROVIDER
              </div>
            `}

            <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 12px;">
              ${escapeHtml(c.description)}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px; flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                ${c.notes ? `<span>Notes: ${escapeHtml(c.notes)}</span>` : '<span>No additional notes</span>'}
              </div>

              <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-sm claim-edit-btn" data-id="${escapeHtml(c.id)}">Update Claim</button>
                <button class="btn btn-danger btn-sm claim-delete-btn" data-id="${escapeHtml(c.id)}">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function attachClaimActionListeners(container) {
  document.getElementById('btn-empty-add-claim')?.addEventListener('click', () => {
    openAddEditClaimModal(null, () => renderClaimsView(container));
  });

  document.querySelectorAll('.claim-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) openAddEditClaimModal(id, () => renderClaimsView(container));
    });
  });

  document.querySelectorAll('.claim-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      const ok = await confirmDialog({
        title: 'Delete Claim Record',
        message: 'Are you sure you want to delete this warranty claim record? This cannot be undone.',
        confirmText: 'Delete Claim',
        danger: true
      });
      if (!ok) return;

      await deleteClaim(id);
      toast('Claim record removed', 'info');
      window.dispatchEvent(new CustomEvent('wv-data-changed'));
      renderClaimsView(container);
    });
  });
}
