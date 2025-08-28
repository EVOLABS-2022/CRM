// lib/infrastructureRepair.js
const { getClients, getJobs, initializeSheets } = require('./sheetsDb');
const { syncClientFolders, syncJobFolders } = require('./driveManager');
const { syncAllClientChannelsAndCards } = require('./clientCard');

/**
 * Repair missing infrastructure on startup
 * - Ensures all clients have Google Drive folders
 * - Ensures all jobs have Google Drive folders  
 * - Ensures all clients have Discord channels
 * - Does NOT regenerate boards/embeds (that's handled by sync)
 */
async function repairInfrastructure(client, guildId) {
  console.log('🔧 Starting infrastructure repair...');
  
  try {
    // Initialize sheets if needed
    await initializeSheets();
    
    // Get fresh data from Google Sheets
    const [clients, jobs] = await Promise.all([
      getClients(),
      getJobs()
    ]);
    
    console.log(`📊 Infrastructure check: ${clients.length} clients, ${jobs.length} jobs`);
    
    // Repair Google Drive folders
    console.log('📁 Repairing Google Drive folder structure...');
    await syncClientFolders(clients);
    await syncJobFolders(clients, jobs);
    
    // Repair Discord channels (creates missing channels and cards)
    console.log('💬 Repairing Discord channel structure...');
    await syncAllClientChannelsAndCards(client, guildId);
    
    console.log('✅ Infrastructure repair complete');
    
  } catch (error) {
    console.error('❌ Infrastructure repair failed:', error);
    throw error;
  }
}

module.exports = { repairInfrastructure };
