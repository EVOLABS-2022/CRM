const { EmbedBuilder } = require('discord.js');
const { getTasks, getJobs, getClients } = require('../lib/sheetsDb');
const settings = require('../lib/settings');

function prettyDate(dateStr) {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD strings as UTC dates to avoid timezone shifts
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

function getStatusIcon(task) {
  if (task.status === 'completed') return '✅';
  if (task.status === 'in-progress') return '🔄';
  if (task.deadline && isOverdue(task.deadline)) return '🚨';
  return '📋';
}

function getPriorityIcon(priority) {
  switch (priority?.toLowerCase()) {
    case 'urgent': return '🚨';
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

async function buildTaskBoard(guildId) {
  const tasks = await getTasks();
  const jobs = await getJobs();
  const clients = await getClients();
  
  // Filter out completed tasks
  const activeTasks = tasks.filter(t => t.status !== 'completed');
  
  if (activeTasks.length === 0) {
    return new EmbedBuilder()
      .setTitle('📋 Task Board')
      .setColor(0x5865f2)
      .setDescription('_No active tasks_')
      .setFooter({ text: 'Tasks sorted by due date' });
  }
  
  // Sort tasks by deadline (overdue first, then by date, then no deadline)
  const sortedTasks = activeTasks.sort((a, b) => {
    // Completed tasks last (shouldn't happen since we filter them out, but just in case)
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    
    // No deadline goes to end
    if (!a.deadline && b.deadline) return 1;
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && !b.deadline) return 0;
    
    // Sort by deadline date
    return a.deadline.localeCompare(b.deadline);
  });
  
  const taskLines = sortedTasks.map(task => {
    const job = jobs.find(j => j.id === task.jobId);
    const client = clients.find(c => c.id === job?.clientId);
    
    const statusIcon = getStatusIcon(task);
    const priorityIcon = getPriorityIcon(task.priority);
    const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
    
    let deadlineText = '';
    if (task.deadline) {
      const days = daysTilDeadline(task.deadline);
      const dateStr = prettyDate(task.deadline);
      
      if (isOverdue(task.deadline)) {
        deadlineText = ` — ⚠️ **OVERDUE** (${dateStr})`;
      } else if (days === 0) {
        deadlineText = ` — 📅 **DUE TODAY**`;
      } else if (days === 1) {
        deadlineText = ` — 📅 Due tomorrow`;
      } else if (days <= 3) {
        deadlineText = ` — 📅 Due in ${days} days`;
      } else {
        deadlineText = ` — 📅 ${dateStr}`;
      }
    }
    
    // Create links for client and job
    let clientLink = 'Unknown Client';
    let jobLink = 'Unknown Job';
    
    if (client && client.channelId) {
      clientLink = `[${client.name}](https://discord.com/channels/${guildId}/${client.channelId})`;
    } else if (client) {
      clientLink = client.name;
    }
    
    if (job && job.threadId) {
      jobLink = `[${job.title}](https://discord.com/channels/${guildId}/${job.threadId})`;
    } else if (job) {
      jobLink = job.title;
    }
    
    return `${priorityIcon} **${task.title}** — ${assignee}${deadlineText}\n   ${clientLink} • ${jobLink}`;
  });
  
  const overdueTasks = activeTasks.filter(t => t.deadline && isOverdue(t.deadline));
  const dueTodayTasks = activeTasks.filter(t => t.deadline && daysTilDeadline(t.deadline) === 0);
  const dueSoonTasks = activeTasks.filter(t => t.deadline && daysTilDeadline(t.deadline) > 0 && daysTilDeadline(t.deadline) <= 3);
  
  let footerText = `${activeTasks.length} active tasks`;
  if (overdueTasks.length > 0) footerText += ` • ${overdueTasks.length} overdue`;
  if (dueTodayTasks.length > 0) footerText += ` • ${dueTodayTasks.length} due today`;
  if (dueSoonTasks.length > 0) footerText += ` • ${dueSoonTasks.length} due soon`;
  
  return new EmbedBuilder()
    .setTitle('📋 Task Board')
    .setColor(overdueTasks.length > 0 ? 0xff0000 : dueTodayTasks.length > 0 ? 0xff9900 : 0x5865f2)
    .setDescription(taskLines.join('\n\n'))
    .setFooter({ text: footerText });
}

async function refreshTaskBoard(client, guildId, channelId, messageId = null) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;
    
    const embed = await buildTaskBoard(guildId);
    
    // Get stored message ID if not provided
    const storedMessageId = messageId || settings.getTaskBoardMessageId(guildId);
    
    if (storedMessageId) {
      try {
        const message = await channel.messages.fetch(storedMessageId);
        await message.edit({ embeds: [embed] });
        return message;
      } catch {
        // Message not found, clear stored ID and fall through to send new message
        settings.setTaskBoardMessageId(guildId, null);
      }
    }
    
    const sent = await channel.send({ embeds: [embed] });
    
    // Store the new message ID and pin it
    settings.setTaskBoardMessageId(guildId, sent.id);
    try {
      await sent.pin();
    } catch (error) {
      console.warn('Failed to pin task board message:', error.message);
    }
    
    return sent;
  } catch (error) {
    console.error('Failed to refresh task board:', error);
    return null;
  }
}

async function refreshAllTaskBoards(client) {
  // For now, we'll look for channels named "task-board" in each guild
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      console.log(`🔍 Looking for task board channel in guild ${guildId}...`);
      const taskBoardChannel = guild.channels.cache.find(c => 
        c.name.includes('task-board') && c.isTextBased()
      );
      
      if (taskBoardChannel) {
        console.log(`📋 Found task board channel: ${taskBoardChannel.name}`);
        await refreshTaskBoard(client, guildId, taskBoardChannel.id);
        console.log(`🔄 Task board refreshed for guild ${guildId}`);
      } else {
        console.log(`⚠️ No task board channel found in guild ${guildId}. Channels: ${guild.channels.cache.map(c => c.name).join(', ')}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to refresh task board for ${guildId}`, error?.message || error);
    }
  }
}

module.exports = {
  buildTaskBoard,
  refreshTaskBoard,
  refreshAllTaskBoards
};