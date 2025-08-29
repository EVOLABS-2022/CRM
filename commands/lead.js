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
        
        // Ensure lead has a client code (needed for channel creation)
        if (!lead.code || lead.code.trim() === '') {
          // Generate client code from first 4 letters like in client creation
          const clients = await getClients();
          let baseCode = lead.name.substring(0, 4).toUpperCase();
          let code = baseCode;
          let counter = 1;
          while (clients.some(c => c.code === code)) {
            code = baseCode.substring(0, 3) + counter;
            counter++;
          }
          updates.code = code;
          console.log('🔧 Generated missing client code for lead:', lead.name, '->', code);
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
          
          // Get the updated client data from sheets to ensure we have all the new info
          const refreshedClients = await getClients();
          const refreshedClient = refreshedClients.find(c => 
            c.id === (updates.id || lead.id) || c.name === lead.name
          );
          
          if (!refreshedClient) {
            throw new Error('Could not find refreshed client data after conversion');
          }
          
          // Create the client card (this handles channel creation, card creation, and pinning)
          const clientCard = await ensureClientCard(interaction.client, interaction.guildId, refreshedClient);
          
          if (clientCard) {
            console.log('✅ Client channel and card created successfully');
            
            // Pin the client card message
            try {
              await clientCard.pin();
              console.log('📌 Client card pinned successfully');
            } catch (pinError) {
              console.warn('⚠️ Could not pin client card:', pinError.message);
            }
            
            // Make sure the channel and message IDs are saved to sheets
            if (refreshedClient.channelId && refreshedClient.clientCardMessageId) {
              try {
                const { updateClientChannel } = require('../lib/sheetsDb');
                await updateClientChannel(refreshedClient.id, refreshedClient.channelId, refreshedClient.clientCardMessageId);
                console.log('💾 Saved channel and message IDs to Google Sheets');
              } catch (saveError) {
                console.error('❌ Failed to save IDs to sheets:', saveError);
              }
            }
          } else {
            throw new Error('Failed to create client card');
          }
        } catch (error) {
          console.error('❌ Failed to create client channel and card:', error);
          // Continue with the process - the conversion is still successful
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
