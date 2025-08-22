// commands/sync.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../lib/store');
const { refreshAllClientPanels } = require('../lib/clientPanel');
const { refreshAllBoards } = require('../lib/board');
const { syncAllClientChannelsAndCards } = require('../lib/clientCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Force a full refresh (client cards, client board, job board)'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      // ensure every client has a channel + card first
      await syncAllClientChannelsAndCards(interaction.client, interaction.guildId);
      // then refresh boards
      await refreshAllClientPanels(interaction.client);
      await refreshAllBoards(interaction.client);

      const embed = new EmbedBuilder()
        .setTitle('✅ Sync Complete')
        .setDescription('Client cards + boards refreshed.')
        .addFields(
          { name: 'Clients', value: `${(db.clients || []).length}`, inline: true },
          { name: 'Jobs', value: `${(db.jobs || []).length}`, inline: true },
        )
        .setColor(0x2ecc71);
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sync Failed')
        .setDescription(e?.message || 'Unknown error')
        .setColor(0xe74c3c);
      await interaction.editReply({ embeds: [embed] });
    }
  }
};