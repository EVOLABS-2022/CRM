// lib/jobPanel.js
const { EmbedBuilder, ChannelType } = require('discord.js');
const { getClients, getJobs, updateJobThread } = require('./sheetsDb');

function buildJobEmbed(job, client) {
  const embed = new EmbedBuilder()
    .setTitle(`📝 ${job.title}`)
    .setColor(0x2b6cb0)
    .setDescription(job.description || '_No description provided_')
    .addFields(
      { name: 'Job ID', value: job.id, inline: true },
      { name: 'Client', value: client ? client.name : 'Unknown', inline: true },
      { name: 'Deadline', value: job.deadline || '—', inline: true },
      { name: 'Created', value: new Date(job.createdAt).toLocaleString(), inline: true },
      { name: 'Status', value: job.archived ? '📦 Archived' : '✅ Active', inline: true },
    )
    .setFooter({ text: 'EVO CRM — Job Details' });

  return embed;
}

async function ensureJobThread(client, guild, job) {
  try {
    const clients = await getClients();
    const clientData = clients.find(c => c.id === job.clientId);
    if (!clientData || !clientData.channelId) return;

    const guildObj = await client.guilds.fetch(guild);
    const chan = await guildObj.channels.fetch(clientData.channelId);
    if (!chan || chan.type !== ChannelType.GuildText) return;

    // Find existing thread by job.id
    let thread = chan.threads.cache.find(t => t.name.startsWith(job.id));
    if (!thread) {
      thread = await chan.threads.create({
        name: `${job.id} — ${job.title}`,
        autoArchiveDuration: 10080, // 7 days
        reason: `Thread for job ${job.id}`,
      });
      job.threadId = thread.id;
      await updateJobThread(job.id, thread.id, null);
    }

    // Send or update main job embed in thread
    const messages = await thread.messages.fetch({ limit: 10 });
    let cardMsg = messages.find(m => m.author.id === client.user.id);

    const embed = buildJobEmbed(job, clientData);

    if (cardMsg) {
      await cardMsg.edit({ embeds: [embed] });
    } else {
      await thread.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`❌ Failed to ensure job thread for ${job.id}:`, err);
  }
}

async function refreshAllJobThreads(client) {
  const jobs = await getJobs();
  for (const job of jobs) {
    if (job.status === 'completed') continue;
    await ensureJobThread(client, client.guilds.cache.first().id, job);
  }
  console.log('🔄 All job threads refreshed');
}

module.exports = {
  ensureJobThread,
  refreshAllJobThreads,
};