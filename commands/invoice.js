const { SlashCommandBuilder } = require('discord.js');
const { loadDB, saveDB } = require('../utils/db');
const { generateInvoiceEmbed } = require('../utils/invoiceEmbed');
const fs = require('fs');
const path = require('path');

const INVOICE_PATH = path.join(__dirname, '..', 'data', 'invoices.json');

function loadInvoices() {
  if (!fs.existsSync(INVOICE_PATH)) return [];
  return JSON.parse(fs.readFileSync(INVOICE_PATH));
}
function saveInvoices(data) {
  fs.writeFileSync(INVOICE_PATH, JSON.stringify(data, null, 2));
}

let lastInvoiceNumber = 671; // start from 000672

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invoice')
    .setDescription('Manage invoices')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new invoice')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('job').setDescription('Job').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('due').setDescription('Due date (YYYY-MM-DD)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional notes')
        )
        .addStringOption(opt =>
          opt.setName('terms').setDescription('Optional terms')
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const db = loadDB();

    if (focused.name === 'client') {
      const clients = db.clients || [];
      const results = clients.map(c => ({
        name: `${c.code} - ${c.name}`,
        value: c.code
      }));
      await interaction.respond(results.slice(0, 25));
    }

    if (focused.name === 'job') {
      const clientCode = interaction.options.getString('client');
      const jobs = (db.jobs || []).filter(j => j.clientCode === clientCode);
      const results = jobs.map(j => ({
        name: `${j.id} - ${j.title}`,
        value: j.id
      }));
      await interaction.respond(results.slice(0, 25));
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const clientCode = interaction.options.getString('client');
      const jobId = interaction.options.getString('job');
      const due = interaction.options.getString('due');
      const notes = interaction.options.getString('notes') || '';
      const terms = interaction.options.getString('terms') || '';

      const db = loadDB();
      const client = db.clients.find(c => c.code === clientCode);
      const job = db.jobs.find(j => j.id === jobId);

      if (!client || !job) {
        return interaction.reply({ content: '❌ Invalid client or job.', flags: 64 });
      }

      const invoices = loadInvoices();

      lastInvoiceNumber++;
      const invoiceNumber = String(lastInvoiceNumber).padStart(6, '0');

      const invoice = {
        id: invoiceNumber,
        clientId: client.id,
        clientCode: client.code,
        jobId: job.id,
        status: 'draft',
        issuedAt: new Date().toISOString(),
        dueAt: due,
        items: [],
        notes,
        terms,
        total: 0
      };

      invoices.push(invoice);
      saveInvoices(invoices);

      await interaction.reply({
        embeds: [generateInvoiceEmbed(invoice, client, job)],
        flags: 64
      });
    }
  }
};