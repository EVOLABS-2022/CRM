// lib/scheduler.js
const schedule = require('node-schedule');
const { refreshAllBoards } = require('./board');
const { refreshAllClientPanels } = require('./clientPanel');

function startScheduler(client) {
  console.log('🕒 Auto-sync enabled: every 60 min');

  // Run every 60 minutes
  schedule.scheduleJob('0 * * * *', async () => {
    await runSyncTick(client);
  });

  // Kick off immediately on startup
  runSyncTick(client);
}

async function runSyncTick(client) {
  console.log('🔄 Auto-sync tick starting...');
  try {
    await refreshAllBoards(client);
    await refreshAllClientPanels(client);
    console.log('✅ Auto-sync tick complete');
  } catch (err) {
    console.error('❌ Auto-sync tick failed:', err);
  }
}

module.exports = { startScheduler, runSyncTick };