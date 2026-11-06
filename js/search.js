/**
 * WarrantyVault — Search & Filter Engine
 * Global fuzzy multi-token search across products, brands, serials, and merchants.
 */

import { getAll, STORES } from './database.js';
import { calculateWarrantyStatus } from './warranty.js';
import { openProductDetailModal } from './products.js';
import { showModal, formatCurrency, formatDate, escapeHtml } from './ui.js';

/**
 * Executes a search query across all product fields.
 */
export async function searchProducts(query) {
  if (!query || typeof query !== 'string') return [];
  const cleanQuery = query.toLowerCase().trim();
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  const products = await getAll(STORES.PRODUCTS);

  return products.filter(product => {
    const haystack = [
      product.name,
      product.brand,
      product.model,
      product.serial_number,
      product.category,
      product.seller,
      product.notes
    ].filter(Boolean).join(' ').toLowerCase();

    // All tokens must match
    return tokens.every(token => haystack.includes(token));
  }).map(p => ({
    ...p,
    warrantyInfo: calculateWarrantyStatus(p)
  }));
}

/**
 * Opens a modal displaying search results.
 */
export async function showSearchResultsModal(query) {
  const results = await searchProducts(query);

  const contentHtml = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        Found <strong>${results.length}</strong> matching product(s) for "<em>${escapeHtml(query)}</em>":
      </div>

      ${results.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 440px; overflow-y: auto;">
          ${results.map(p => `
            <div class="search-result-item" data-id="${escapeHtml(p.id)}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; transition: background 0.15s ease;">
              <div>
                <div style="font-weight: 600; color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(p.name)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                  <span>${escapeHtml(p.brand || 'Unbranded')}</span>
                  ${p.model ? `<span>· Model: ${escapeHtml(p.model)}</span>` : ''}
                  ${p.serial_number ? `<span>· S/N: ${escapeHtml(p.serial_number)}</span>` : ''}
                  <span>· ${escapeHtml(p.category)}</span>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="tabular-nums font-semibold">${formatCurrency(p.purchase_price)}</span>
                <span class="product-status-tag ${p.warrantyInfo.cssClass}">
                  ${escapeHtml(p.warrantyInfo.label)}
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding: 30px;">
          <div class="empty-desc">No products matched your search term. Check the spelling or search by serial number.</div>
        </div>
      `}
    </div>
  `;

  showModal({
    title: `Search: "${query}"`,
    contentHtml,
    size: 'lg'
  });

  document.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (id) openProductDetailModal(id);
    });
  });
}
