// index.js

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, SlashCommandBuilder, MessageFlags } = require('discord.js');
require('dotenv').config();

// Using Google Sheets as primary database - no more local JSON files
const { refreshAllClientPanels } = require('./lib/clientPanel');
const { refreshAllBoards } = require('./lib/board');
const { syncAllClientChannelsAndCards } = require('./lib/clientCard');
const { initializeSheets, getClients, getJobs, getInvoices } = require('./lib/sheetsDb');
const { refreshInvoicesBoard } = require('./utils/invoiceBoard');

// === Main Sync Function ===
async function syncAll(client) {
  console.log('🔄 Full sync started...');
  
  try {
    // Initialize Google Sheets if needed
    await initializeSheets();
    
    // Get fresh data from Google Sheets
    const clients = await getClients();
    const jobs = await getJobs();
    const invoices = await getInvoices();
    
    // Sync client channels first
    console.log('🔄 Syncing client channels...');
    for (const [guildId] of client.guilds.cache) {
      await syncAllClientChannelsAndCards(client, guildId);
    }
    
    // Refresh all boards with latest data from Sheets
    console.log('🔄 Refreshing boards...');
    await refreshAllClientPanels(client);
    await refreshAllBoards(client);
    await refreshInvoicesBoard(client, invoices, clients, jobs);
    
    console.log('✅ Full sync complete');
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

// === Discord Client ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command && !command.disabled) {
    client.commands.set(command.data.name, command);
  } else if (command.disabled) {
    console.log(`⚠️ Command ${file} is disabled`);
  }
}

// Sync command is now in commands/sync.js

// === Interaction Handler ===
client.on(Events.InteractionCreate, async interaction => {
  console.log('🔧 Interaction received:', interaction.type, interaction.commandName || 'no command');
  
  if (interaction.isChatInputCommand()) {
    console.log('🎯 Chat input command:', interaction.commandName);
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.log('❌ Command not found:', interaction.commandName);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ There was an error executing this command.');
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command.', flags: MessageFlags.Ephemeral });
      }
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      if (command.autocomplete) {
        await command.autocomplete(interaction);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Handle modal submits for invoice editing
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('edit_invoice_')) {
      const invoiceId = interaction.customId.replace('edit_invoice_', '');
      
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const { getInvoices, updateInvoice, getClients, getJobs } = require('./lib/sheetsDb');
        const { generateInvoiceEmbed } = require('./utils/invoiceEmbed');
        const { refreshInvoicesBoard } = require('./utils/invoiceBoard');
        const chrono = require('chrono-node');
        
        // Get current invoice
        const invoices = await getInvoices();
        const invoice = invoices.find(inv => inv.id === invoiceId);
        
        if (!invoice) {
          return await interaction.editReply({
            content: '❌ Invoice not found.'
          });
        }

        // Get form values
        const newStatus = interaction.fields.getTextInputValue('status').trim();
        const newDueDate = interaction.fields.getTextInputValue('due_date').trim();
        const newNotes = interaction.fields.getTextInputValue('notes').trim();
        const newTerms = interaction.fields.getTextInputValue('terms').trim();
        const newLineItemsText = interaction.fields.getTextInputValue('line_items').trim();

        const updates = {};

        // Update status if changed
        if (newStatus && newStatus !== invoice.status) {
          const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
          if (validStatuses.includes(newStatus.toLowerCase())) {
            updates.status = newStatus.toLowerCase();
          } else {
            return await interaction.editReply({
              content: `❌ Invalid status. Valid options: ${validStatuses.join(', ')}`
            });
          }
        }

        // Update due date if changed
        if (newDueDate && newDueDate !== invoice.dueAt) {
          const parsedDue = chrono.parseDate(newDueDate);
          if (!parsedDue) {
            return await interaction.editReply({
              content: '❌ Could not understand the due date format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          updates.dueAt = parsedDue.toISOString().split('T')[0];
        }

        // Update notes if changed
        if (newNotes !== invoice.notes) {
          updates.notes = newNotes;
        }

        // Update terms if changed
        if (newTerms !== invoice.terms) {
          updates.terms = newTerms;
        }

        // Parse line items
        if (newLineItemsText !== '') {
          const lineItems = [];
          const lines = newLineItemsText.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const match = line.match(/^(?:\d+\.\s*)?(.+?)\s*-\s*\$?([0-9.]+)$/);
            if (match) {
              const [, description, priceStr] = match;
              const price = parseFloat(priceStr);
              if (!isNaN(price)) {
                lineItems.push({
                  description: description.trim(),
                  price: price
                });
              }
            }
          }
          
          if (lineItems.length > 10) {
            return await interaction.editReply({
              content: '❌ Maximum 10 line items allowed per invoice.'
            });
          }
          
          updates.lineItems = lineItems;
        } else {
          // Empty field means clear all line items
          updates.lineItems = [];
        }

        // Check if any changes were made
        if (Object.keys(updates).length === 0) {
          return await interaction.editReply({
            content: '❌ No changes detected.'
          });
        }

        // Update the invoice
        const updatedInvoice = await updateInvoice(invoiceId, updates);
        
        if (!updatedInvoice) {
          return await interaction.editReply({
            content: '❌ Failed to update invoice.'
          });
        }

        // Refresh invoice board
        try {
          const allClients = await getClients();
          const allJobs = await getJobs();
          const allInvoices = await getInvoices();
          await refreshInvoicesBoard(interaction.client, allInvoices, allClients, allJobs);
        } catch (error) {
          console.error('❌ Failed to refresh invoice board:', error);
        }

        // Get client and job for display
        const clients = await getClients();
        const jobs = await getJobs();
        const client = clients.find(c => c.id === updatedInvoice.clientId);
        const job = jobs.find(j => j.id === updatedInvoice.jobId);

        await interaction.editReply({
          content: '✅ Invoice updated successfully!',
          embeds: [generateInvoiceEmbed(updatedInvoice, client, job)]
        });

      } catch (error) {
        console.error('❌ Invoice modal submit failed:', error);
        if (interaction.deferred) {
          await interaction.editReply({
            content: `❌ Failed to update invoice: ${error.message}`
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to update invoice: ${error.message}`,
            flags: MessageFlags.Ephemeral
          });
        }
      }
    }
  }
});

// === Auto-Sync Timer ===
client.once(Events.ClientReady, async c => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  // Kick off first sync immediately
  await syncAll(client);

  // Auto-sync every 60 minutes
  setInterval(async () => {
    await syncAll(client);
  }, 60 * 60 * 1000);
});

client.login(process.env.BOT_TOKEN);