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
      
      // Get fresh data from Google Sheets in parallel
      console.log('📊 Loading data from Google Sheets...');
      const [clients, jobs, invoices] = await Promise.all([
        getClients(),
        getJobs(), 
        getInvoices()
      ]);
      
      console.log(`📋 Loaded from Sheets: ${clients.length} clients, ${jobs.length} jobs, ${invoices.length} invoices`);
      
      // Update progress: Data loaded
      const progressEmbed1 = new EmbedBuilder()
        .setTitle('🔄 Sync in Progress...')
        .setDescription('Data loaded from Google Sheets. Cleaning up tasks...')
        .setColor(0x3498db);
      await interaction.editReply({ embeds: [progressEmbed1] });
      
      // Clean up orphaned tasks from closed jobs
      await cleanupTasksForClosedJobs();
      
      // Update progress: Channel sync
      const progressEmbed2 = new EmbedBuilder()
        .setTitle('🔄 Sync in Progress...')
        .setDescription('Syncing client channels and cards...')
        .setColor(0x3498db);
      await interaction.editReply({ embeds: [progressEmbed2] });
      
      // Ensure every client has a channel + card first
      console.log('🔄 Starting client channel sync...');
      await syncAllClientChannelsAndCards(interaction.client, interaction.guildId);
      console.log('✅ Client channel sync complete');
      
      // Update progress: Board refresh
      const progressEmbed3 = new EmbedBuilder()
        .setTitle('🔄 Sync in Progress...')
        .setDescription('Refreshing all boards and panels...')
        .setColor(0x3498db);
      await interaction.editReply({ embeds: [progressEmbed3] });
      
      // Then refresh boards with Sheets data in parallel where possible
      await Promise.all([
        refreshAllClientPanels(interaction.client),
        refreshAllBoards(interaction.client),
        refreshAllTaskBoards(interaction.client),
        refreshAllAdminBoards(interaction.client)
      ]);
      
      // Refresh invoices board separately (needs data dependencies)
      await refreshInvoicesBoard(interaction.client, invoices, clients, jobs);

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
