// lib/store.js
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'db.json');
let db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const { formatDate } = require('./date');

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Generate sequential IDs
function nextClientId() {
  return `C${db.clients.length + 1}`;
}
function nextJobId() {
  return `J${db.jobs.length + 1}`;
}

function createClient(data) {
  const id = nextClientId();
  const client = { ...data, id, createdAt: new Date().toISOString(), archived: false };
  db.clients.push(client);
  save();
  return `✅ Client ${client.code || client.name} created (${formatDate(client.createdAt)})`;
}

function createJob(data) {
  const id = nextJobId();
  const job = { ...data, id, createdAt: new Date().toISOString() };
  db.jobs.push(job);
  save();
  return `✅ Job ${job.code || job.title} created (${formatDate(job.createdAt)})`;
}

module.exports = { db, save, createClient, createJob, nextJobId, nextClientId };