// commands/sync.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getClients, getJobs, getInvoices, initializeSheets, cleanupTasksForClosedJobs } = require('../lib/sheetsDb');
const { refreshAllClientPanels } = require('../lib/clientPanel');
const { refreshAllBoards } = require('../lib/board');
const { syncAllClientChannelsAndCards } = require('../lib/clientCard');
const { refreshInvoicesBoard } = require('../utils/invoiceBoard');
const { refreshAllTaskBoards } = require('../utils/taskBoard');
const { refreshAllAdminBoards } = require('../utils/adminBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Force a full refresh (client cards, client board, job board)'),
  
  async execute(interaction) {
    console.log('🔧 Manual /sync command executed by user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      // Initialize sheets if needed
      await initializeSheets();
      
      // Get fresh data from Google Sheets
      console.log('📊 Loading data from Google Sheets...');
      const clients = await getClients();
      const jobs = await getJobs();
      const invoices = await getInvoices();
      
      console.log(`📋 Loaded from Sheets: ${clients.length} clients, ${jobs.length} jobs, ${invoices.length} invoices`);
      
      // Clean up orphaned tasks from closed jobs
      await cleanupTasksForClosedJobs();
      
      // Ensure every client has a channel + card first
      console.log('🔄 Starting client channel sync...');
      await syncAllClientChannelsAndCards(interaction.client, interaction.guildId);
      console.log('✅ Client channel sync complete');
      
      // Then refresh boards with Sheets data
      await refreshAllClientPanels(interaction.client);
      await refreshAllBoards(interaction.client);
      await refreshAllTaskBoards(interaction.client);
      await refreshInvoicesBoard(interaction.client, invoices, clients, jobs);
      await refreshAllAdminBoards(interaction.client);

      const embed = new EmbedBuilder()
        .setTitle('✅ Sync Complete')
        .setDescription('Client cards, boards refreshed from Google Sheets.')
        .addFields(
          { name: 'Clients', value: `${clients.length}`, inline: true },
          { name: 'Jobs', value: `${jobs.length}`, inline: true },
          { name: 'Invoices', value: `${invoices.length}`, inline: true },
        )
        .setColor(0x2ecc71);
        
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      const embed = new EmbedBuilder()
        .setTitle('❌ Sync Failed')
        .setDescription(error?.message || 'Unknown error')
        .setColor(0xe74c3c);
      await interaction.editReply({ embeds: [embed] });
    }
  }
};