// index.js

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Events, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const { refreshClientsBoard } = require('./utils/clientBoard');
const { refreshJobsBoard } = require('./utils/jobBoard');
const { refreshInvoicesBoard } = require('./utils/invoiceBoard');

// === Load DBs ===
const dbPath = path.join(__dirname, 'data', 'db.json');
const invoicesPath = path.join(__dirname, 'data', 'invoices.json');

function loadDb() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function loadInvoices() {
  return JSON.parse(fs.readFileSync(invoicesPath, 'utf8'));
}

function saveInvoices(invoices) {
  fs.writeFileSync(invoicesPath, JSON.stringify(invoices, null, 2));
}

// === Sheets Sync Stubs ===
async function syncClientsToSheets(clients) {
  console.log(`📊 [Sheets] Would sync ${clients.length} clients`);
}

async function syncJobsToSheets(jobs) {
  console.log(`📊 [Sheets] Would sync ${jobs.length} jobs`);
}

async function syncInvoicesToSheets(invoices) {
  console.log(`📊 [Sheets] Would sync ${invoices.length} invoices`);
}

// === Main Sync Function ===
async function syncAll(client) {
  console.log('🔄 Full sync started...');
  const db = loadDb();
  const invoices = loadInvoices();

  // Refresh Discord boards
  if (db.clients) await refreshClientsBoard(client, db.clients);
  if (db.jobs) await refreshJobsBoard(client, db.jobs);
  if (invoices) await refreshInvoicesBoard(client, invoices);

  // Push to Google Sheets
  if (db.clients) await syncClientsToSheets(db.clients);
  if (db.jobs) await syncJobsToSheets(db.jobs);
  if (invoices) await syncInvoicesToSheets(invoices);

  console.log('✅ Full sync complete');
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
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// === Manual Sync Command ===
client.commands.set('sync', {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Manually sync all clients, jobs, and invoices from DB to Discord/Sheets'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await syncAll(client);
    await interaction.editReply('✅ Manual sync complete.');
  }
});

// === Interaction Handler ===
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, {
        loadDb,
        saveDb,
        loadInvoices,
        saveInvoices,
        syncAll
      });
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ There was an error executing this command.');
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
      }
    }
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      if (command.autocomplete) {
        await command.autocomplete(interaction, { loadDb, loadInvoices });
      }
    } catch (err) {
      console.error(err);
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