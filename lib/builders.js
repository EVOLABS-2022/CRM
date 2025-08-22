// lib/builders.js
const { EmbedBuilder } = require('discord.js');

// Format a client entry for the global Clients board
function buildClientsBoardEmbed(clients, guild) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Clients')
    .setDescription('All active clients listed below')
    .setColor(0x3498db)
    .setTimestamp();

  if (!clients.length) {
    embed.setDescription('⚠️ No clients yet.');
    return embed;
  }

  clients.forEach(client => {
    // Show name as link (client channel), no raw channel mention in the field
    const channelLink = client.channelId ? `[${client.name}](https://discord.com/channels/${guild.id}/${client.channelId})` : client.name;
    const code = client.code ? ` — \`${client.code}\`` : '';
    const notes = client.notes || 'No description';

    embed.addFields({
      name: `${channelLink}${code}`,
      value: `*${notes}*`,
    });
  });

  return embed;
}

// Large client card at top of client channel (summary only; the authoritative one lives in clientCard.js)
function buildClientCardEmbed(client, jobs = []) {
  const embed = new EmbedBuilder()
    .setTitle(`🏢 ${client.name} (${client.code || client.id})`)
    .setColor(0x1abc9c)
    .addFields(
      { name: 'Contact', value: client.contact || 'N/A', inline: true },
      { name: 'Email', value: client.email || 'N/A', inline: true },
      { name: 'Phone', value: client.phone || 'N/A', inline: true },
    )
    .addFields({
      name: 'Notes',
      value: client.notes || '—',
    })
    .setFooter({ text: `${jobs.length} jobs` })
    .setTimestamp();

  return embed;
}

// Jobs board inside client channel
function buildClientJobsBoardEmbed(client, jobs = []) {
  const embed = new EmbedBuilder()
    .setTitle(`📂 Jobs for ${client.name}`)
    .setColor(0xf1c40f)
    .setTimestamp();

  if (!jobs.length) {
    embed.setDescription('⚠️ No jobs yet for this client.');
    return embed;
  }

  jobs.forEach(job => {
    const threadLink = job.threadId
      ? `[${job.title}](https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${job.threadId})`
      : `**${job.title}**`;
    const due = job.deadline ? new Date(job.deadline) : null;
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dueTxt = due && !isNaN(due) ? `${mon[due.getMonth()]} ${due.getDate()}, ${due.getFullYear()}` : '—';

    const desc = job.description ? `*${job.description}*` : '*—*';

    embed.addFields({
      name: `${threadLink} — *due ${dueTxt}*`,
      value: desc,
    });
  });

  return embed;
}

// Job card inside a thread (this is a lightweight variant; thread builder in jobThreads.js is the source of truth)
function buildJobCardEmbed(job, client) {
  const embed = new EmbedBuilder()
    .setTitle(`🛠️ ${job.title} (${job.code || job.id})`)
    .setColor(0xe67e22)
    .addFields(
      { name: 'Client', value: client ? client.name : 'Unknown', inline: true },
      { name: 'Deadline', value: (job.deadline ? (() => {
        const d = new Date(job.deadline);
        const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
        return `${m} ${d.getDate()}, ${d.getFullYear()}`;
      })() : '—'), inline: true },
      { name: 'Status', value: job.status || 'Open', inline: true },
    )
    .addFields({
      name: 'Description',
      value: job.description || '—',
    });

  if (Array.isArray(job.items) && job.items.length) {
    const items = job.items.map((it, i) => {
      const p = (typeof it.price === 'number') ? `$${it.price.toFixed(2)}` : '—';
      const d = it.desc?.trim() || '—';
      return `${i + 1}. ${d} — ${p}`;
    }).join('\n');
    embed.addFields({ name: 'Items', value: items });
  }

  embed.setTimestamp();
  return embed;
}

module.exports = {
  buildClientsBoardEmbed,
  buildClientCardEmbed,
  buildClientJobsBoardEmbed,
  buildJobCardEmbed,
};