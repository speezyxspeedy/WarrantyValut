/**
 * WarrantyVault — IndexedDB Storage Engine
 * High-performance, fully asynchronous, resilient client-side database.
 */

const DB_NAME = 'WarrantyVaultDB';
const DB_VERSION = 1;

let dbInstance = null;

export const STORES = {
  PRODUCTS: 'products',
  RECEIPTS: 'receipts',
  REPAIRS: 'repairs',
  CLAIMS: 'claims',
  REMINDERS: 'reminders',
  SETTINGS: 'settings'
};

/**
 * Initializes and opens the IndexedDB database.
 * Sets up schemas, keys, and indexes.
 * @returns {Promise<IDBDatabase>}
 */
export function getDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Products Store
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productStore.createIndex('name', 'name', { unique: false });
        productStore.createIndex('brand', 'brand', { unique: false });
        productStore.createIndex('category', 'category', { unique: false });
        productStore.createIndex('purchase_date', 'purchase_date', { unique: false });
        productStore.createIndex('warranty_end', 'warranty_end', { unique: false });
      }

      // 2. Receipts Store
      if (!db.objectStoreNames.contains(STORES.RECEIPTS)) {
        const receiptStore = db.createObjectStore(STORES.RECEIPTS, { keyPath: 'id' });
        receiptStore.createIndex('product_id', 'product_id', { unique: false });
        receiptStore.createIndex('uploaded_at', 'uploaded_at', { unique: false });
      }

      // 3. Repairs Store
      if (!db.objectStoreNames.contains(STORES.REPAIRS)) {
        const repairStore = db.createObjectStore(STORES.REPAIRS, { keyPath: 'id' });
        repairStore.createIndex('product_id', 'product_id', { unique: false });
        repairStore.createIndex('repair_date', 'repair_date', { unique: false });
        repairStore.createIndex('status', 'status', { unique: false });
      }

      // 4. Claims Store
      if (!db.objectStoreNames.contains(STORES.CLAIMS)) {
        const claimStore = db.createObjectStore(STORES.CLAIMS, { keyPath: 'id' });
        claimStore.createIndex('product_id', 'product_id', { unique: false });
        claimStore.createIndex('claim_date', 'claim_date', { unique: false });
        claimStore.createIndex('status', 'status', { unique: false });
      }

      // 5. Reminders Store
      if (!db.objectStoreNames.contains(STORES.REMINDERS)) {
        const reminderStore = db.createObjectStore(STORES.REMINDERS, { keyPath: 'id' });
        reminderStore.createIndex('product_id', 'product_id', { unique: false });
        reminderStore.createIndex('reminder_date', 'reminder_date', { unique: false });
        reminderStore.createIndex('is_completed', 'is_completed', { unique: false });
        reminderStore.createIndex('is_read', 'is_read', { unique: false });
      }

      // 6. Settings Store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked by another open tab.');
    };
  });
}

/**
 * Retrieve all items from a given store.
 */
export async function getAll(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve a single record by primary key ID.
 */
export async function getById(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve records matching an index query.
 */
export async function getByIndex(storeName, indexName, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add or insert an item into a store.
 */
export async function add(storeName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(item);

    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update or upsert an item into a store.
 */
export async function put(storeName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a record by ID.
 */
export async function remove(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count total items in a store.
 */
export async function count(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all records in a single store.
 */
export async function clearStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all data across all stores in WarrantyVault.
 */
export async function clearAllData() {
  const db = await getDB();
  const storeNames = Object.values(STORES);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');
    storeNames.forEach(storeName => {
      transaction.objectStore(storeName).clear();
    });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}
