// commands/task.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
  findJobById,
  createTask,
  listTasksByJob,
  findTaskById,
  assignTask,
  closeTask,
  reopenTask,
  setTaskDeadline,
} = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Manage tasks under jobs')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a task to a job')
        .addStringOption(o =>
          o.setName('jobid')
            .setDescription('Job ID (e.g., J1)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o => o.setName('title').setDescription('Task title').setRequired(true))
        .addUserOption(o => o.setName('assignee').setDescription('Assign to user (optional)'))
        .addStringOption(o => o.setName('deadline').setDescription('Deadline (YYYY-MM-DD)'))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List tasks for a job')
        .addStringOption(o =>
          o.setName('jobid')
            .setDescription('Job ID (e.g., J1)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('assign')
        .setDescription('Assign a task to a user')
        .addStringOption(o => o.setName('taskid').setDescription('Task ID (e.g., T1)').setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('User to assign').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Mark a task complete')
        .addStringOption(o => o.setName('taskid').setDescription('Task ID (e.g., T1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reopen')
        .setDescription('Reopen a closed task')
        .addStringOption(o => o.setName('taskid').setDescription('Task ID (e.g., T1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('deadline')
        .setDescription('Set or change a task deadline')
        .addStringOption(o => o.setName('taskid').setDescription('Task ID (e.g., T1)').setRequired(true))
        .addStringOption(o => o.setName('deadline').setDescription('Deadline (YYYY-MM-DD)').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const jobId = interaction.options.getString('jobid');
      const title = interaction.options.getString('title');
      const assignee = interaction.options.getUser('assignee');
      const deadline = interaction.options.getString('deadline') || null;

      const job = findJobById(jobId);
      if (!job) return interaction.reply({ content: `❌ Job \`${jobId}\` not found.`, flags: MessageFlags.Ephemeral });

      const task = createTask({
        jobId: job.id,
        title,
        assigneeId: assignee ? assignee.id : null,
        deadline,
      });

      return interaction.reply(
        `🆕 Task **${task.title}** created for job \`${job.id}\`.\nID: \`${task.id}\`\nAssignee: ${task.assigneeId ? `<@${task.assigneeId}>` : '—'}\nDeadline: ${task.deadline || '—'}\nStatus: ${task.done ? '✅' : '❌'}`
      );
    }

    if (sub === 'list') {
      const jobId = interaction.options.getString('jobid');
      const job = findJobById(jobId);
      if (!job) return interaction.reply({ content: `❌ Job \`${jobId}\` not found.`, flags: MessageFlags.Ephemeral });

      const tasks = listTasksByJob(job.id);
      if (!tasks.length) return interaction.reply(`📋 No tasks for job \`${job.id}\`.`);

      const lines = tasks.map(t =>
        `- [${t.done ? '✅' : '❌'}] **${t.title}** (\`${t.id}\`) — ${t.assigneeId ? `<@${t.assigneeId}>` : 'unassigned'} — ${t.deadline || 'no deadline'}`
      );
      return interaction.reply(`**Tasks for ${job.title}** (\`${job.id}\`)\n${lines.join('\n')}`);
    }

    if (sub === 'assign') {
      const taskId = interaction.options.getString('taskid');
      const user = interaction.options.getUser('user');
      const task = findTaskById(taskId);
      if (!task) return interaction.reply({ content: `❌ Task \`${taskId}\` not found.`, flags: MessageFlags.Ephemeral });

      const updated = assignTask(taskId, user.id);
      return interaction.reply(`👤 Assigned task \`${updated.id}\` to ${user}.`);
    }

    if (sub === 'close') {
      const taskId = interaction.options.getString('taskid');
      const task = findTaskById(taskId);
      if (!task) return interaction.reply({ content: `❌ Task \`${taskId}\` not found.`, flags: MessageFlags.Ephemeral });

      const updated = closeTask(taskId);
      return interaction.reply(`✅ Closed task **${updated.title}** (\`${updated.id}\`).`);
    }

    if (sub === 'reopen') {
      const taskId = interaction.options.getString('taskid');
      const task = findTaskById(taskId);
      if (!task) return interaction.reply({ content: `❌ Task \`${taskId}\` not found.`, flags: MessageFlags.Ephemeral });

      const updated = reopenTask(taskId);
      return interaction.reply(`🔄 Reopened task **${updated.title}** (\`${updated.id}\`).`);
    }

    if (sub === 'deadline') {
      const taskId = interaction.options.getString('taskid');
      const deadline = interaction.options.getString('deadline');
      const task = findTaskById(taskId);
      if (!task) return interaction.reply({ content: `❌ Task \`${taskId}\` not found.`, flags: MessageFlags.Ephemeral });

      const updated = setTaskDeadline(taskId, deadline);
      return interaction.reply(`📅 Deadline for task \`${updated.id}\` set to **${updated.deadline}**.`);
    }
  }
};