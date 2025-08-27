const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { createClient, getClients, updateClientChannel, updateClient } = require('../lib/sheetsDb');
const { ensureClientCard } = require('../lib/clientCard');
const { refreshAllBoards } = require('../lib/board');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { ensureClientFolder } = require('../lib/driveManager');
const { hasPermission, PERMISSIONS } = require('../config/roles');

// Generate 8-character auth code (mix of upper/lower letters and numbers)
function generateAuthCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, characters.length);
    result += characters[randomIndex];
  }
  
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('client')
    .setDescription('Manage clients')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new client')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Client name').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('contact_name').setDescription('Contact name').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('contact_method').setDescription('Contact method').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit an existing client')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client to edit').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('name').setDescription('New client name')
        )
        .addStringOption(opt =>
          opt.setName('code').setDescription('New 4-character client code')
        )
        .addStringOption(opt =>
          opt.setName('contact_name').setDescription('New contact name')
        )
        .addStringOption(opt =>
          opt.setName('contact_method').setDescription('New contact method')
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('What the client is (business type, etc.)')
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Notes about previous work and interactions')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('migrate-auth')
        .setDescription('Add auth codes to existing clients that don\'t have them')
    )
    .addSubcommand(sub =>
      sub
        .setName('cleanup-channels')
        .setDescription('Remove duplicate client channels and fix channel mappings')
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'client') {
      try {
        const clients = await getClients();
        const choices = clients
          .filter(c => !c.archived)
          .map(c => ({
            name: `${c.code} - ${c.name}`,
            value: c.id
          }))
          .filter(choice => 
            !focused.value || 
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
          )
          .slice(0, 25);
        
        await interaction.respond(choices);
      } catch (error) {
        console.error('Client autocomplete error:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      // Defer reply to prevent timeout during processing
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      // Check if user has permission to create clients (requires DATA_ONLY or higher)
      if (!hasPermission(interaction.member, PERMISSIONS.DATA_ONLY)) {
        return interaction.editReply({ 
          content: '❌ You need Team Lead permissions or higher to create clients.'
        });
      }
      
      const name = interaction.options.getString('name');
      const contactName = interaction.options.getString('contact_name');
      const contactMethod = interaction.options.getString('contact_method');

      try {
        // Get existing clients to generate unique code
        const existingClients = await getClients();
        
        // Generate client code (first 4 letters, enforce uniqueness with suffix)
        let baseCode = name.substring(0, 4).toUpperCase();
        let code = baseCode;
        let counter = 1;
        while (existingClients.some(c => c.code === code)) {
          code = baseCode.substring(0, 3) + counter;
          counter++;
        }

        // Generate unique auth code
        let authCode;
        do {
          authCode = generateAuthCode();
        } while (existingClients.some(c => c.authCode === authCode));

        const client = {
          id: uuidv4(),
          name,
          code,
          authCode,
          contactName,
          contactMethod
        };

        // Save to Google Sheets
        console.log('💾 Saving client to Google Sheets:', client.name);
        await createClient(client);

        // Create client folder in Google Drive
        try {
          console.log('📁 Creating Drive folder for client:', client.name);
          const folderId = await ensureClientFolder(client.code.trim(), client.name);
          if (folderId) {
            console.log(`✅ Created/found client folder ${client.code} (ID: ${folderId})`);
          } else {
            console.warn(`⚠️ Could not create/find client folder for ${client.code}`);
          }
        } catch (error) {
          console.error('❌ Failed to create client folder:', error);
        }

        // Create client channel and card in Discord
        try {
          console.log('🏗️ Creating Discord channel for client:', client.name);
          await ensureClientCard(interaction.client, interaction.guildId, client);
          
          // Update client with channel info in Sheets
          if (client.channelId && client.clientCardMessageId) {
            await updateClientChannel(client.id, client.channelId, client.clientCardMessageId);
            console.log('✅ Updated client channel info in Sheets');
          }
        } catch (error) {
          console.error('❌ Failed to create client channel:', error);
        }

        // Update relevant boards with fresh Sheets data
        try {
          console.log('🔄 Updating boards after client creation...');
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
          console.log('✅ Boards updated successfully');
        } catch (error) {
          console.error('❌ Failed to update boards:', error);
          // Continue anyway - boards will be updated by scheduler
        }

        await interaction.editReply({
          content: `✅ Created client ${name} (Code: ${code}, Auth: ${authCode}, ID: ${client.id})`
        });
        
      } catch (error) {
        console.error('❌ Client creation failed:', error);
        await interaction.editReply({
          content: `❌ Failed to create client: ${error.message}`
        });
      }
    }

    if (sub === 'edit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const clientId = interaction.options.getString('client');
      const newName = interaction.options.getString('name');
      const newCode = interaction.options.getString('code');
      const newContactName = interaction.options.getString('contact_name');
      const newContactMethod = interaction.options.getString('contact_method');
      const newDescription = interaction.options.getString('description');
      const newNotes = interaction.options.getString('notes');

      try {
        // Check if client exists
        const clients = await getClients();
        const client = clients.find(c => c.id === clientId);
        
        if (!client) {
          return await interaction.editReply({
            content: '❌ Client not found.'
          });
        }

        // Validate code if provided
        if (newCode) {
          if (newCode.length !== 4) {
            return await interaction.editReply({
              content: '❌ Client code must be exactly 4 characters.'
            });
          }
          
          // Check if code is already in use by another client
          const existingClient = clients.find(c => c.code === newCode.toUpperCase() && c.id !== clientId);
          if (existingClient) {
            return await interaction.editReply({
              content: `❌ Code ${newCode.toUpperCase()} is already in use by ${existingClient.name}.`
            });
          }
        }

        // Build updates object
        const updates = {};
        if (newName) updates.name = newName;
        if (newCode) updates.code = newCode.toUpperCase();
        if (newContactName) updates.contactName = newContactName;
        if (newContactMethod) updates.contactMethod = newContactMethod;
        if (newDescription) updates.description = newDescription;
        if (newNotes) updates.notes = newNotes;

        if (Object.keys(updates).length === 0) {
          return await interaction.editReply({
            content: '❌ No changes provided. Please specify at least one field to update.'
          });
        }

        // Update client in Google Sheets
        console.log('📝 Updating client in Google Sheets:', client.name);
        const updatedClient = await updateClient(clientId, updates);

        // Refresh client card and boards
        try {
          await ensureClientCard(interaction.client, interaction.guildId, updatedClient);
          await refreshAllBoards(interaction.client);
          console.log('✅ Client card and boards refreshed');
        } catch (error) {
          console.error('❌ Failed to refresh client card/boards:', error);
        }

        const changedFields = Object.keys(updates).map(key => {
          const oldValue = client[key] || 'empty';
          const newValue = updates[key];
          return `${key}: ${oldValue} → ${newValue}`;
        }).join('\n');

        await interaction.editReply({
          content: `✅ Updated client ${updatedClient.name}\n\`\`\`\n${changedFields}\n\`\`\``
        });
        
      } catch (error) {
        console.error('❌ Client edit failed:', error);
        await interaction.editReply({
          content: `❌ Failed to edit client: ${error.message}`
        });
      }
    }

    if (sub === 'migrate-auth') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const clients = await getClients();
        const clientsNeedingAuth = clients.filter(c => !c.authCode);
        
        if (clientsNeedingAuth.length === 0) {
          return await interaction.editReply({
            content: '✅ All clients already have auth codes.'
          });
        }

        let updated = 0;
        for (const client of clientsNeedingAuth) {
          // Generate unique auth code
          let authCode;
          do {
            authCode = generateAuthCode();
          } while (clients.some(c => c.authCode === authCode));
          
          // Update client with auth code
          await updateClient(client.id, { authCode });
          console.log(`✅ Added auth code ${authCode} to client ${client.name}`);
          updated++;
        }

        await interaction.editReply({
          content: `✅ Added auth codes to ${updated} clients. Please restart the bot to refresh client cards.`
        });
        
      } catch (error) {
        console.error('❌ Auth migration failed:', error);
        await interaction.editReply({
          content: `❌ Failed to migrate auth codes: ${error.message}`
        });
      }
    }

    if (sub === 'cleanup-channels') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const guild = interaction.guild;
        const clients = await getClients();
        
        // Find CRM category
        const crmCategory = guild.channels.cache.find(
          c => c.type === 4 && c.name === '🗂️ | CRM' // ChannelType.GuildCategory = 4
        );
        
        if (!crmCategory) {
          return await interaction.editReply({
            content: '❌ CRM category not found.'
          });
        }

        let duplicatesRemoved = 0;
        let channelsFixed = 0;
        
        // For each client, find their channels
        for (const client of clients) {
          const cleanCode = client.code.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
          const cleanName = client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const expectedName = `🪪-${cleanCode}-${cleanName}`;
          
          // Also check for old format with spaces/special chars
          const oldName = `🪪-${client.code.toLowerCase()}-${cleanName}`;
          
          // Find all channels matching either pattern
          const matchingChannels = guild.channels.cache.filter(
            c => (c.name === expectedName || c.name === oldName) && c.type === 0 // ChannelType.GuildText = 0
          );
          
          if (matchingChannels.size > 1) {
            console.log(`🔍 Found ${matchingChannels.size} channels for ${client.name}: ${expectedName}`);
            
            // Keep the first one in the CRM category, delete the rest
            const channelsArray = Array.from(matchingChannels.values());
            const crmChannels = channelsArray.filter(c => c.parentId === crmCategory.id);
            const otherChannels = channelsArray.filter(c => c.parentId !== crmCategory.id);
            
            let keepChannel;
            if (crmChannels.length > 0) {
              keepChannel = crmChannels[0];
              // Delete other CRM channels
              for (let i = 1; i < crmChannels.length; i++) {
                await crmChannels[i].delete('Removing duplicate client channel');
                duplicatesRemoved++;
              }
            } else {
              keepChannel = channelsArray[0];
              // Move to CRM category
              await keepChannel.setParent(crmCategory.id);
            }
            
            // Delete all other channels
            for (const channel of otherChannels) {
              await channel.delete('Removing duplicate client channel');
              duplicatesRemoved++;
            }
            
            // Update client record with correct channel ID
            if (client.channelId !== keepChannel.id) {
              await updateClientChannel(client.id, keepChannel.id, client.clientCardMessageId || '');
              channelsFixed++;
              console.log(`✅ Updated ${client.name} to use channel ${keepChannel.id}`);
            }
          }
        }

        await interaction.editReply({
          content: `✅ Cleanup complete! Removed ${duplicatesRemoved} duplicate channels and fixed ${channelsFixed} channel mappings.`
        });
        
      } catch (error) {
        console.error('❌ Channel cleanup failed:', error);
        await interaction.editReply({
          content: `❌ Failed to cleanup channels: ${error.message}`
        });
      }
    }
  }
};
