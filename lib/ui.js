// lib/ui.js
const { EmbedBuilder } = require('discord.js');

const CLR = {
  ok: 0x22c55e, info: 0x60a5fa, warn: 0xf59e0b, err: 0xef4444, mute: 0x94a3b8,
};
const STATUS_COLOR = {
  lead: 0x7c3aed, in_progress: 0xf59e0b, review: 0xf97316, completed: 0x22c55e,
};

function clientEmbed(client, { title = 'Client', color = CLR.info } = {}) {
  return new EmbedBuilder()
    .setColor(color).setTitle(`${title} — ${client.name}`)
    .addFields(
      { name: 'ID', value: `\`${client.id}\``, inline: true },
      { name: 'Code', value: client.code || '—', inline: true },
      { name: 'Contact', value: client.contact || '—', inline: true },
      { name: 'Notes', value: client.notes || '—' },
    )
    .setTimestamp();
}

function jobEmbed(job, { clientName = '—', assigneeMention = '—' } = {}) {
  const tags = job.tags?.length ? job.tags.join(', ') : '—';
  const status = job.status || 'in_progress';
  return new EmbedBuilder()
    .setColor(STATUS_COLOR[status] ?? CLR.info)
    .setTitle(`Job ${job.code || job.id} — ${job.title}`)
    .addFields(
      { name: 'ID', value: `\`${job.id}\``, inline: true },
      { name: 'Code', value: job.code || '—', inline: true },
      { name: 'Status', value: status.replace('_', ' '), inline: true },
      { name: 'Client', value: clientName || job.clientId || '—', inline: true },
      { name: 'Assignee', value: assigneeMention || '—', inline: true },
      { name: 'Deadline', value: job.deadline || '—', inline: true },
      { name: 'Tags', value: tags, inline: true },
    )
    .setTimestamp();
}

module.exports = { clientEmbed, jobEmbed, CLR };