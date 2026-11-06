/**
 * WarrantyVault — Analytics Engine & Native SVG Visualizations
 * 100% Real calculations derived from stored purchases, warranties, and repairs.
 */

import { getAll, STORES } from './database.js';
import { calculateWarrantyStatus, WARRANTY_STATUS } from './warranty.js';
import { formatCurrency, escapeHtml } from './ui.js';
import { PRODUCT_CATEGORIES } from './products.js';

let analyticsTimeframe = 'ALL'; // 'ALL', 'YEAR', '12M'
let analyticsCategory = 'ALL';

const PALETTE = [
  '#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', 
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
];

/**
 * Renders the Analytics Module.
 */
export async function renderAnalyticsView(container) {
  const products = await getAll(STORES.PRODUCTS);
  const repairs = await getAll(STORES.REPAIRS);

  const now = new Date();
  const currentYearStr = String(now.getFullYear());
  const oneYearAgoDate = new Date();
  oneYearAgoDate.setFullYear(now.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgoDate.toISOString().split('T')[0];

  // Apply filters
  let filteredProducts = products;
  if (analyticsTimeframe === 'YEAR') {
    filteredProducts = filteredProducts.filter(p => (p.purchase_date || '').startsWith(currentYearStr));
  } else if (analyticsTimeframe === '12M') {
    filteredProducts = filteredProducts.filter(p => (p.purchase_date || '') >= oneYearAgoStr);
  }

  if (analyticsCategory !== 'ALL') {
    filteredProducts = filteredProducts.filter(p => p.category === analyticsCategory);
  }

  // Calculate metrics
  const totalProducts = filteredProducts.length;
  const totalPurchaseValue = filteredProducts.reduce((sum, p) => sum + (Number(p.purchase_price) || 0), 0);
  const avgPurchasePrice = totalProducts > 0 ? (totalPurchaseValue / totalProducts) : 0;

  // Filter repairs matching products
  const productIds = new Set(filteredProducts.map(p => p.id));
  const filteredRepairs = repairs.filter(r => productIds.has(r.product_id));
  const totalRepairCost = filteredRepairs.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);

  // Warranty Statuses
  let activeCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let noWarrantyCount = 0;
  let activeCoverageValue = 0;

  filteredProducts.forEach(p => {
    const statusInfo = calculateWarrantyStatus(p);
    if (statusInfo.status === WARRANTY_STATUS.ACTIVE) {
      activeCount++;
      activeCoverageValue += (Number(p.purchase_price) || 0);
    } else if (statusInfo.status === WARRANTY_STATUS.EXPIRING_SOON) {
      expiringCount++;
      activeCoverageValue += (Number(p.purchase_price) || 0);
    } else if (statusInfo.status === WARRANTY_STATUS.EXPIRED) {
      expiredCount++;
    } else {
      noWarrantyCount++;
    }
  });

  const activeWarrantyRate = totalProducts > 0 ? Math.round(((activeCount + expiringCount) / totalProducts) * 100) : 0;
  const expiredWarrantyRate = totalProducts > 0 ? Math.round((expiredCount / totalProducts) * 100) : 0;

  // Category Distribution
  const categoryStats = {};
  filteredProducts.forEach(p => {
    const cat = p.category || 'Other';
    if (!categoryStats[cat]) {
      categoryStats[cat] = { count: 0, spend: 0 };
    }
    categoryStats[cat].count++;
    categoryStats[cat].spend += (Number(p.purchase_price) || 0);
  });

  // Monthly Purchases
  const monthSpendMap = {};
  filteredProducts.forEach(p => {
    if (p.purchase_date && p.purchase_date.length >= 7) {
      const ym = p.purchase_date.substring(0, 7); // 'YYYY-MM'
      monthSpendMap[ym] = (monthSpendMap[ym] || 0) + (Number(p.purchase_price) || 0);
    }
  });

  const sortedMonths = Object.keys(monthSpendMap).sort().slice(-8); // Last 8 active months

  container.innerHTML = `
    <div class="view-section">
      <div class="section-header">
        <div class="section-title-wrap">
          <h2>Purchase & Warranty Analytics</h2>
          <p>Real mathematical metrics on your personal hardware portfolio, spend history, and warranty coverages.</p>
        </div>

        <div class="section-controls">
          <select id="analytics-timeframe-select" class="input-select">
            <option value="ALL" ${analyticsTimeframe === 'ALL' ? 'selected' : ''}>All Time</option>
            <option value="12M" ${analyticsTimeframe === '12M' ? 'selected' : ''}>Past 12 Months</option>
            <option value="YEAR" ${analyticsTimeframe === 'YEAR' ? 'selected' : ''}>Current Year (${currentYearStr})</option>
          </select>

          <select id="analytics-category-select" class="input-select">
            <option value="ALL" ${analyticsCategory === 'ALL' ? 'selected' : ''}>All Categories</option>
            ${PRODUCT_CATEGORIES.map(cat => `
              <option value="${escapeHtml(cat)}" ${analyticsCategory === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Key KPI Metrics Strip -->
      <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="stat-card">
          <div class="stat-label">Total Purchase Value</div>
          <div class="stat-value tabular-nums">${formatCurrency(totalPurchaseValue)}</div>
          <div class="stat-subtext">${totalProducts} registered products</div>
        </div>
        <div class="stat-card active-warranty">
          <div class="stat-label">Active Warranty Coverage</div>
          <div class="stat-value tabular-nums">${formatCurrency(activeCoverageValue)}</div>
          <div class="stat-subtext">${activeWarrantyRate}% of portfolio covered</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Average Item Price</div>
          <div class="stat-value tabular-nums">${formatCurrency(avgPurchasePrice)}</div>
          <div class="stat-subtext">Across registered devices</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Repair Spending</div>
          <div class="stat-value tabular-nums">${formatCurrency(totalRepairCost)}</div>
          <div class="stat-subtext">${filteredRepairs.length} service records</div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="chart-grid">
        <!-- SVG Donut Chart: Category Spend -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="card-title">Portfolio Spend by Category</h3>
            <span class="card-subtitle">Distribution of purchase value</span>
          </div>

          <div class="chart-container">
            ${renderCategoryDonutSvg(categoryStats, totalPurchaseValue)}
          </div>

          <div class="chart-legend">
            ${Object.keys(categoryStats).map((cat, i) => {
              const color = PALETTE[i % PALETTE.length];
              const pct = totalPurchaseValue > 0 ? Math.round((categoryStats[cat].spend / totalPurchaseValue) * 100) : 0;
              return `
                <div class="legend-item">
                  <span class="legend-color-dot" style="background-color: ${color};"></span>
                  <span>${escapeHtml(cat)}: <strong class="tabular-nums">${formatCurrency(categoryStats[cat].spend)}</strong> (${pct}%)</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- SVG Bar Chart: Purchases Over Time -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="card-title">Purchase Spending Timeline</h3>
            <span class="card-subtitle">Recent monthly hardware investments</span>
          </div>

          <div class="chart-container">
            ${renderMonthlyBarSvg(sortedMonths, monthSpendMap)}
          </div>

          <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 10px;">
            Calculated from verified purchase invoice records
          </div>
        </div>
      </div>

      <!-- Warranty Coverage Rate & Brand Summary -->
      <div class="dashboard-grid-2col" style="margin-top: 4px;">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Warranty Protection Ratio</h3>
            <span class="card-subtitle">Active vs Expired breakdown</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 6px;">
            <!-- Horizontal Segmented Bar -->
            <div style="height: 18px; border-radius: 9px; overflow: hidden; display: flex; background: var(--bg-surface-elevated);">
              <div style="width: ${activeWarrantyRate}%; background: var(--status-active-color);" title="Active: ${activeWarrantyRate}%"></div>
              <div style="width: ${expiredWarrantyRate}%; background: var(--status-expired-color);" title="Expired: ${expiredWarrantyRate}%"></div>
              <div style="flex: 1; background: var(--status-neutral-color); opacity: 0.3;" title="No Warranty"></div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
              <span style="color: var(--status-active-color); font-weight: 600;">Active: ${activeCount + expiringCount} (${activeWarrantyRate}%)</span>
              <span style="color: var(--status-expired-color); font-weight: 600;">Expired: ${expiredCount} (${expiredWarrantyRate}%)</span>
              <span style="color: var(--text-muted);">No Warranty: ${noWarrantyCount}</span>
            </div>
          </div>
        </div>

        <!-- Top Brands List -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Top Brands by Spend</h3>
            <span class="card-subtitle">Highest investment manufacturers</span>
          </div>

          ${renderTopBrandsList(filteredProducts)}
        </div>
      </div>
    </div>
  `;

  document.getElementById('analytics-timeframe-select')?.addEventListener('change', (e) => {
    analyticsTimeframe = e.target.value;
    renderAnalyticsView(container);
  });

  document.getElementById('analytics-category-select')?.addEventListener('change', (e) => {
    analyticsCategory = e.target.value;
    renderAnalyticsView(container);
  });
}

/**
 * Generates an SVG Donut Chart for categories.
 */
function renderCategoryDonutSvg(categoryStats, totalSpend) {
  const categories = Object.keys(categoryStats);
  if (categories.length === 0 || totalSpend === 0) {
    return `<div style="font-size: 0.82rem; color: var(--text-muted);">No category purchase data available</div>`;
  }

  const cx = 120;
  const cy = 110;
  const r = 75;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * r;

  let accumulatedPercent = 0;
  const slices = categories.map((cat, idx) => {
    const value = categoryStats[cat].spend;
    const percent = value / totalSpend;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -(accumulatedPercent * circumference);
    accumulatedPercent += percent;
    const color = PALETTE[idx % PALETTE.length];

    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
        style="transition: stroke-width 0.2s ease;" />
    `;
  }).join('');

  return `
    <svg width="240" height="220" viewBox="0 0 240 220">
      <g transform="rotate(-90 ${cx} ${cy})">
        ${slices}
      </g>
      <circle cx="${cx}" cy="${cy}" r="${r - strokeWidth / 2 - 2}" fill="var(--bg-surface)" />
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="700">
        ${categories.length} Categories
      </text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--text-muted)" font-size="11">
        ${formatCurrency(totalSpend)}
      </text>
    </svg>
  `;
}

/**
 * Generates an SVG Bar Chart for monthly purchases.
 */
function renderMonthlyBarSvg(sortedMonths, monthSpendMap) {
  if (sortedMonths.length === 0) {
    return `<div style="font-size: 0.82rem; color: var(--text-muted);">No monthly purchase history available</div>`;
  }

  const maxSpend = Math.max(...sortedMonths.map(m => monthSpendMap[m]), 1);
  const chartWidth = 360;
  const chartHeight = 180;
  const barWidth = 26;
  const gap = (chartWidth - (sortedMonths.length * barWidth)) / (sortedMonths.length + 1);

  const bars = sortedMonths.map((m, idx) => {
    const spend = monthSpendMap[m];
    const barHeight = Math.max((spend / maxSpend) * 120, 6);
    const x = gap + idx * (barWidth + gap);
    const y = 140 - barHeight;
    const label = m.substring(5); // 'MM'

    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="#6366f1" opacity="0.85">
        <title>${m}: ${formatCurrency(spend)}</title>
      </rect>
      <text x="${x + barWidth / 2}" y="160" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-weight="600">
        ${label}
      </text>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" fill="var(--text-secondary)" font-size="9" font-weight="600">
        ${formatCurrency(spend).split('.')[0]}
      </text>
    `;
  }).join('');

  return `
    <svg width="100%" height="180" viewBox="0 0 ${chartWidth} ${chartHeight}">
      <!-- Baseline -->
      <line x1="10" y1="140" x2="${chartWidth - 10}" y2="140" stroke="var(--border-subtle)" stroke-width="1" />
      ${bars}
    </svg>
  `;
}

/**
 * Top Brands List.
 */
function renderTopBrandsList(products) {
  const brandSpend = {};
  products.forEach(p => {
    const brand = p.brand || 'Unbranded';
    brandSpend[brand] = (brandSpend[brand] || 0) + (Number(p.purchase_price) || 0);
  });

  const sortedBrands = Object.keys(brandSpend)
    .sort((a, b) => brandSpend[b] - brandSpend[a])
    .slice(0, 4);

  if (sortedBrands.length === 0) {
    return `<div style="font-size: 0.82rem; color: var(--text-muted);">No brand data available</div>`;
  }

  return `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${sortedBrands.map(b => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <span style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${escapeHtml(b)}</span>
          <span class="tabular-nums font-semibold" style="font-size: 0.9rem; color: #818cf8;">${formatCurrency(brandSpend[b])}</span>
        </div>
      `).join('')}
    </div>
  `;
}
