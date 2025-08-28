// utils/tasksChannel.js
const { EmbedBuilder, ChannelType } = require('discord.js');
const { getTasks, getClients, getJobs } = require('../lib/sheetsDb');
const { isTasksOnlyUser, canSeeClientJobData } = require('../config/roles');
const { filterTaskData, filterClientData, filterJobData } = require('./permissionFilter');

const TASKS_CHANNEL_NAME = '📋-tasks';

/**
 * Ensure tasks channel exists for Staff users
 */
async function ensureTasksChannel(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  
  let channel = guild.channels.cache.find(c => 
    c.name === TASKS_CHANNEL_NAME && c.type === ChannelType.GuildText
  );
  
  if (!channel) {
    channel = await guild.channels.create({
      name: TASKS_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: 'Task assignments and progress tracking for staff members',
      reason: 'Create tasks channel for staff users'
    });
    console.log(`✅ Created tasks channel: ${channel.name}`);
  }
  
  return channel;
}

/**
 * Create task embed with filtered information
 */
function createTaskEmbed(task, client, job, member) {
  const embed = new EmbedBuilder()
    .setColor(getTaskStatusColor(task.status))
    .setTitle(`📝 ${task.title}`)
    .setDescription(task.description || '_No description provided_');
  
  // Add basic task info
  embed.addFields(
    { name: '🆔 Task ID', value: task.id, inline: true },
    { name: '📊 Status', value: getStatusEmoji(task.status), inline: true },
    { name: '⚡ Priority', value: getPriorityEmoji(task.priority), inline: true }
  );
  
  // Add client/job context (filtered)
  if (client && job) {
    embed.addFields(
      { name: '👤 Client', value: `${client.name} (${client.code})`, inline: true },
      { name: '📋 Job', value: job.title, inline: true }
    );
  }
  
  // Add assignee info
  if (task.assigneeId) {
    embed.addFields(
      { name: '👨‍💻 Assigned To', value: `<@${task.assigneeId}>`, inline: true }
    );
  }
  
  // Add deadline if exists
  if (task.deadline) {
    const deadlineDate = new Date(task.deadline);
    const deadlineStr = deadlineDate.toLocaleDateString();
    const isOverdue = deadlineDate < new Date();
    
    embed.addFields(
      { 
        name: isOverdue ? '🚨 Deadline (OVERDUE)' : '⏰ Deadline', 
        value: deadlineStr, 
        inline: true 
      }
    );
  }
  
  embed.setFooter({ 
    text: `📋 Task Access (Staff) • Updated: ${new Date().toLocaleDateString()}` 
  });
  
  return embed;
}

/**
 * Get status color for embeds
 */
function getTaskStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'completed': return 0x2ecc71; // Green
    case 'in-progress': return 0xf39c12; // Orange
    case 'pending': return 0xe74c3c; // Red
    case 'open': return 0x3498db; // Blue
    default: return 0x95a5a6; // Gray
  }
}

/**
 * Get status emoji
 */
function getStatusEmoji(status) {
  switch (status?.toLowerCase()) {
    case 'completed': return '✅ Completed';
    case 'in-progress': return '🔄 In Progress';
    case 'pending': return '⏸️ Pending';
    case 'open': return '🆕 Open';
    default: return '❓ Unknown';
  }
}

/**
 * Get priority emoji
 */
function getPriorityEmoji(priority) {
  switch (priority?.toLowerCase()) {
    case 'high': return '🔴 High';
    case 'medium': return '🟡 Medium';
    case 'low': return '🟢 Low';
    default: return '⚪ Normal';
  }
}

/**
 * Create tasks breakdown by client
 */
