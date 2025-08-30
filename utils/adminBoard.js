const { EmbedBuilder } = require('discord.js');
const { getTasks, getJobs, getClients, getInvoices } = require('../lib/sheetsDb');
const { getLeadsFromClients, getActiveClientsFromClients } = require('./leadBoard');
const settings = require('../lib/settings');

function prettyDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00.000Z');
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function isOverdue(deadline) {
  if (!deadline) return false;
  const today = new Date().toISOString().split('T')[0];
  return deadline < today;
}

function daysTilDeadline(deadline) {
  if (!deadline) return null;
  const today = new Date().toISOString().split('T')[0];
  const deadlineDate = new Date(deadline + 'T12:00:00.000Z');
  const todayDate = new Date(today + 'T12:00:00.000Z');
  const diffTime = deadlineDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

async function buildAdminBoard(guildId) {
  const tasks = await getTasks();
  const jobs = await getJobs();
  const clients = await getClients();
  const invoices = await getInvoices();

  // Separate clients into active clients and leads
  const activeClients = getActiveClientsFromClients(clients);
  const leads = getLeadsFromClients(clients);

  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const openJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'closed');
  const pendingInvoices = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled');

  // Categorize tasks by urgency
  const overdueTasks = activeTasks.filter(t => t.deadline && isOverdue(t.deadline));
  const dueTodayTasks = activeTasks.filter(t => t.deadline && daysTilDeadline(t.deadline) === 0);
  const dueSoonTasks = activeTasks.filter(t => t.deadline && daysTilDeadline(t.deadline) > 0 && daysTilDeadline(t.deadline) <= 3);
  const dueThisWeekTasks = activeTasks.filter(t => t.deadline && daysTilDeadline(t.deadline) > 3 && daysTilDeadline(t.deadline) <= 7);

  const sections = [];
  
  // Title and divider
  sections.push('🔐 **Admin Dashboard**');
  sections.push('═══════════════════════════════════');
  sections.push('');

  // Quick stats
  sections.push('📊 **Quick Stats**');
  sections.push(`• **${activeClients.length}** active clients`);
  sections.push(`• **${leads.length}** new inquiries`);
  sections.push(`• **${openJobs.length}** open jobs`);
  sections.push(`• **${activeTasks.length}** active tasks`);
  sections.push(`• **${pendingInvoices.length}** pending invoices`);
  sections.push('');

  // Task urgency breakdown
  sections.push('⚡ **Task Priority Overview**');
  if (overdueTasks.length > 0) {
    sections.push(`🚨 **${overdueTasks.length}** overdue tasks`);
  }
  if (dueTodayTasks.length > 0) {
    sections.push(`📅 **${dueTodayTasks.length}** due today`);
  }
  if (dueSoonTasks.length > 0) {
    sections.push(`⏰ **${dueSoonTasks.length}** due within 3 days`);
  }
  if (dueThisWeekTasks.length > 0) {
    sections.push(`📌 **${dueThisWeekTasks.length}** due this week`);
  }
  sections.push('');

  // Upcoming critical tasks (next 7 days)
  const upcomingTasks = [...overdueTasks, ...dueTodayTasks, ...dueSoonTasks, ...dueThisWeekTasks]
    .sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.localeCompare(b.deadline);
    })
    .slice(0, 8); // Limit to 8 most critical

  if (upcomingTasks.length > 0) {
    sections.push('🎯 **Critical Tasks (Next 7 Days)**');
    upcomingTasks.forEach(task => {
      const job = jobs.find(j => j.id === task.jobId);
      const client = clients.find(c => c.id === job?.clientId);
      
      const urgencyIcon = task.deadline && isOverdue(task.deadline) ? '🚨' : 
                         task.deadline && daysTilDeadline(task.deadline) === 0 ? '📅' : 
                         task.deadline && daysTilDeadline(task.deadline) <= 3 ? '⏰' : '📌';
      
      const dateStr = task.deadline ? prettyDate(task.deadline) : 'No deadline';
      const clientName = client ? client.name : 'Unknown';
      
      sections.push(`${urgencyIcon} **${task.title}** (${clientName}) - ${dateStr}`);
    });
    sections.push('');
  }

  // Client workload overview
  const clientWorkloads = clients.map(client => {
    const clientJobs = openJobs.filter(j => j.clientId === client.id);
    const clientTasks = activeTasks.filter(t => {
      const job = jobs.find(j => j.id === t.jobId);
      return job && job.clientId === client.id;
    });
    return {
      client,
      jobs: clientJobs.length,
      tasks: clientTasks.length,
      total: clientJobs.length + clientTasks.length
    };
  }).filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (clientWorkloads.length > 0) {
    sections.push('👥 **Busiest Clients**');
    clientWorkloads.forEach(({ client, jobs, tasks }) => {
      const clientLink = client.channelId 
        ? `[${client.name}](https://discord.com/channels/${guildId}/${client.channelId})`
        : client.name;
      sections.push(`• ${clientLink}: ${jobs} jobs, ${tasks} tasks`);
    });
    sections.push('');
  }

  sections.push('───────────────────────────────────');
  sections.push('💡 *Use /sync to refresh all boards*');

  const color = overdueTasks.length > 0 ? 0xff0000 : // Red for overdue
                dueTodayTasks.length > 0 ? 0xff9900 : // Orange for due today  
                dueSoonTasks.length > 0 ? 0xffdd00 : // Yellow for due soon
                0x00ff00; // Green for all good

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(sections.join('\n'))
    .setFooter({ 
      text: `Last updated: ${new Date().toLocaleString()}`,
      iconURL: 'https://cdn.discordapp.com/emojis/🔐.png'
    });
}

async function refreshAdminBoard(client, guildId, channelId, messageId = null) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;
    
    const embed = await buildAdminBoard(guildId);
    
    // Get stored message ID if not provided
    const storedMessageId = messageId || settings.getAdminBoardMessageId?.(guildId);
    
    if (storedMessageId) {
      try {
        const message = await channel.messages.fetch(storedMessageId);
        await message.edit({ embeds: [embed] });
        return message;
      } catch {
        // Message not found, clear stored ID and fall through to send new message
        if (settings.setAdminBoardMessageId) {
          settings.setAdminBoardMessageId(guildId, null);
        }
      }
    }
    
    const sent = await channel.send({ embeds: [embed] });
    
    // Store the new message ID and pin it
    if (settings.setAdminBoardMessageId) {
      settings.setAdminBoardMessageId(guildId, sent.id);
    }
    try {
      await sent.pin();
    } catch (error) {
      console.warn('Failed to pin admin board message:', error.message);
    }
    
    return sent;
  } catch (error) {
    console.error('Failed to refresh admin board:', error);
    return null;
  }
}

async function refreshAllAdminBoards(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      console.log(`🔍 Looking for admin board channel in guild ${guildId}...`);
      const adminBoardChannel = guild.channels.cache.find(c => 
        c.name.includes('admin-board') && c.isTextBased()
      );
      
      if (adminBoardChannel) {
        console.log(`🔐 Found admin board channel: ${adminBoardChannel.name}`);
        await refreshAdminBoard(client, guildId, adminBoardChannel.id);
        console.log(`🔄 Admin board refreshed for guild ${guildId}`);
      } else {
        console.log(`⚠️ No admin board channel found in guild ${guildId}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to refresh admin board for ${guildId}`, error?.message || error);
    }
  }
}

module.exports = {
  buildAdminBoard,
  refreshAdminBoard,
  refreshAllAdminBoards
};
