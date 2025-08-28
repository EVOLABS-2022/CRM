const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { getCacheStats, invalidateAllCache, refreshCache } = require('../lib/dataCache');
const { canSeeClientJobData } = require('../config/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cache')
    .setDescription('Manage and monitor data cache')
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('View cache statistics and performance')
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Clear all cached data (force refresh)')
    )
    .addSubcommand(sub =>
      sub
        .setName('refresh')
        .setDescription('Refresh specific cache')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Which cache to refresh')
            .setRequired(true)
            .addChoices(
              { name: 'Clients', value: 'clients' },
              { name: 'Jobs', value: 'jobs' },
              { name: 'Invoices', value: 'invoices' },
              { name: 'Tasks', value: 'tasks' }
            )
        )
    ),

  async execute(interaction) {
    // Only Team Lead+ can manage cache
    if (!canSeeClientJobData(interaction.member)) {
      return await interaction.reply({
        content: '❌ You need Team Lead permissions or higher to manage cache.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'stats') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const stats = getCacheStats();
        
        const embed = new EmbedBuilder()
          .setTitle('📊 Cache Statistics')
          .setDescription('Performance data for in-memory cache system')
          .setColor(0x3498db)
          .setTimestamp();

        Object.entries(stats).forEach(([key, data]) => {
          const statusIcon = data.isExpired ? '❌' : '✅';
          const loadingIcon = data.isLoading ? '⏳' : '';
          
          embed.addFields({
            name: `${statusIcon} ${key.toUpperCase()} ${loadingIcon}`,
            value: [
              `Records: ${data.hasData ? data.count : 'No data'}`,
              `Age: ${data.ageSeconds ? `${data.ageSeconds}s` : 'Never loaded'}`,
              `TTL: ${data.ttlSeconds}s`,
              `Status: ${data.isExpired ? 'Expired' : 'Fresh'}`
            ].join('\n'),
            inline: true
          });
        });

        embed.setFooter({ 
          text: 'Cache reduces Google Sheets API calls by 60-90%' 
        });

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('❌ Cache stats failed:', error);
        await interaction.editReply({
          content: '❌ Failed to get cache statistics.'
        });
      }
    }

    if (sub === 'clear') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        invalidateAllCache();
        
        const embed = new EmbedBuilder()
          .setTitle('🗑️ Cache Cleared')
          .setDescription('All cached data has been invalidated. Next data requests will fetch fresh data from Google Sheets.')
          .setColor(0xe74c3c)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('❌ Cache clear failed:', error);
        await interaction.editReply({
          content: '❌ Failed to clear cache.'
        });
      }
    }

    if (sub === 'refresh') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const cacheType = interaction.options.getString('type');
        
        console.log(`🔄 Manual cache refresh requested for: ${cacheType}`);
        const data = await refreshCache(cacheType);

        const embed = new EmbedBuilder()
          .setTitle('🔄 Cache Refreshed')
          .setDescription(`Successfully refreshed **${cacheType}** cache from Google Sheets.`)
          .addFields({
            name: '📊 Fresh Data',
            value: `${data.length} ${cacheType} loaded`,
            inline: true
          })
          .setColor(0x2ecc71)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('❌ Cache refresh failed:', error);
        await interaction.editReply({
          content: `❌ Failed to refresh ${interaction.options.getString('type')} cache: ${error.message}`
        });
      }
    }
  }
};
