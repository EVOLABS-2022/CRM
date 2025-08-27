// commands/mytasks.js
const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { isTasksOnlyUser, canSeeClientJobData } = require('../config/roles');
const { createTasksByClientEmbed, createTasksByStatusEmbed } = require('../utils/tasksChannel');
const { getTasks, getClients, getJobs, updateTask } = require('../lib/sheetsDb');
const { filterTaskData } = require('../utils/permissionFilter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mytasks')
    .setDescription('View and manage your assigned tasks')
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View your tasks')
        .addStringOption(opt =>
          opt
            .setName('view')
            .setDescription('How to group your tasks')
            .setRequired(false)
            .addChoices(
              { name: 'By Client', value: 'client' },
              { name: 'By Status', value: 'status' },
              { name: 'All Tasks', value: 'all' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('update')
        .setDescription('Update the status of one of your tasks')
        .addStringOption(opt =>
          opt
            .setName('task')
            .setDescription('Task to update')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName('status')
            .setDescription('New status')
            .setRequired(true)
            .addChoices(
              { name: 'In Progress', value: 'in-progress' },
              { name: 'Completed', value: 'completed' },
              { name: 'Pending', value: 'pending' }
            )
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'task') {
      try {
        const tasks = await getTasks();
        const userTasks = tasks.filter(task => 
          task.assigneeId === interaction.user.id
        );
        
        const choices = userTasks.map(task => ({
          name: `${task.title} (${task.status || 'unknown'})`,
          value: task.id
        })).filter(choice => 
          !focused.value || 
          choice.name.toLowerCase().includes(focused.value.toLowerCase())
        ).slice(0, 25);
        
        await interaction.respond(choices);
      } catch (error) {
        console.error('Task autocomplete error:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    // This command is primarily for Staff users, but Team Lead+ can use it too
    const member = interaction.member;
    const userDiscordId = interaction.user.id;
    
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const viewType = interaction.options.getString('view') || 'client';
        let embed;
        
        switch (viewType) {
          case 'client':
            embed = await createTasksByClientEmbed(member, userDiscordId);
            break;
          case 'status':
            embed = await createTasksByStatusEmbed(member, userDiscordId);
            break;
          case 'all':
          default:
            // Show all user's tasks
            const tasks = await getTasks();
            const userTasks = tasks
              .map(task => filterTaskData(task, member, userDiscordId))
              .filter(Boolean);
            
            if (userTasks.length === 0) {
              embed = new EmbedBuilder()
                .setTitle('📋 Your Tasks')
                .setDescription('You have no assigned tasks.')
                .setColor(0x95a5a6);
            } else {
              const taskList = userTasks.map(task => 
                `• **${task.title}** - ${task.status || 'Unknown'} (${task.priority || 'Normal'} priority)`
              ).join('\n');
              
              embed = new EmbedBuilder()
                .setTitle(`📋 All Your Tasks (${userTasks.length})`)
                .setDescription(taskList.length > 2048 ? taskList.substring(0, 2045) + '...' : taskList)
                .setColor(0x3498db);
            }
            break;
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('❌ Failed to list tasks:', error);
        await interaction.editReply({
          content: '❌ Failed to retrieve your tasks.'
        });
      }
    }
    
    if (sub === 'update') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const taskId = interaction.options.getString('task');
        const newStatus = interaction.options.getString('status');
        
        // Verify the task belongs to this user
        const tasks = await getTasks();
        const task = tasks.find(t => t.id === taskId && t.assigneeId === userDiscordId);
        
        if (!task) {
          return await interaction.editReply({
            content: '❌ Task not found or not assigned to you.'
          });
        }
        
        // Update the task
        await updateTask(taskId, { status: newStatus });
        
        // Get updated task info
        const [clients, jobs] = await Promise.all([
          getClients(),
          getJobs()
        ]);
        
        const job = jobs.find(j => j.id === task.jobId);
        const client = job ? clients.find(c => c.id === job.clientId) : null;
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Task Updated')
          .setDescription(`Successfully updated **${task.title}** to **${newStatus}**`)
          .addFields(
            { name: '👤 Client', value: client ? `${client.name} (${client.code})` : 'Unknown', inline: true },
            { name: '📋 Job', value: job ? job.title : 'Unknown', inline: true },
            { name: '📊 New Status', value: newStatus, inline: true }
          )
          .setColor(0x2ecc71);
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('❌ Failed to update task:', error);
        await interaction.editReply({
          content: '❌ Failed to update task status.'
        });
      }
    }
  }
};
