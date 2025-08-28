// lib/scheduler.js
const schedule = require('node-schedule');
const { getClients, getJobs, getInvoices, initializeSheets } = require('./sheetsDb');
const { refreshAllBoards } = require('./board');
const { refreshAllClientPanels } = require('./clientPanel');
const { refreshInvoicesBoard } = require('../utils/invoiceBoard');
const { refreshAllTaskBoards } = require('../utils/taskBoard');
const { refreshAllAdminBoards } = require('../utils/adminBoard');

function startScheduler(client) {
  console.log('🕒 Auto-sync enabled: every 10 minutes');

  // Run every 10 minutes
  schedule.scheduleJob('*/10 * * * *', async () => {
    await runSyncTick(client);
  });

  // Kick off immediately on startup
  runSyncTick(client);
}

async function runSyncTick(client) {
  console.log('🔄 Scheduled sync starting...');
  try {
    // Initialize sheets if needed
    await initializeSheets();
    
    // Get fresh data from Google Sheets
    const [clients, jobs, invoices] = await Promise.all([
      getClients(),
      getJobs(), 
      getInvoices()
    ]);
    
    console.log(`📋 Scheduled sync: ${clients.length} clients, ${jobs.length} jobs, ${invoices.length} invoices`);
    
    // Refresh all boards in parallel with fresh Sheets data
    await Promise.all([
      refreshAllClientPanels(client),
      refreshAllBoards(client),
      refreshAllTaskBoards(client),
      refreshAllAdminBoards(client)
    ]);
    
    // Refresh invoices board (needs data dependencies)
    await refreshInvoicesBoard(client, invoices, clients, jobs);
    
    console.log('✅ Scheduled sync complete');
  } catch (err) {
    console.error('❌ Scheduled sync failed:', err);
  }
}

module.exports = { startScheduler, runSyncTick };
