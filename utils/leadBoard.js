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
    .setTitle('🆕 Inquiry Board')
    .setColor('#f39c12') // Orange color for inquiries
    .setDescription('New inquiries from website and Telegram that need to be converted to active clients\n\n═══════════════════════════════════'); // Line break and horizontal divider

  const leadList = Array.isArray(leads) ? leads : [];

  if (leadList.length === 0) {
    embed.addFields({
      name: 'No inquiries found',
      value: 'All inquiries have been converted to active clients! 🎉',
      inline: false
    });
  } else {
    for (const lead of leadList) {
      // Format lead info with all available data
      const infoLines = [];
      
      // Contact information
      if (lead.contactName || lead.contactMethod) {
        const contactParts = [lead.contactName, lead.contactMethod].filter(Boolean);
        infoLines.push(`**Contact:** ${contactParts.join(' | ') || 'N/A'}`);
      }
      
      // Lead details
      if (lead.description && lead.description.trim()) {
        infoLines.push(`**Description:** ${lead.description.trim()}`);
      }
      
      // Notes if available
      if (lead.notes && lead.notes.trim()) {
        infoLines.push(`**Notes:** ${lead.notes.trim()}`);
      }
      
      // System information
      const systemInfo = [];
      if (lead.id) systemInfo.push(`ID: ${lead.id}`);
      if (lead.authCode) systemInfo.push(`Auth: ${lead.authCode}`);
      if (lead.createdAt) {
        const date = new Date(lead.createdAt);
        systemInfo.push(`Created: ${date.toLocaleDateString()}`);
      }
      
      if (systemInfo.length > 0) {
        infoLines.push(`**System:** ${systemInfo.join(' | ')}`);
      }
      
      // Conversion status
      infoLines.push(`**Status:** 🔄 **Ready for Conversion**`);
      
      const fieldValue = infoLines.length > 0 ? infoLines.join('\n') : 'No additional information available';

      embed.addFields({
        name: `${lead.code || 'NO-CODE'} — ${lead.name || 'Unnamed Lead'}`,
        value: fieldValue.length > 1024 ? fieldValue.substring(0, 1021) + '...' : fieldValue,
        inline: false,
      });
    }

    // Add horizontal divider after leads
    embed.addFields({
      name: '═══════════════════════════════════',
      value: '\u200b', // Zero-width space for empty field
      inline: false
    });

    // Add conversion instructions
    embed.addFields({
      name: '💡 How to Convert Inquiries',
      value: 'Use `/client convert <inquiry>` to convert an inquiry to an active client. This will create their Discord channel and make them appear on the main client board.',
      inline: false
    });
  }

  // Add footer with timestamp and count
  embed.setFooter({ 
    text: `${leadList.length} inquiries • Updated ${new Date().toLocaleString()}` 
  });

  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    console.log(`✅ [Discord] Inquiry Board updated with ${leadList.length} inquiries`);
  } catch (err) {
    console.error('❌ Failed to refresh Inquiry Board:', err);
  }
}

// Helper function to filter clients into leads (inactive clients)
function getLeadsFromClients(clients = []) {
  const leads = clients.filter(client => {
    const activeStatus = (client.active || '').toLowerCase();
    const hasName = client.name && client.name.trim() !== '';
    
    // Debug logging
    if (hasName && activeStatus !== 'yes') {
      console.log(`🔍 Found lead: ${client.name} (Active: "${client.active || 'empty'}")`);
    }
    
    // A lead is any client with a name that doesn't have "yes" in active column
    return hasName && activeStatus !== 'yes';
  });
  
  console.log(`📋 Total leads found: ${leads.length}`);
  return leads;
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
