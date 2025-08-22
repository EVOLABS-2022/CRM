const { EmbedBuilder } = require('discord.js');

function prettyDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
    const messages = await channel.messages.fetch({ limit: 10 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    console.log(`✅ [Discord] Invoices Board updated with ${invList.length} invoices`);
  } catch (err) {
    console.error('❌ Failed to refresh Invoices Board:', err);
  }
}

module.exports = { refreshInvoicesBoard };