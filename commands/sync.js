// commands/sync.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getClients, getJobs, getInvoices, initializeSheets } = require('../lib/sheetsDb');
const { refreshAllClientPanels } = require('../lib/clientPanel');
const { refreshAllBoards } = require('../lib/board');
const { refreshInvoicesBoard } = require('../utils/invoiceBoard');
const { refreshAllTaskBoards } = require('../utils/taskBoard');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { refreshLeadsBoard, getLeadsFromClients } = require('../utils/leadBoard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Refresh all boards and panels with latest Google Sheets data'),
  
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
      
      // Update progress: Board refresh
      const progressEmbed = new EmbedBuilder()
        .setTitle('🔄 Sync in Progress...')
        .setDescription('Refreshing all boards and panels from Google Sheets...')
        .setColor(0x3498db);
      await interaction.editReply({ embeds: [progressEmbed] });
      
      // Refresh all boards in parallel with fresh Sheets data
      await Promise.all([
        refreshAllClientPanels(interaction.client),
        refreshAllBoards(interaction.client),
        refreshAllTaskBoards(interaction.client),
        refreshAllAdminBoards(interaction.client)
      ]);
      
      // Refresh boards that need data dependencies
      const leads = getLeadsFromClients(clients);
      await Promise.all([
        refreshInvoicesBoard(interaction.client, invoices, clients, jobs),
        refreshLeadsBoard(interaction.client, leads)
      ]);

      const embed = new EmbedBuilder()
        .setTitle('✅ Sync Complete')
        .setDescription('All boards and panels refreshed with latest Google Sheets data.')
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
