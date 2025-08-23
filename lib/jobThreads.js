// lib/jobThreads.js
const { EmbedBuilder, ThreadAutoArchiveDuration } = require('discord.js');
const { getClients, getJobs, updateJobThread } = require('./sheetsDb');

function val(x, fallback = '—') {
  if (x === null || x === undefined) return fallback;
  const s = String(x).trim();
  return s.length ? s : fallback;
}
function prettyDate(d) {
  if (!d) return '—';
  // Handle YYYY-MM-DD strings as UTC dates to avoid timezone shifts
  const dt = (d instanceof Date) ? d : new Date(d + 'T12:00:00.000Z');
  if (isNaN(dt)) return '—';
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()];
  return `${mon} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}
function itemsBlock(job) {
  const items = Array.isArray(job.items) ? job.items : [];
  if (!items.length) return null;
  const lines = items.map((it, i) => {
    const p = (typeof it.price === 'number') ? `$${it.price.toFixed(2)}` : '—';
    const d = it.desc?.trim() || '—';
    return `${i + 1}. ${d} — ${p}`;
  }).join('\n');
  return lines;
}

function buildJobEmbed(job, clientRec) {
  const tags = Array.isArray(job.tags) && job.tags.length ? job.tags.join(', ') : '—';
  const budget = job.budget != null ? `$${job.budget}` : '—';
  const deadline = job.deadline ? prettyDate(job.deadline) : '—';
  const assignee = job.assigneeId ? `<@${job.assigneeId}>` : '—';

  const embed = new EmbedBuilder()
    .setTitle(`${job.code || ''}${job.code ? ' — ' : ''}${val(job.title)}`)
    .setColor(0x5865F2)
    .setDescription(val(job.description, '—'))
    .addFields(
      { name: 'Client', value: clientRec ? `${clientRec.name}${clientRec.code ? ` \`${clientRec.code}\`` : ''}` : '—', inline: true },
      { name: 'Status', value: val(job.status), inline: true },
      { name: 'Priority', value: val(job.priority), inline: true },
      { name: 'Deadline', value: deadline, inline: true },
      { name: 'Budget', value: budget, inline: true },
      { name: 'Assignee', value: assignee, inline: true },
      { name: 'Tags', value: tags, inline: false }
    )
    .setFooter({ text: `Job ID: ${job.id}` });

  const items = itemsBlock(job);
  if (items) embed.addFields({ name: 'Items', value: items });

  return embed;
}

/**
 * Ensure a per-job thread exists in the client's channel and has a card embed.
 * Saves job.threadId and job.threadCardMessageId.
 */
async function ensureJobThread(discordClient, clientRec, channel, job) {
  if (!clientRec || !channel || !job) return null;

  // Fetch or create thread
  let thread = null;
  if (job.threadId) {
    try {
      thread = await channel.threads.fetch(job.threadId);
    } catch {
      thread = null;
    }
  }
  if (!thread) {
    const threadName = `${job.code || ''}${job.code ? ' — ' : ''}${job.title}`.slice(0, 100);
    thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Job thread for ${job.code || job.title}`,
    });
    job.threadId = thread.id;
    // Save threadId immediately when thread is created
    await updateJobThread(job.id, thread.id, null);
  }

  // Post or edit job card in thread
  const embed = buildJobEmbed(job, clientRec);
  if (job.threadCardMessageId) {
    try {
      const msg = await thread.messages.fetch(job.threadCardMessageId);
      await msg.edit({ embeds: [embed] });
      return thread;
    } catch {
      // fall through to send new
    }
  }

  const sent = await thread.send({ embeds: [embed] });
  job.threadCardMessageId = sent.id;
  
  // Update job with thread message info in Sheets
  await updateJobThread(job.id, job.threadId, job.threadCardMessageId);

  return thread;
}

/**
 * Backfill/refresh threads and cards for all jobs that have a linked client channel.
 */
async function refreshAllJobThreads(discordClient) {
  const jobs = await getJobs();
  const clients = await getClients();

  for (const job of jobs) {
    const clientRec = clients.find(c => c.id === job.clientId);
    if (!clientRec || !clientRec.channelId) continue;

    const channel = await discordClient.channels.fetch(clientRec.channelId).catch(() => null);
    if (!channel) continue;

    await ensureJobThread(discordClient, clientRec, channel, job);
  }
}

module.exports = {
  ensureJobThread,
  refreshAllJobThreads,
  buildJobEmbed, // exported in case other modules need it
};