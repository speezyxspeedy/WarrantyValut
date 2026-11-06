# WarrantyVault — Personal Purchase, Warranty & Repair Management System
> **Tagline: Never Lose a Warranty Again.**

WarrantyVault is an offline-first, client-side web application designed to help individuals organize purchased products, securely store digital receipts, track warranty periods, monitor repairs and claims, and receive expiry reminders.

All data, receipts, and invoices are stored 100% locally in your browser's IndexedDB. No external databases, no cloud transmission, and no tracking.

---

## 🚀 Key Features

1. **Calculated Overview Dashboard**
   - Real-time calculated portfolio metrics: Total Registered Products, Active Warranties, Expiring Soon, Expired Warranties, Products Under Repair, Open Claims, and Total Purchase Value.
   - Warranty Expiry Timeline displaying upcoming expirations with days remaining.
   - Recent purchases table, upcoming reminder alerts, and activity feed.
   - Category distribution cards.

2. **Full Product Management (CRUD)**
   - Register products with brand, model, serial number, store/seller, purchase date, and price.
   - Automatically calculates warranty expiry dates based on duration (months or years).
   - Allows manual adjustment of warranty start and end dates with non-overwrite safeguarding.
   - Comprehensive Product Detail View showing specifications, attached invoices, repair history, and warranty claims.
   - Filter by Category, Warranty Status, and Sort by Newest, Oldest, Highest/Lowest Price, and Expiration Dates.

3. **Warranty Tracking Engine & Interactive Calendar**
   - Classifies products into `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, and `NO_WARRANTY`.
   - Timezone-safe calendar calculations avoiding UTC/local offsets.
   - Safe leap-year handling (Feb 29) and month-end dates.
   - Interactive monthly and yearly Warranty Calendar view with direct item inspection.

4. **Digital Receipt Vault**
   - Upload PDF invoices, JPG, PNG, and WebP receipts (up to 15MB).
   - Stored natively as binary `Blob`s in IndexedDB (no excessive Base64 overhead in storage).
   - In-app preview modal for PDF documents and high-resolution images.
   - Download receipts with original filenames.
   - Object URL lifecycle management with automatic cleanup (`URL.revokeObjectURL`) to prevent memory leaks.

5. **Product Repair History**
   - Track service center visits, component replacements, out-of-pocket costs, and maintenance logs.
   - Track status: `REQUESTED`, `UNDER_REPAIR`, `WAITING_FOR_PARTS`, `COMPLETED`, `CANCELLED`.
   - Calculates total repair expenses per product and globally across the portfolio.

6. **Warranty Claims Tracker**
   - Manage Return Merchandise Authorizations (RMAs) and insurer/manufacturer claims.
   - Track status: `PREPARING`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `RESOLVED`.
   - Visual step-by-step claims pipeline.

7. **Smart Reminder Engine**
   - Auto-generates reminders from verified product dates (e.g., 30d, 7d, 1d, and 0d before expiry).
   - Custom reminders for maintenance, service schedules, and repair pickups.
   - In-app Notification Center with unread badge counter, flyout list, and mark-as-read.
   - Browser Notification API integration (explicit user gesture permission only).

8. **Personal Purchase Analytics**
   - 100% real mathematical calculations derived from actual stored products.
   - Native SVG Donut Chart showing spending distribution by category.
   - Native SVG Bar Chart showing monthly hardware spend over time.
   - Warranty Protection Ratio segmented gauge and Top Brands by spend ranking.

9. **Backup & Restore (Data Portability)**
   - **JSON Export**: Complete portable backup of all records with receipt binary files safely serialized.
   - **JSON Import**: Validates format, inspects metadata, checks duplicate IDs, and provides Merge or Replace options.
   - **CSV Export**: Clean UTF-8 CSV with Byte Order Mark (BOM) compatible with Excel, Google Sheets, and Apple Numbers.
   - **Clear All Data**: 2-step confirmation to wipe local IndexedDB when desired.

10. **Customizable Settings & Dual Theme**
    - Deep Charcoal dark mode and Clean Paper light mode.
    - Currency selector ($, €, £, ¥, ₹, CHF, kr, R$).
    - Date format selector (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`).
    - Configurable "Expiring Soon" threshold days and reminder intervals.
    - Browser Storage Quota estimate monitor.

---

## 🛠️ Technology Stack

