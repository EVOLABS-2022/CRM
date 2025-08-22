// lib/maintenance.js
const { listClients, listJobs, updateJob } = require('./store');

function codeFromName(name) {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const base = cleaned || 'GEN';
  return base.slice(0, 4).padEnd(4, 'X');
}

function sortKey(j) {
  if (j.createdAt) return j.createdAt;
  const n = parseInt(String(j.id).slice(1), 10);
  return isNaN(n) ? j.id : String(n).padStart(9, '0');
}

function backfillJobCodes() {
  const clients = listClients();
  const jobs = listJobs().slice().sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const clientsById = new Map(clients.map(c => [c.id, c]));
  const counters = new Map();

  let updated = 0;
  for (const j of jobs) {
    const key = j.clientId || null;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);

    const client = j.clientId ? clientsById.get(j.clientId) : null;
    const prefix = client ? (client.code || codeFromName(client.name)) : 'GEN';
    const desired = `${prefix}-${String(next).padStart(3, '0')}`;

    if (j.code !== desired) {
      updateJob(j.id, { code: desired });
      updated++;
    }
  }
  return { updated, total: jobs.length };
}

function backfillJobCodesForClient(clientId) {
  const clients = listClients();
  const client = clients.find(c => c.id === clientId);
  const prefix = client ? (client.code || codeFromName(client.name)) : 'GEN';

  const jobs = listJobs()
    .filter(j => j.clientId === clientId)
    .slice()
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

  let updated = 0;
  jobs.forEach((j, i) => {
    const desired = `${prefix}-${String(i + 1).padStart(3, '0')}`;
    if (j.code !== desired) {
      updateJob(j.id, { code: desired });
      updated++;
    }
  });

  return { clientId, prefix, updated, total: jobs.length };
}

module.exports = { backfillJobCodes, backfillJobCodesForClient };