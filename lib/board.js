// lib/board.js
const { EmbedBuilder } = require('discord.js');
const { getClients, getJobs } = require('./sheetsDb');
const { ensureChannelUnder, JOB_BOARD_CH } = require('./bootstrap');
const settings = require('./settings');
const { ensureJobThread } = require('./jobThreads');

function prettyDate(d) {
  if (!d) return null;
  // Handle YYYY-MM-DD strings as UTC dates to avoid timezone shifts
  const dt = (d instanceof Date) ? d : new Date(d + 'T12:00:00.000Z');
  if (isNaN(dt)) return null;
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()];
  return `${mon} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}

function formatJobForClient(guildId, job, client) {
  // Debug: Check if job has threadId
  console.log(`🔗 Job ${job.id}: threadId = ${job.threadId || 'NONE'}`);
  
  // First line: Client Name (link) - Job Name (link) - Status
  const clientLink = client && client.channelId
    ? `[${client.name}](https://discord.com/channels/${guildId}/${client.channelId})`
    : client ? client.name : 'Unknown Client';
  
  const jobLink = job.threadId
    ? `[${job.title}](https://discord.com/channels/${guildId}/${job.threadId})`
    : job.title;
  
  const firstLine = `    ${clientLink} - ${jobLink} - ${job.status || 'open'}`;
  
  // Second line: Job description
  const description = job.description || 'No description';
  const secondLine = `    *${description}*`;
  
  return `${firstLine}\n${secondLine}`;
}

async function buildJobsEmbed(guildId) {
  const jobs = await getJobs();
  const clients = await getClients();
  
  // Filter to only open jobs (not completed, closed, archived, deleted)
  const openJobs = jobs.filter(j => 
    j.status === 'open' || 
    j.status === 'in-progress' || 
    j.status === 'pending' ||
    (!j.status || j.status === '')
  );
  
  // Group jobs by client and sort clients alphabetically
  const jobsByClient = new Map();
  
  openJobs.forEach(job => {
    const client = clients.find(c => c.id === job.clientId);
    if (!client) {
      console.warn(`⚠️ Job ${job.id} has clientId ${job.clientId} but no matching client found`);
      return; // Skip jobs with no matching client
    }
    
    const clientName = client.name;
    
    if (!jobsByClient.has(clientName)) {
      jobsByClient.set(clientName, []);
    }
    jobsByClient.get(clientName).push(job);
  });
  
  // Sort client names alphabetically
  const sortedClientNames = Array.from(jobsByClient.keys()).sort();
  
  // Build the description
  const sections = [];
  
  // Add title and horizontal divider
  sections.push('**Job Board**');
  sections.push('─────────────────────────');
  
  sortedClientNames.forEach(clientName => {
    const clientJobs = jobsByClient.get(clientName);
    const client = clients.find(c => c.name === clientName);
    
    // Client name as link (if has channel) or bold text
    const clientLink = client && client.channelId
      ? `[**${clientName}**](https://discord.com/channels/${guildId}/${client.channelId})`
      : `**${clientName}**`;
    sections.push(clientLink);
    
    // Add each job (indented)
    clientJobs.forEach(job => {
      sections.push(formatJobForClient(guildId, job, client));
    });
    
    // Add extra line break after client group
    sections.push('');
  });
  
  // Remove the last empty line
  if (sections.length > 0 && sections[sections.length - 1] === '') {
    sections.pop();
  }
  
  const description = sections.length > 0 ? sections.join('\n\n') : '_No open jobs_';
  
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(description);
    
  // Add count field in top right (using invisible field names to position right)
  if (openJobs.length > 0) {
    embed.addFields(
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '\u200b', value: `**${openJobs.length} Open Jobs**`, inline: true }
    );
  }
  
  return embed;
}

async function ensureJobBoardMessage(client, guildId) {
  const channel = await ensureChannelUnder(client, guildId, JOB_BOARD_CH);
  if (!channel) return null;

  // ensure each job has thread before we link it (best-effort)
  const clients = await getClients();
  const jobs = await getJobs();
  console.log('🔗 Ensuring job threads exist...');
  let threadsCreated = false;
  for (const j of jobs) {
    if (j.status === 'completed' || j.status === 'closed') continue;
    if (!j.threadId) {
      const c = clients.find(x => x.id === j.clientId);
      if (c?.channelId) {
        try {
          console.log(`🔗 Creating thread for job ${j.id} in client ${c.name}'s channel`);
          const ch = await client.channels.fetch(c.channelId).catch(() => null);
          if (ch) {
            await ensureJobThread(client, c, ch, j);
            console.log(`✅ Thread created for job ${j.id}, threadId: ${j.threadId}`);
            threadsCreated = true;
          }
        } catch (error) {
          console.error(`❌ Failed to create thread for job ${j.id}:`, error.message);
        }
      } else {
        console.warn(`⚠️ Job ${j.id} client ${j.clientId} has no channel`);
      }
    }
  }
  
  // If threads were created, wait a moment for Google Sheets to sync
  if (threadsCreated) {
    console.log('⏳ Waiting for Google Sheets to sync thread IDs...');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const msgId = settings.getJobBoardMessageId(guildId);
  if (msgId) {
    try {
      const msg = await channel.messages.fetch(msgId);
      return msg;
    } catch { /* fallthrough */ }
  }
  // Build embed AFTER ensuring threads exist to get updated threadIds
  const sent = await channel.send({ embeds: [await buildJobsEmbed(guildId)] });
  settings.setJobBoardMessageId(guildId, sent.id);
  
  // Pin the new message
  try {
    await sent.pin();
  } catch (error) {
    console.warn('Failed to pin job board message:', error.message);
  }
  
  return sent;
}

async function refreshBoard(client, guildId) {
  const msg = await ensureJobBoardMessage(client, guildId);
  if (!msg) return;
  
  // Get fresh data after thread creation to ensure threadIds are current
  console.log('🔄 Getting fresh job data after thread creation...');
  await msg.edit({ embeds: [await buildJobsEmbed(guildId)] });
  console.log(`🔄 Board refreshed for guild ${guildId}`);
}

async function refreshAllBoards(client) {
  for (const [guildId] of client.guilds.cache) {
    await refreshBoard(client, guildId).catch(e =>
      console.warn(`⚠️ Failed to refresh board for ${guildId}`, e?.message || e)
    );
  }
}

module.exports = {
  refreshBoard,
  refreshAllBoards,
  ensureJobBoardMessage,
};