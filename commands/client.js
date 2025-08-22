const { SlashCommandBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const { loadDB, saveDB } = require('../utils/db');

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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const contactName = interaction.options.getString('contact_name');
      const contactMethod = interaction.options.getString('contact_method');

      const db = loadDB();
      if (!db.clients) db.clients = [];

      // Generate client code (first 4 letters, enforce uniqueness with suffix)
      let baseCode = name.substring(0, 4).toUpperCase();
      let code = baseCode;
      let counter = 1;
      while (db.clients.some(c => c.code === code)) {
        code = baseCode.substring(0, 3) + counter;
        counter++;
      }

      const client = {
        id: uuidv4(),
        name,
        code,
        contactName,
        contactMethod
      };

      db.clients.push(client);
      saveDB(db);

      await interaction.reply({
        content: `✅ Created client ${name} (Code: ${code}, ID: ${client.id})`,
        flags: 64
      });
    }
  }
};