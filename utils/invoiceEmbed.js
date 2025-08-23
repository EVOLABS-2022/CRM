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
  // Build line items display
  let lineItemsText = '';
  let totalAmount = 0;
  
  if (invoice.lineItems && invoice.lineItems.length > 0) {
    invoice.lineItems.forEach((item, index) => {
      lineItemsText += `${index + 1}. ${item.description} — $${item.price.toFixed(2)}\n`;
      totalAmount += item.price;
    });
  } else {
    lineItemsText = '_No line items specified_';
  }

  // Safely handle notes with line breaks
  const notes = invoice.notes && invoice.notes.trim().length > 0
    ? invoice.notes
    : '—';

  const embed = new EmbedBuilder()
    .setTitle(`Invoice #${invoice.id}`)
    .setColor(invoice.status === 'paid' ? 0x2ecc71 : 0xe67e22)
    .addFields(
      { name: 'Client', value: client ? `${client.code} — ${client.name}` : 'Unknown', inline: true },
      { name: 'Job', value: job ? `${job.id} — ${job.title}` : 'Unknown', inline: true },
      { name: 'Status', value: invoice.status || 'draft', inline: true },
      { name: 'Due Date', value: formatDate(invoice.dueAt), inline: true },
      { name: 'Total Amount', value: `$${totalAmount.toFixed(2)}`, inline: true },
      { name: 'Issued', value: formatDate(invoice.issuedAt), inline: true }
    );

  // Add line items as a field if they exist
  if (lineItemsText) {
    embed.addFields({
      name: '📋 Line Items',
      value: lineItemsText,
      inline: false
    });
  }

  // Add notes and terms if they exist
  if (notes !== '—') {
    embed.addFields({
      name: 'Notes',
      value: notes,
      inline: false
    });
  }

  if (invoice.terms && invoice.terms.trim()) {
    embed.addFields({
      name: 'Terms',
      value: invoice.terms,
      inline: false
    });
  }

  return embed;
}

module.exports = { generateInvoiceEmbed };