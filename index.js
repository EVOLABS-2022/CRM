// index.js
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js');
require('dotenv').config();

const { initializeSheets, getClients, getJobs, getInvoices } = require('./lib/sheetsDb');
const { repairInfrastructure } = require('./lib/infrastructureRepair');
const { startScheduler } = require('./lib/scheduler');

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

// === Interaction Handler (bind once) ===
if (!global.__BENTO_INTERACTIONS_BOUND__) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      console.log('🔧 Interaction received:', interaction.type, interaction.commandName || 'no command');

      // 1) Autocomplete
      if (interaction.isAutocomplete()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction);
        return; // IMPORTANT: stop here
      }

      // 2) Slash commands
      if (interaction.isChatInputCommand()) {
        console.log('🎯 Chat input command:', interaction.commandName);
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd?.execute) return;

        try {
          await cmd.execute(interaction);
        } catch (err) {
          console.error('execute error:', err);
          const payload = { content: '❌ There was an error executing this command.', flags: MessageFlags.Ephemeral };
          if (interaction.deferred || interaction.replied) {
            try { await interaction.followUp(payload); } catch {}
          } else {
            try { await interaction.reply(payload); } catch {}
          }
        }
        return; // stop here
      }

      // 3) Modal submits (invoice edit)
      if (interaction.isModalSubmit()) {
        // Fallback to legacy invoice modal handling
        if (interaction.customId.startsWith('edit_invoice_')) {
          const invoiceId = interaction.customId.replace('edit_invoice_', '');
          try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const { getInvoices, updateInvoice, getClients, getJobs } = require('./lib/sheetsDb');
            const { generateInvoiceEmbed } = require('./utils/invoiceEmbed');
            const { refreshInvoicesBoard } = require('./utils/invoiceBoard');
            const chrono = require('chrono-node');

            // Current invoice
            const invoices = await getInvoices();
            const invoice = invoices.find(inv => inv.id === invoiceId);
            if (!invoice) {
              return await interaction.editReply({ content: '❌ Invoice not found.' });
            }

            // Form values
            const newStatus = interaction.fields.getTextInputValue('status').trim();
            const newDueDate = interaction.fields.getTextInputValue('due_date').trim();
            const newNotes = interaction.fields.getTextInputValue('notes').trim();
            const newTerms = interaction.fields.getTextInputValue('terms').trim();
            const newLineItemsText = interaction.fields.getTextInputValue('line_items').trim();

            const updates = {};

            // Status
            if (newStatus && newStatus !== invoice.status) {
              const valid = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
              if (!valid.includes(newStatus.toLowerCase())) {
                return await interaction.editReply({ content: `❌ Invalid status. Valid options: ${valid.join(', ')}` });
              }
              updates.status = newStatus.toLowerCase();
            }

            // Due date
            if (newDueDate && newDueDate !== invoice.dueAt) {
              const parsedDue = chrono.parseDate(newDueDate);
              if (!parsedDue) {
                return await interaction.editReply({
                  content: '❌ Could not understand the due date. Try "next Friday", "in 2 weeks", "Dec 15".'
                });
              }
              updates.dueAt = parsedDue.toISOString().split('T')[0];
            }

            // Notes / Terms
            if (newNotes !== invoice.notes) updates.notes = newNotes;
            if (newTerms !== invoice.terms) updates.terms = newTerms;

            // Line items
            if (newLineItemsText !== '') {
              const lineItems = [];
              const lines = newLineItemsText.split('\n').filter(Boolean);
              for (const line of lines) {
                const match = line.match(/^(?:\d+\.\s*)?(.+?)\s*-\s*\$?([0-9.]+)$/);
                if (match) {
                  const [, description, priceStr] = match;
                  const price = parseFloat(priceStr);
                  if (!Number.isNaN(price)) {
                    lineItems.push({ description: description.trim(), price });
                  }
                }
              }
              if (lineItems.length > 10) {
                return await interaction.editReply({ content: '❌ Max 10 line items per invoice.' });
              }
              updates.lineItems = lineItems;
            } else {
              updates.lineItems = [];
            }

            if (Object.keys(updates).length === 0) {
              return await interaction.editReply({ content: '❌ No changes detected.' });
            }

            // Update & refresh board
            const updatedInvoice = await updateInvoice(invoiceId, updates);
            if (!updatedInvoice) return await interaction.editReply({ content: '❌ Failed to update invoice.' });

            try {
              const allClients = await getClients();
              const allJobs = await getJobs();
              const allInvoices = await getInvoices();
              await refreshInvoicesBoard(interaction.client, allInvoices, allClients, allJobs);
            } catch (e) {
              console.error('❌ Failed to refresh invoice board:', e);
            }

            // Compose embed
            const clients = await getClients();
            const jobs = await getJobs();
            const clientEnt = clients.find(c => c.id === updatedInvoice.clientId);
            const jobEnt = jobs.find(j => j.id === updatedInvoice.jobId);

            await interaction.editReply({
              content: '✅ Invoice updated successfully!',
              embeds: [generateInvoiceEmbed(updatedInvoice, clientEnt, jobEnt)]
            });
          } catch (error) {
            console.error('❌ Invoice modal submit failed:', error);
            const payload = { content: `❌ Failed to update invoice: ${error.message}`, flags: MessageFlags.Ephemeral };
            if (interaction.deferred || interaction.replied) {
              try { await interaction.followUp(payload); } catch {}
            } else {
              try { await interaction.reply(payload); } catch {}
            }
          }
        }
        return; // stop here
      }
    } catch (outerErr) {
      console.error('interaction wrapper error:', outerErr);
    }
  });

  global.__BENTO_INTERACTIONS_BOUND__ = true;
}

// === Bot Startup ===
client.once(Events.ClientReady, async c => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  console.log('🔧 Starting infrastructure repair...');
  for (const [guildId] of client.guilds.cache) {
    await repairInfrastructure(client, guildId);
  }

  console.log('🕒 Starting scheduled sync...');
  startScheduler(client);
});

client.login(process.env.BOT_TOKEN);
