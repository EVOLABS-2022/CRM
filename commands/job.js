// commands/task.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const chrono = require('chrono-node');
const { v4: uuidv4 } = require('uuid');
const { getJobs, createTask, getTasks, updateTask } = require('../lib/sheetsDb');
const { refreshAllTaskBoards } = require('../utils/taskBoard');
const { fullSync } = require('../lib/fullSync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Manage tasks under jobs')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a task to a job')
        .addStringOption(o =>
          o.setName('job')
            .setDescription('Job to add task to')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o => o.setName('title').setDescription('Task title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Task description (optional)'))
        .addUserOption(o => o.setName('assignee').setDescription('Assign to user (optional)'))
        .addStringOption(o => o.setName('deadline').setDescription('Deadline (e.g., "next Friday", "in 2 weeks", "Dec 15")'))
        .addStringOption(o => 
          o.setName('priority').setDescription('Task priority')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' },
              { name: 'Urgent', value: 'urgent' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List tasks for a job')
        .addStringOption(o =>
          o.setName('job')
            .setDescription('Job to list tasks for')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Mark a task as completed')
        .addStringOption(o => 
          o.setName('task')
            .setDescription('Task to complete')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('Edit an existing task')
        .addStringOption(o => 
          o.setName('task')
            .setDescription('Task to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o => o.setName('title').setDescription('New task title'))
        .addStringOption(o => o.setName('description').setDescription('New task description'))
        .addUserOption(o => o.setName('assignee').setDescription('Assign to user'))
        .addStringOption(o => o.setName('deadline').setDescription('Deadline (e.g., "next Friday", "in 2 weeks", "Dec 15")'))
        .addStringOption(o => 
          o.setName('priority').setDescription('Task priority')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' },
              { name: 'Urgent', value: 'urgent' }
            )
        )
        .addStringOption(o =>
          o.setName('status').setDescription('Task status')
            .addChoices(
              { name: 'Open', value: 'open' },
              { name: 'In Progress', value: 'in-progress' },
              { name: 'Completed', value: 'completed' }
            )
        )
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      
      // Handle job field autocomplete
      if (focused.name === 'job') {
        console.log('Task autocomplete - Focused field:', focused.name, 'Value:', `"${focused.value}"`, 'Type:', typeof focused.value);
        const jobs = await getJobs();
        console.log('Number of jobs from Sheets:', jobs.length);
        
        if (jobs.length === 0) {
          console.log('No jobs found in Sheets');
          return await interaction.respond([]);
        }
        
        const openJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'closed');
        console.log('Open jobs available:', openJobs.length);
        
        const choices = openJobs.map(j => ({
          name: `${j.id} - ${j.title}`,
          value: j.id
        }));
        
        const filtered = (!focused.value || focused.value === '')
          ? choices
          : choices.filter(choice => 
              choice.name.toLowerCase().includes(focused.value.toLowerCase())
            );
        
        console.log('Returning job choices:', filtered.length);
        await interaction.respond(filtered.slice(0, 25));
      }
      
      // Handle task field autocomplete
      if (focused.name === 'task') {
        const tasks = await getTasks();
        const choices = tasks
          .filter(t => t.status !== 'completed')
          .map(t => ({
            name: `${t.id} - ${t.title}`,
            value: t.id
          }))
          .filter(choice => 
            !focused.value || 
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
          )
          .slice(0, 25);
        
        await interaction.respond(choices);
      }
    } catch (error) {
      console.error('Task autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const jobId = interaction.options.getString('job');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description') || '';
      const assignee = interaction.options.getUser('assignee');
      const deadlineInput = interaction.options.getString('deadline');
      const priority = interaction.options.getString('priority') || 'medium';

      try {
        // Validate job exists and is not closed
        const jobs = await getJobs();
        const job = jobs.find(j => j.id === jobId);
        
        if (!job) {
          return await interaction.editReply({
            content: '❌ Job not found.'
          });
        }
        
        if (job.status === 'completed' || job.status === 'closed') {
          return await interaction.editReply({
            content: '❌ Cannot add tasks to completed or closed jobs.'
          });
        }

        // Parse deadline if provided
        let parsedDeadline = null;
        if (deadlineInput) {
          const parsed = chrono.parseDate(deadlineInput);
          if (!parsed) {
            return await interaction.editReply({
              content: '❌ Could not understand the deadline format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          parsedDeadline = parsed.toISOString().split('T')[0];
        }

        // Generate task ID
        const existingTasks = await getTasks();
        const jobTasks = existingTasks.filter(t => t.jobId === jobId);
        const taskNumber = String(jobTasks.length + 1).padStart(2, '0');
        const taskId = `${jobId}-T${taskNumber}`;

        // Create task
        const task = {
          id: taskId,
          jobId: jobId,
          title: title,
          description: description,
          status: 'open',
          assigneeId: assignee ? assignee.id : '',
          deadline: parsedDeadline || '',
          priority: priority
        };

        await createTask(task);

        // Refresh task boards
        try {
          await fullSync(interaction.client, interaction.guildId);
        } catch (error) {
          console.error('Failed to refresh task boards:', error);
        }

        const assigneeText = assignee ? `<@${assignee.id}>` : 'Unassigned';
        const deadlineText = parsedDeadline ? `${parsedDeadline} UTC (from "${deadlineInput}")` : 'No deadline';

        await interaction.editReply({
          content: `✅ Created task **${title}** (${taskId})\n\`\`\`\nJob: ${job.title} (${jobId})\nAssignee: ${assigneeText}\nDeadline: ${deadlineText}\nPriority: ${priority}\n\`\`\``
        });

      } catch (error) {
        console.error('❌ Task creation failed:', error);
        await interaction.editReply({
          content: `❌ Failed to create task: ${error.message}`
        });
      }
    }

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const jobId = interaction.options.getString('job');
      
      try {
        const jobs = await getJobs();
        const tasks = await getTasks();
        
        const job = jobs.find(j => j.id === jobId);
        if (!job) {
          return await interaction.editReply({
            content: '❌ Job not found.'
          });
        }
        
        const jobTasks = tasks.filter(t => t.jobId === jobId);
        
        if (jobTasks.length === 0) {
          return await interaction.editReply({
            content: `📋 No tasks found for job **${job.title}** (${jobId})`
          });
        }
        
        const taskLines = jobTasks.map(t => {
          const status = t.status === 'completed' ? '✅' : t.status === 'in-progress' ? '🔄' : '📋';
          const assignee = t.assigneeId ? `<@${t.assigneeId}>` : 'Unassigned';
          const deadline = t.deadline ? ` (due ${t.deadline})` : '';
          return `${status} **${t.title}** (${t.id}) - ${assignee}${deadline}`;
        });
        
        await interaction.editReply({
          content: `📋 **Tasks for ${job.title}** (${jobId})\n\n${taskLines.join('\n')}`
        });
        
      } catch (error) {
        console.error('❌ Task list failed:', error);
        await interaction.editReply({
          content: `❌ Failed to list tasks: ${error.message}`
        });
      }
    }

    if (sub === 'complete') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const taskId = interaction.options.getString('task');
      
      try {
        const tasks = await getTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
          return await interaction.editReply({
            content: '❌ Task not found.'
          });
        }
        
        if (task.status === 'completed') {
          return await interaction.editReply({
            content: '❌ Task is already completed.'
          });
        }
        
        await updateTask(taskId, { status: 'completed' });
        
        // Refresh task boards
        try {
          await fullSync(interaction.client, interaction.guildId);
        } catch (error) {
          console.error('Failed to refresh task boards:', error);
        }
        
        await interaction.editReply({
          content: `✅ Marked task **${task.title}** (${taskId}) as completed`
        });
        
      } catch (error) {
        console.error('❌ Task completion failed:', error);
        await interaction.editReply({
          content: `❌ Failed to complete task: ${error.message}`
        });
      }
    }

    if (sub === 'edit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const taskId = interaction.options.getString('task');
      const newTitle = interaction.options.getString('title');
      const newDescription = interaction.options.getString('description');
      const newAssignee = interaction.options.getUser('assignee');
      const newDeadlineInput = interaction.options.getString('deadline');
      const newPriority = interaction.options.getString('priority');
      const newStatus = interaction.options.getString('status');
      
      try {
        const tasks = await getTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) {
          return await interaction.editReply({
            content: '❌ Task not found.'
          });
        }
        
        // Parse new deadline if provided
        let parsedDeadline = null;
        if (newDeadlineInput) {
          const parsed = chrono.parseDate(newDeadlineInput);
          if (!parsed) {
            return await interaction.editReply({
              content: '❌ Could not understand the deadline format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          parsedDeadline = parsed.toISOString().split('T')[0];
        }
        
        // Build updates object
        const updates = {};
        if (newTitle) updates.title = newTitle;
        if (newDescription !== null) updates.description = newDescription;
        if (newAssignee) updates.assigneeId = newAssignee.id;
        if (parsedDeadline) updates.deadline = parsedDeadline;
        if (newPriority) updates.priority = newPriority;
        if (newStatus) updates.status = newStatus;
        
        if (Object.keys(updates).length === 0) {
          return await interaction.editReply({
            content: '❌ No changes provided. Please specify at least one field to update.'
          });
        }
        
        await updateTask(taskId, updates);
        
        // Refresh task boards
        try {
          await fullSync(interaction.client, interaction.guildId);
        } catch (error) {
          console.error('Failed to refresh task boards:', error);
        }
        
        const changedFields = Object.keys(updates).map(key => {
          const oldValue = task[key] || 'empty';
          let newValue = updates[key];
          let displayValue = newValue;
          
          // Show original natural language for deadline
          if (key === 'deadline' && newDeadlineInput) {
            displayValue = `${newValue} UTC (from "${newDeadlineInput}")`;
          }
          
          return `${key}: ${oldValue} → ${displayValue}`;
        }).join('\n');
        
        await interaction.editReply({
          content: `✅ Updated task **${task.title}** (${taskId})\n\`\`\`\n${changedFields}\n\`\`\``
        });
        
      } catch (error) {
        console.error('❌ Task edit failed:', error);
        await interaction.editReply({
          content: `❌ Failed to edit task: ${error.message}`
        });
      }
    }
  }
};
