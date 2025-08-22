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

async function refreshJobsBoard(client, jobs = [], clients = []) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(ch => ch.name === '🛠️-job-board');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('Job Board')
    .setColor('#00cc66')
    .setDescription('Jobs grouped by client');

  const jobList = Array.isArray(jobs) ? jobs : [];
  const clientList = Array.isArray(clients) ? clients : [];

  for (const clientObj of clientList) {
    const clientJobs = jobList.filter(j => j.clientCode === clientObj.code);
    if (clientJobs.length === 0) continue;

    const jobLines = clientJobs
      .map(j => {
        const due = prettyDate(j.dueAt);
        return `- **${j.jobCode || '???'}** ${j.title || 'Untitled'} (${j.status || 'Unknown'}${due ? `, due ${due}` : ''})`;
      })
      .join('\n');

    embed.addFields({
      name: `👤 ${clientObj.code} — ${clientObj.name}`,
      value: jobLines,
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
    console.log(`✅ [Discord] Jobs Board updated with ${jobList.length} jobs`);
  } catch (err) {
    console.error('❌ Failed to refresh Jobs Board:', err);
  }
}

module.exports = { refreshJobsBoard };