const { EmbedBuilder } = require('discord.js');

async function refreshClientsBoard(client, clients = []) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.find(ch => ch.name === '👥-client-board');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('Client Board')
    .setColor('#0099ff')
    .setDescription('List of all clients with channels, contacts, and open invoices');

  const clientList = Array.isArray(clients) ? clients : [];

  for (const c of clientList) {
    const invoiceCount = Array.isArray(c.invoices)
      ? c.invoices.filter(i => i.status !== 'Paid' && i.status !== 'Archived').length
      : 0;

    embed.addFields({
      name: `${c.code || '???'} — ${c.name || 'Unnamed Client'}`,
      value: `Channel: <#${c.channelId || 'unknown'}>\nContact: ${c.contactName || 'N/A'} (${c.contactMethod || 'N/A'})\nJobs: ${(c.jobs || []).length}\nOpen Invoices: ${invoiceCount}`,
      inline: false,
    });
  }

  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    console.log(`✅ [Discord] Clients Board updated with ${clientList.length} clients`);
  } catch (err) {
    console.error('❌ Failed to refresh Clients Board:', err);
  }
}

module.exports = { refreshClientsBoard };