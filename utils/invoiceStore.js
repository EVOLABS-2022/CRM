// utils/invoiceStore.js
const fs = require('fs');
const path = require('path');

const INVOICES_PATH = path.join(__dirname, '..', 'data', 'invoices.json');

function loadInvoices() {
  try {
    if (!fs.existsSync(INVOICES_PATH)) {
      const initial = { invoices: [] };
      fs.writeFileSync(INVOICES_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }

    const raw = fs.readFileSync(INVOICES_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    // 🔑 Normalize structure
    if (!parsed || typeof parsed !== 'object') {
      return { invoices: [] };
    }
    if (!Array.isArray(parsed.invoices)) {
      parsed.invoices = [];
    }

    return parsed;
  } catch (err) {
    console.error('❌ Failed to load invoices.json', err);
    return { invoices: [] };
  }
}

function saveInvoices(data) {
  try {
    if (!data || typeof data !== 'object') {
      data = { invoices: [] };
    }
    if (!Array.isArray(data.invoices)) {
      data.invoices = [];
    }

    fs.writeFileSync(INVOICES_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to save invoices.json', err);
  }
}

module.exports = { loadInvoices, saveInvoices };