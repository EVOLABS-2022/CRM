// lib/fullSync.js
const { getClients, getJobs, getInvoices, cleanupTasksForClosedJobs } = require('./sheetsDb');
const { refreshAllClientPanels } = require('./clientPanel');
const { refreshAllBoards } = require('./board');
const { refreshAllTaskBoards } = require('../utils/taskBoard');
const { refreshInvoicesBoard } = require('../utils/invoiceBoard');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { syncAllClientChannelsAndCards } = require('./clientCard');

async function fullSync(client, guildId) {
  try {
    console.log('🔄 Starting full sync after CRUD operation...');
    
    // Get fresh data from Google Sheets in parallel
    const [clients, jobs, invoices] = await Promise.all([
      getClients(),
      getJobs(), 
      getInvoices()
    ]);
    
    // Clean up orphaned tasks from closed jobs
    await cleanupTasksForClosedJobs();
    
    // Ensure every client has a channel + card first
    await syncAllClientChannelsAndCards(client, guildId);
    
    // Refresh all boards in parallel
    await Promise.all([
      refreshAllClientPanels(client),
      refreshAllBoards(client),
      refreshAllTaskBoards(client),
      refreshAllAdminBoards(client)
    ]);
    
    // Refresh invoices board (needs data dependencies)
    await refreshInvoicesBoard(client, invoices, clients, jobs);
    
    console.log('✅ Full sync completed successfully');
    
  } catch (error) {
    console.error('❌ Full sync failed:', error);
    throw error; // Re-throw so calling command can handle it
  }
}

module.exports = { fullSync };
