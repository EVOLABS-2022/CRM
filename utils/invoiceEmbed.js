// utils/invoiceEmbed.js
const { EmbedBuilder } = require('discord.js');

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function generateInvoiceEmbed(invoice, client, job) {
  // Safely handle notes with line breaks
  const notes = invoice.notes && invoice.notes.trim().length > 0
    ? invoice.notes
    : '—';

  return new EmbedBuilder()
    .setTitle(`Invoice #${invoice.number}`)
    .setColor(invoice.status === 'Paid' ? 0x2ecc71 : 0xe67e22)
    .setDescription(notes)
    .addFields(
      { name: 'Client', value: client ? `${client.code} — ${client.name}` : 'Unknown', inline: true },
      { name: 'Job', value: job ? `${job.code} — ${job.title}` : 'Unknown', inline: true },
      { name: 'Issued', value: formatDate(invoice.issuedAt), inline: true },
      { name: 'Due', value: formatDate(invoice.dueAt), inline: true },
      { name: 'Terms', value: invoice.terms && invoice.terms.trim().length > 0 ? invoice.terms : '—', inline: true },
      { name: 'Status', value: invoice.status || '—', inline: true }, // Status always last
    );
}

module.exports = { generateInvoiceEmbed };