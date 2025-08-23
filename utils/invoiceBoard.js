const { EmbedBuilder } = require('discord.js');
const settings = require('../lib/settings');

function prettyDate(dateStr) {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD strings as UTC dates to avoid timezone shifts
  const d = new Date(dateStr + 'T12:00:00.000Z');
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

async function refreshInvoicesBoard(client, invoices = [], clients = [], jobs = []) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(ch => ch.name === '🧾-invoice-board');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('Invoices Board')
    .setColor('#ffcc00')
    .setDescription('List of all invoices with status and due dates');

  const invList = Array.isArray(invoices) ? invoices : [];

  for (const inv of invList) {
    const client = clients.find(c => c.code === inv.clientCode);
    const job = jobs.find(j => j.jobCode === inv.jobCode);

    const due = prettyDate(inv.dueDate);
    const status = inv.status || 'Unknown';

    embed.addFields({
      name: `#${inv.invoiceNumber || '????'} — ${inv.title || 'Untitled'}`,
      value: `Client: ${client ? `${client.code} — ${client.name}` : 'Unknown'}\nJob: ${job ? job.title : 'Unknown'}\nStatus: ${status}${due ? ` (due ${due})` : ''}`,
      inline: false,
    });
  }

  try {
    const guildId = guild.id;
    const storedMessageId = settings.getInvoiceBoardMessageId(guildId);
    
    if (storedMessageId) {
      try {
        const message = await channel.messages.fetch(storedMessageId);
        await message.edit({ embeds: [embed] });
        console.log(`✅ [Discord] Invoices Board updated with ${invList.length} invoices`);
        return;
      } catch {
        // Message not found, clear stored ID and fall through to send new message
        settings.setInvoiceBoardMessageId(guildId, null);
      }
    }
    
    const sent = await channel.send({ embeds: [embed] });
    
    // Store the new message ID and pin it
    settings.setInvoiceBoardMessageId(guildId, sent.id);
    try {
      await sent.pin();
    } catch (error) {
      console.warn('Failed to pin invoice board message:', error.message);
    }
    
    console.log(`✅ [Discord] Invoices Board updated with ${invList.length} invoices`);
  } catch (err) {
    console.error('❌ Failed to refresh Invoices Board:', err);
  }
}

module.exports = { refreshInvoicesBoard };