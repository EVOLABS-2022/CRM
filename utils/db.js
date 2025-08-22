// utils/db.js
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = { clients: [], jobs: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(DB_PATH);
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to load db.json', err);
    return { clients: [], jobs: [] };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to save db.json', err);
  }
}

module.exports = { loadDB, saveDB };