async function createTasksByClientEmbed(member, userDiscordId) {
  const [tasks, clients, jobs] = await Promise.all([
    getTasks(),
    getClients(),
    getJobs()
  ]);
  
  // Filter tasks for this user
  const userTasks = tasks
    .map(task => filterTaskData(task, member, userDiscordId))
    .filter(Boolean);
  
  if (userTasks.length === 0) {
    return new EmbedBuilder()
      .setTitle('📋 Your Tasks by Client')
      .setDescription('You have no assigned tasks.')
      .setColor(0x95a5a6);
  }
  
  // Group tasks by client
  const tasksByClient = {};
  for (const task of userTasks) {
    const job = jobs.find(j => j.id === task.jobId);
    const client = job ? clients.find(c => c.id === job.clientId) : null;
    
    const clientKey = client ? `${client.name} (${client.code})` : 'Unknown Client';
    if (!tasksByClient[clientKey]) {
      tasksByClient[clientKey] = [];
    }
    
    tasksByClient[clientKey].push({
      task,
      job: job ? job.title : 'Unknown Job'
    });
  }
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Your Tasks by Client')
    .setColor(0x3498db)
    .setDescription(`You have ${userTasks.length} assigned task(s) across ${Object.keys(tasksByClient).length} client(s)`);
  
  // Add fields for each client
  Object.entries(tasksByClient).forEach(([clientName, clientTasks]) => {
    const taskList = clientTasks.map(({ task, job }) => 
      `• **${task.title}** (${job}) - ${getStatusEmoji(task.status)}`
    ).join('\n');
    
    embed.addFields({
      name: `👤 ${clientName}`,
      value: taskList.length > 1024 ? taskList.substring(0, 1021) + '...' : taskList,
      inline: false
    });
  });
  
  return embed;
}

/**
 * Create tasks breakdown by status
 */
async function createTasksByStatusEmbed(member, userDiscordId) {
  const tasks = await getTasks();
  
  // Filter tasks for this user
  const userTasks = tasks
    .map(task => filterTaskData(task, member, userDiscordId))
    .filter(Boolean);
  
  if (userTasks.length === 0) {
    return new EmbedBuilder()
      .setTitle('📊 Your Tasks by Status')
      .setDescription('You have no assigned tasks.')
      .setColor(0x95a5a6);
  }
  
  // Group tasks by status
  const tasksByStatus = userTasks.reduce((acc, task) => {
    const status = task.status || 'unknown';
    if (!acc[status]) acc[status] = [];
    acc[status].push(task);
    return acc;
  }, {});
  
  const embed = new EmbedBuilder()
    .setTitle('📊 Your Tasks by Status')
    .setColor(0xf39c12);
  
  // Add fields for each status
  Object.entries(tasksByStatus).forEach(([status, statusTasks]) => {
    const taskList = statusTasks.map(task => 
      `• **${task.title}** - ${task.priority || 'Normal'} priority`
    ).join('\n');
    
    embed.addFields({
      name: `${getStatusEmoji(status)} (${statusTasks.length})`,
      value: taskList.length > 1024 ? taskList.substring(0, 1021) + '...' : taskList,
      inline: true
    });
  });
  
  return embed;
}

/**
 * Update tasks channel with current task information
 */
async function refreshTasksChannel(client, guildId) {
  try {
    const channel = await ensureTasksChannel(client, guildId);
    if (!channel) return;
    
    console.log('🔄 Refreshing tasks channel...');
    
    // Clear old messages
    const messages = await channel.messages.fetch({ limit: 10 });
    if (messages.size > 0) {
      await channel.bulkDelete(messages);
    }
    
    // Send overview message
    const overviewEmbed = new EmbedBuilder()
      .setTitle('📋 Tasks Channel')
      .setDescription('This channel is specifically for Staff members to track their assigned tasks.\n\n**Available Views:**\n• Tasks by Client\n• Tasks by Status\n• Individual Task Details')
      .setColor(0x3498db)
      .setFooter({ text: 'This channel updates automatically every 10 minutes' });
    
    await channel.send({ embeds: [overviewEmbed] });
    
    console.log('✅ Tasks channel refreshed');
  } catch (error) {
    console.error('❌ Failed to refresh tasks channel:', error);
  }
}

module.exports = {
  ensureTasksChannel,
  createTaskEmbed,
  createTasksByClientEmbed,
  createTasksByStatusEmbed,
  refreshTasksChannel,
  TASKS_CHANNEL_NAME
};
