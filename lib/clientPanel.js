// lib/clientPanel.js
const { EmbedBuilder } = require('discord.js');
const { db } = require('./store');
const { ensureChannelUnder, CLIENT_BOARD_CH } = require('./bootstrap');
const settings = require('./settings');

function linkToChannel(guildId, channelId, text) {
  return channelId ? `[${text}](https://discord.com/channels/${guildId}/${channelId})` : `**${text}**`;
}

function buildClientsEmbed(guildId) {
  const clients = Array.isArray(db.clients) ? db.clients : [];
  const lines = clients
    .filter(c => !c.archived)
    .map(c => {
      const title = `${linkToChannel(guildId, c.channelId, c.name)} \`${c.code || c.id}\``;
      const desc  = c.description ? `*${c.description}*` : '*—*';
      return `${title}\n${desc}`;
    });

  return new EmbedBuilder()
    .setTitle('Clients')
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
  const sent = await channel.send({ embeds: [buildClientsEmbed(guildId)] });
  settings.setClientPanelMessageId(guildId, sent.id);
  return sent;
}

async function refreshClientPanel(client, guildId, message) {
  const embed = buildClientsEmbed(guildId);
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