// lib/smartSync.js
const { fullSync } = require('./fullSync');

// Single-guild debounce + queue system
let debounceTimer = null;
let syncQueue = [];
let isProcessing = false;

/**
 * Smart sync with debouncing and queue
 * - Instant response for user
 * - Debounces rapid operations into single sync
 * - Queue ensures guaranteed execution
 */
function smartSync(client, guildId) {
  console.log('🎯 Smart sync requested - setting debounce timer');
  
  // Clear any existing debounce
  clearTimeout(debounceTimer);
  
  // Set new debounce that adds to queue when it fires
  debounceTimer = setTimeout(() => {
    console.log('⏰ Debounce timer fired - adding to sync queue');
    addToSyncQueue(client, guildId);
  }, 1500); // 1.5 second debounce
}

async function addToSyncQueue(client, guildId) {
  console.log('📋 Adding sync job to queue');
  syncQueue.push({ client, guildId, timestamp: Date.now() });
  processSyncQueue();
}

async function processSyncQueue() {
  if (isProcessing) {
    console.log('⏳ Sync already processing, skipping');
    return;
  }
  
  if (syncQueue.length === 0) {
    console.log('📋 Sync queue empty');
    return;
  }
  
  isProcessing = true;
  console.log(`🔄 Processing ${syncQueue.length} sync job(s)...`);
  
  // Process all queued sync jobs
  while (syncQueue.length > 0) {
    const { client, guildId, timestamp } = syncQueue.shift();
    const age = Date.now() - timestamp;
    
    try {
      console.log(`🔄 Executing sync job (queued ${age}ms ago)`);
      await fullSync(client, guildId);
      console.log('✅ Sync job completed successfully');
    } catch (error) {
      console.error('❌ Sync job failed:', error);
      // Could implement retry logic here if needed
    }
  }
  
  isProcessing = false;
  console.log('✅ All sync jobs processed');
}

/**
 * Force immediate sync (bypass debounce)
 * Use for critical operations like invoice generation
 */
async function immediateSyncAndWait(client, guildId) {
  console.log('🚨 Immediate sync requested');
  await addToSyncQueue(client, guildId);
  
  // Wait for queue to be processed
  while (isProcessing || syncQueue.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('✅ Immediate sync completed');
}

module.exports = { 
  smartSync, 
  immediateSyncAndWait 
};
