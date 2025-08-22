const { SlashCommandBuilder } = require('discord.js');
const { loadDB, saveDB } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('Manage jobs')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new job')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client code').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('title').setDescription('Job title').setRequired(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const db = loadDB();
    const clients = db.clients || [];

    const choices = clients.map(c => ({
      name: `${c.code} - ${c.name}`,
      value: c.code
    }));

    const filtered = choices.filter(c =>
      c.name.toLowerCase().includes(focused.toLowerCase())
    );

    await interaction.respond(filtered.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const clientCode = interaction.options.getString('client');
      const title = interaction.options.getString('title');

      const db = loadDB();
      if (!db.jobs) db.jobs = [];

      const client = db.clients.find(c => c.code === clientCode);
      if (!client) {
        return interaction.reply({
          content: `❌ Client with code ${clientCode} not found.`,
          flags: 64
        });
      }

      // Sequential job number for this client
      const clientJobs = db.jobs.filter(j => j.clientCode === clientCode);
      const number = String(clientJobs.length + 1).padStart(3, '0');
      const code = `${clientCode}-${number}`;

      const job = {
        id: code,
        clientCode,
        clientId: client.id,
        title,
        status: 'open'
      };

      db.jobs.push(job);
      saveDB(db);

      await interaction.reply({
        content: `✅ Created job ${title} (${code}) for ${client.name}`,
        flags: 64
      });
    }
  }
};