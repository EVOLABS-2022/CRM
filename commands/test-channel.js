const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-channel')
    .setDescription('Test channel creation permissions'),

  async execute(interaction) {
    try {
      console.log('🧪 Testing channel creation permissions...');
      
      const guild = interaction.guild;
      console.log('Guild:', guild.name);
      
      // Check if bot can manage channels
      const canManageChannels = guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels);
      console.log('Can manage channels:', canManageChannels);
      
      // Try to find CRM category
      const crmCategory = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name === '🗂️ | CRM' || c.name === '🗂️|CRM')
      );
      
      console.log('CRM category found:', !!crmCategory);
      console.log('CRM category name:', crmCategory?.name);
      
      await interaction.reply({
        content: `✅ Permissions check complete!\n**Can manage channels:** ${canManageChannels}\n**CRM category found:** ${!!crmCategory}`,
        flags: 64
      });
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      await interaction.reply({
        content: `❌ Test failed: ${error.message}`,
        flags: 64
      });
    }
  }
};