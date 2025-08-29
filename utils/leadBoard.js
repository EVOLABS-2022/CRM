const { EmbedBuilder } = require('discord.js');

async function refreshLeadsBoard(client, leads = []) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  
  // Find the lead board channel by ID
  const channel = guild.channels.cache.get('1411029260243566655');
  if (!channel) {
    console.warn('❌ Lead board channel not found (ID: 1411029260243566655)');
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🆕 Lead Board')
    .setColor('#f39c12') // Orange color for leads
    .setDescription('New leads from website and Telegram that need to be converted to active clients');

  const leadList = Array.isArray(leads) ? leads : [];

  if (leadList.length === 0) {
    embed.addFields({
      name: 'No leads found',
      value: 'All leads have been converted to active clients! 🎉',
      inline: false
    });
  } else {
    for (const lead of leadList) {
      // Format lead info similar to client board but focused on conversion
      const fieldValue = [
        `Contact: ${lead.contactName || 'N/A'} (${lead.contactMethod || 'N/A'})`,
        `Source: ${lead.source || 'Unknown'}`,
        `Created: ${lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A'}`,
        `Status: **Needs Conversion** 🔄`
      ].join('\n');

      embed.addFields({
        name: `${lead.code || '???'} — ${lead.name || 'Unnamed Lead'}`,
        value: fieldValue,
        inline: false,
      });
    }

    // Add conversion instructions
    embed.addFields({
      name: '💡 How to Convert Leads',
      value: 'Use `/lead convert <lead>` to convert a lead to an active client. This will create their Discord channel and make them appear on the main client board.',
      inline: false
    });
  }

  // Add footer with timestamp and count
  embed.setFooter({ 
    text: `${leadList.length} leads • Updated ${new Date().toLocaleString()}` 
  });

  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    console.log(`✅ [Discord] Leads Board updated with ${leadList.length} leads`);
  } catch (err) {
    console.error('❌ Failed to refresh Leads Board:', err);
  }
}

// Helper function to filter clients into leads (inactive clients)
function getLeadsFromClients(clients = []) {
  return clients.filter(client => {
    const activeStatus = (client.active || '').toLowerCase();
    return activeStatus !== 'yes';
  });
}

// Helper function to filter clients into active clients only
function getActiveClientsFromClients(clients = []) {
  return clients.filter(client => {
    const activeStatus = (client.active || '').toLowerCase();
    return activeStatus === 'yes';
  });
}

module.exports = { 
  refreshLeadsBoard, 
  getLeadsFromClients, 
  getActiveClientsFromClients 
};
