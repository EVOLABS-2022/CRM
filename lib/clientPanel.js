// lib/clientPanel.js
const { EmbedBuilder } = require('discord.js');
const { getClients, getJobs } = require('./sheetsDb');
const { ensureChannelUnder, CLIENT_BOARD_CH } = require('./bootstrap');
const settings = require('./settings');

function linkToChannel(guildId, channelId, text) {
  return channelId ? `[${text}](https://discord.com/channels/${guildId}/${channelId})` : `**${text}**`;
}

async function buildClientsEmbed(guildId) {
  const clients = await getClients();
  const jobs = await getJobs();
  
  // Sort clients alphabetically by name
  const sortedClients = clients
    .filter(c => !c.archived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  
  const lines = sortedClients.map(c => {
    // Count open jobs for this client
    const openJobs = jobs.filter(j => 
      j.clientId === c.id && 
      j.status !== 'completed' && 
      j.status !== 'closed'
    ).length;
    
    // First row: Client name (linked to channel) - Number of open jobs
    const clientLink = linkToChannel(guildId, c.channelId, c.name);
    const firstRow = `${clientLink} — ${openJobs} open job${openJobs === 1 ? '' : 's'}`;
    
    // Second row: Description - Contact Name
    const description = c.description || 'No description';
    const contactName = c.contactName || 'No contact';
    const secondRow = `*${description} - ${contactName}*`;
    
    return `${firstRow}\n${secondRow}`;
  });

  return new EmbedBuilder()
    .setTitle('Client Board')
    .setColor(0x5865f2)
    .setDescription(lines.length ? lines.join('\n\n') : '_No clients yet_');
}

async function ensureClientPanelMessage(client, guildId) {
  const channel = await ensureChannelUnder(client, guildId, CLIENT_BOARD_CH);
  if (!channel) return null;

  const msgId = settings.getClientPanelMessageId(guildId);
  if (msgId) {
    try {
      const msg = await channel.messages.fetch(msgId);
      return msg;
    } catch { /* fallthrough to send new */ }
  }
  const sent = await channel.send({ embeds: [await buildClientsEmbed(guildId)] });
  settings.setClientPanelMessageId(guildId, sent.id);
  
  // Pin the new message
  try {
    await sent.pin();
  } catch (error) {
    console.warn('Failed to pin client panel message:', error.message);
  }
  
  return sent;
}

async function refreshClientPanel(client, guildId, message) {
  const embed = await buildClientsEmbed(guildId);
  await message.edit({ embeds: [embed] });
}

async function refreshAllClientPanels(client) {
  for (const [guildId] of client.guilds.cache) {
    try {
      const msg = await ensureClientPanelMessage(client, guildId);
      if (msg) await refreshClientPanel(client, guildId, msg);
      console.log(`🔄 Client panel refreshed for guild ${guildId}`);
    } catch (e) {
      console.warn(`⚠️ Failed to refresh client panel for ${guildId}`, e?.message || e);
    }
  }
}

module.exports = {
  ensureClientPanelMessage,
  refreshClientPanel,
  refreshAllClientPanels,
};