const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getClients, updateClient } = require('../lib/sheetsDb');
const { ensureClientCard } = require('../lib/clientCard');
const { ensureClientFolder } = require('../lib/driveManager');
const { refreshAllBoards } = require('../lib/board');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { refreshLeadsBoard, getLeadsFromClients } = require('../utils/leadBoard');
const { canSeeClientJobData, PERMISSIONS } = require('../config/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lead')
    .setDescription('Manage leads (inactive clients)')
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Show all current leads')
    )
    .addSubcommand(sub =>
      sub
        .setName('convert')
        .setDescription('Convert a lead to an active client')
        .addStringOption(opt =>
          opt.setName('lead').setDescription('Lead to convert').setRequired(true).setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'lead') {
      try {
        const clients = await getClients();
        const leads = getLeadsFromClients(clients);
        
        const choices = leads
          .map(lead => ({
            name: `${lead.code || 'NO-CODE'} - ${lead.name}`,
            value: lead.id
          }))
          .filter(choice => 
            !focused.value || 
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
          )
          .slice(0, 25);
        
        await interaction.respond(choices);
      } catch (error) {
        console.error('Lead autocomplete error:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const clients = await getClients();
        const leads = getLeadsFromClients(clients);
        
        if (leads.length === 0) {
          return await interaction.editReply({
            content: '✅ No leads found! All clients are active. Check the lead board in <#1411029260243566655> for updates.'
          });
        }
        
        const leadList = leads.map(lead => 
          `• **${lead.name}** (${lead.code || 'NO-CODE'}) - ${lead.contactName || 'No contact'}`
        ).join('\n');
        
        await interaction.editReply({
          content: `🆕 **Current Leads (${leads.length})**\n\n${leadList}\n\nUse \`/lead convert <lead>\` to convert a lead to an active client.\nView the full lead board: <#1411029260243566655>`
        });
        
      } catch (error) {
        console.error('❌ Lead list failed:', error);
        await interaction.editReply({
          content: `❌ Failed to list leads: ${error.message}`
        });
      }
    }

    if (sub === 'convert') {
      // Check if user has permission to convert leads (requires Team Lead or higher)
      if (!canSeeClientJobData(interaction.member)) {
        return interaction.reply({ 
          content: '❌ You need Team Lead permissions or higher to convert leads.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const leadId = interaction.options.getString('lead');
      
      try {
        const clients = await getClients();
        const lead = clients.find(c => c.id === leadId);
        
        if (!lead) {
          return await interaction.editReply({
            content: '❌ Lead not found.'
          });
        }
        
        // Check if already active
        const activeStatus = (lead.active || '').toLowerCase();
        if (activeStatus === 'yes') {
          return await interaction.editReply({
            content: `❌ **${lead.name}** is already an active client.`
          });
        }
        
        // First, repair the lead if it's missing ID or auth code
        const updates = { active: 'yes' };
        
        // Check if lead needs repair
        if (!lead.id || lead.id.trim() === '') {
          const { v4: uuidv4 } = require('uuid');
          updates.id = uuidv4();
          console.log('🔧 Generated missing ID for lead:', lead.name);
        }
        
        if (!lead.authCode || lead.authCode.trim() === '') {
          const crypto = require('crypto');
          const generateAuthCode = () => {
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < 8; i++) {
              const randomIndex = crypto.randomInt(0, characters.length);
              result += characters[randomIndex];
            }
            return result;
          };
          updates.authCode = generateAuthCode();
          console.log('🔧 Generated missing auth code for lead:', lead.name);
        }

        // Convert lead to active client
        console.log('🔄 Converting lead to active client:', lead.name);
        const clientIdentifier = lead.id && lead.id.trim() !== '' ? lead.id : lead.name;
        const updatedClient = await updateClient(clientIdentifier, updates);
        
        // Create client folder in Google Drive
        try {
          console.log('📁 Creating Drive folder for converted client:', lead.name);
          const folderId = await ensureClientFolder(lead.code.trim(), lead.name);
          if (folderId) {
            console.log(`✅ Created/found client folder ${lead.code} (ID: ${folderId})`);
          } else {
            console.warn(`⚠️ Could not create/find client folder for ${lead.code}`);
          }
        } catch (error) {
          console.error('❌ Failed to create client folder:', error);
        }

        // Create client channel and card in Discord
        try {
          console.log('🏗️ Creating Discord channel for converted client:', lead.name);
          await ensureClientCard(interaction.client, interaction.guildId, updatedClient);
          console.log('✅ Client card created for converted lead');
        } catch (error) {
          console.error('❌ Failed to create client channel:', error);
        }

        // Refresh all boards to reflect the conversion
        try {
          console.log('🔄 Updating boards after lead conversion...');
          const allClients = await getClients();
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client),
            refreshLeadsBoard(interaction.client, getLeadsFromClients(allClients))
          ]);
          console.log('✅ All boards updated successfully');
        } catch (error) {
          console.error('❌ Failed to update boards:', error);
          // Continue anyway - boards will be updated by scheduler
        }

        await interaction.editReply({
          content: `✅ **Lead converted successfully!**\n\n` +
            `🎉 **${lead.name}** (${lead.code}) is now an active client.\n` +
            `📱 Their Discord channel has been created and they'll appear on the client board.\n` +
            `📁 Google Drive folder has been set up for their files.\n\n` +
            `Check the client board and lead board to see the changes.`
        });
        
      } catch (error) {
        console.error('❌ Lead conversion failed:', error);
        await interaction.editReply({
          content: `❌ Failed to convert lead: ${error.message}`
        });
      }
    }
  }
};
