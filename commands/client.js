const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { createClient, getClients, updateClientChannel, updateClient } = require('../lib/sheetsDb');
const { ensureClientCard } = require('../lib/clientCard');
const { refreshAllBoards } = require('../lib/board');
const { smartSync } = require('../lib/smartSync');

// Generate 8-character auth code (mix of letters and numbers)
function generateAuthCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
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

        // Smart sync - instant response, background sync
        smartSync(interaction.client, interaction.guildId);

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
  }
};