- **Markup & Architecture**: HTML5, Semantic Elements, Accessible ARIA roles
- **Styling**: CSS3 with Custom Properties (variables), Responsive Flexbox & Grid (No Tailwind / No Bootstrap)
- **Scripting**: Vanilla JavaScript (ES2022 Modules) (No React / No Vue / No Angular)
- **Local Database**: Browser IndexedDB (`WarrantyVaultDB` with 6 dedicated object stores)
- **File Storage**: Browser File API & Blob Storage
- **Offline / PWA**: Web App Manifest (`manifest.json`) and Service Worker (`sw.js`)
- **System Notifications**: Browser Notification API

---

## 📂 Folder Structure

```
WarrantyVault/
│
├── index.html              # Main application shell and UI mount
├── manifest.json           # Web App Manifest for PWA installation
├── sw.js                   # Service Worker for offline asset caching
├── README.md               # Product documentation & technical specifications
│
├── css/
│   └── style.css           # Pure CSS3 stylesheet with light/dark themes
│
├── js/
│   ├── app.js              # Bootstrap, router, dashboard overview, PWA installer
│   ├── database.js         # IndexedDB asynchronous abstraction layer
│   ├── products.js         # Product CRUD, calculations, detail sheet
│   ├── warranty.js         # Warranty status engine, calendar calculations
│   ├── receipts.js         # Receipt vault, Blob storage, PDF/image preview
│   ├── repairs.js          # Service records, status pipelines, cost tracking
│   ├── claims.js           # Warranty claims, RMA tracking, timeline
│   ├── reminders.js        # Expiry reminder scheduler & in-app alerts
│   ├── analytics.js        # Real calculations & native SVG charts
│   ├── backup.js           # JSON export/import with Blob restoring, CSV download
│   ├── search.js           # Global multi-token search engine
│   ├── notifications.js    # Browser Notification API integration
│   ├── settings.js         # User preferences, themes, storage quota, test seeding
│   └── ui.js               # Accessible modals, confirmations, toasts, formatters
│
└── assets/
    └── logo.svg            # Vector shield & vault brand mark
```

---

## 💾 How IndexedDB Works in WarrantyVault

IndexedDB provides high-capacity, structured client-side storage directly inside your browser. WarrantyVault configures database `WarrantyVaultDB` (version 1) with 6 dedicated object stores:

1. `products`: Stores product metadata, purchase dates, warranty dates, and price.
2. `receipts`: Stores original invoice files as native binary `Blob` objects alongside file metadata.
3. `repairs`: Stores maintenance dates, service centres, costs, and statuses.
4. `claims`: Stores RMA reference numbers, provider communications, and statuses.
5. `reminders`: Stores auto-generated and custom scheduled alerts with completion flags.
6. `settings`: Stores application preferences (theme, currency, thresholds).

### Receipt Storage & Memory Safety
When you upload an invoice or photo receipt, WarrantyVault stores the original file as a binary `Blob` directly in IndexedDB. When previewing or downloading:
- A temporary URL is created via `URL.createObjectURL(blob)`.
- When the preview modal closes, the URL is automatically revoked using `URL.revokeObjectURL(url)` to prevent memory leaks.

---

## 🔔 Reminder & Notification Limitations

- **Permission**: The browser requires explicit user approval before showing desktop notifications. WarrantyVault never requests permission on page load; request it via **Settings** or the prompt banner.
- **Background Execution**: In standard web browsers, background notifications fire reliably when the application tab is open or running in standalone PWA mode. If your browser or computer is in sleep mode, in-app notifications will immediately appear in the top-bar notification flyout the moment you open the app.
- **Testing**: For Service Workers and Notification APIs, modern browsers require a secure context (`localhost` or `https://`).

---

## 📦 How to Run Locally

You can run WarrantyVault using any static web server:

### Option 1: Using VS Code Live Server
1. Open the project folder in VS Code.
2. Right click `index.html` and click **"Open with Live Server"**.
3. Visit `http://127.0.0.1:5500` in your browser.

### Option 2: Using Node.js / Vite
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### Option 3: Using Python
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080` in your browser.

---

## 🔒 Privacy & Data Sovereignty

- **No Remote Servers**: None of your receipts, purchase amounts, or personal devices are ever sent to an external server.
- **Zero Third-Party Trackers**: No analytics or telemetry scripts.
- **Data Portability**: You can export your full database to an encrypted JSON backup file at any time and import it into another browser or computer.
- **Local Storage Advisory**: Clearing your browser cache / site data might delete local IndexedDB stores. Always download a regular JSON backup from the **Backup & Restore** tab!
