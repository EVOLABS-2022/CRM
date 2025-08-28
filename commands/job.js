// commands/job.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const chrono = require('chrono-node');
const { getClients, getJobs, createJob, updateJobThread, updateJob } = require('../lib/sheetsDb');
const { refreshAllBoards } = require('../lib/board');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { ensureClientCard } = require('../lib/clientCard');
const { ensureJobThread } = require('../lib/jobThreads');
const { getClientFolderId, ensureJobFolder } = require('../lib/driveManager');
const { setJobComplete } = require('../lib/jobsComplete');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('Manage jobs')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new job')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client code').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('title').setDescription('Job title').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit an existing job')
        .addStringOption(opt =>
          opt.setName('job').setDescription('Job to edit').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('title').setDescription('New job title')
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('Job description')
        )
        .addStringOption(opt =>
          opt.setName('status').setDescription('Job status')
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'In Progress', value: 'in-progress' },
            { name: 'Pending', value: 'pending' },
            { name: 'Completed', value: 'completed' },
            { name: 'Closed', value: 'closed' }
          )
        )
        .addStringOption(opt =>
          opt.setName('deadline').setDescription('Job deadline (e.g., "next Friday", "in 2 weeks", "Dec 15")')
        )
        .addNumberOption(opt =>
          opt.setName('budget').setDescription('Job budget amount')
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Additional notes')
        )
        .addStringOption(opt =>
          opt.setName('priority').setDescription('Job priority')
          .addChoices(
            { name: 'Low', value: 'low' },
            { name: 'Medium', value: 'medium' },
            { name: 'High', value: 'high' },
            { name: 'Urgent', value: 'urgent' }
          )
        )
        .addUserOption(opt =>
          opt.setName('assignee').setDescription('Assign job to user')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('complete')
        .setDescription('Mark a job Complete (updates Sheet and hides from boards)')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Job ID (e.g., NEO-001)').setRequired(true).setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);

      // client code for /job create
      if (focused.name === 'client') {
        const clients = await getClients();
        if (!clients?.length) return await interaction.respond([]);

        const valid = clients.filter(c => c.code);
        const choices = valid.map(c => ({ name: `${c.code} - ${c.name}`, value: c.code }));
        const filtered = (!focused.value || focused.value === '')
          ? choices
          : choices.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()));
        return await interaction.respond(filtered.slice(0, 25));
      }

      // job id for /job edit
      if (focused.name === 'job') {
        const jobs = await getJobs();
        const choices = jobs
          .filter(j => j.status !== 'completed' && j.status !== 'closed') // treat completed/closed as non-edit targets
          .map(j => ({ name: `${j.id} - ${j.title}`, value: j.id }))
          .filter(choice => !focused.value || choice.name.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25);
        return await interaction.respond(choices);
      }

      // job id for /job complete
      if (focused.name === 'id') {
        const jobs = await getJobs();
        const choices = jobs
          .filter(j => j.status !== 'completed' && j.status !== 'closed') // only open-ish jobs
          .map(j => ({ name: `${j.id} - ${j.title}`, value: j.id }))
          .filter(choice => !focused.value || choice.name.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25);
        return await interaction.respond(choices);
      }

      // default
      return await interaction.respond([]);
    } catch (error) {
      console.error('Job autocomplete error:', error);
      try { await interaction.respond([]); } catch {}
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      console.log('🔧 Starting job creation...');
      const clientCode = interaction.options.getString('client');
      const title = interaction.options.getString('title');
      console.log('Job details:', { clientCode, title });

      try {
        const clients = await getClients();
        const existingJobs = await getJobs();

        const client = clients.find(c => c.code === clientCode);
        if (!client) {
          return await interaction.editReply({ content: `❌ Client with code ${clientCode} not found.` });
        }

        // sequential job number for this client
        const clientJobs = existingJobs.filter(j => j.clientCode === clientCode);
        const number = String(clientJobs.length + 1).padStart(3, '0');
        const jobId = `${clientCode}-${number}`;

        const job = {
          id: jobId,
          clientCode,
          clientId: client.id,
          title,
          status: 'open'
        };

        console.log('📝 Creating job in Google Sheets:', job);
        await createJob(job);
        console.log('💾 Job saved to Google Sheets');

        // Drive folder
        try {
          console.log('📁 Creating Drive folder for job:', job.title);
          const clientFolderId = await getClientFolderId(client.code.trim());
          if (clientFolderId) {
            const jobFolderId = await ensureJobFolder(clientFolderId, job.id, job.title);
            if (jobFolderId) console.log(`✅ Created/found job folder ${job.id} (ID: ${jobFolderId})`);
            else console.warn(`⚠️ Could not create/find job folder for ${job.id}`);
          } else {
            console.warn(`⚠️ Client folder not found for ${client.code}, skipping job folder creation`);
          }
        } catch (error) {
          console.error('❌ Failed to create job folder:', error);
        }

        // client card (twice previously; keep single call)
        try {
          await ensureClientCard(interaction.client, interaction.guildId, client);
          console.log('✅ Client card updated with new job');
        } catch (error) {
          console.error('Failed to update client card:', error);
        }

        // boards
        try {
          console.log('🔄 Updating boards after job creation...');
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
          console.log('✅ Boards updated successfully');
        } catch (error) {
          console.error('❌ Failed to update boards:', error);
        }

        console.log('✅ Job creation complete, sending reply...');
        await interaction.editReply({ content: `✅ Created job ${title} (${jobId}) for ${client.name}` });
      } catch (error) {
        console.error('❌ Job creation failed:', error);
        await interaction.editReply({ content: `❌ Failed to create job: ${error.message}` });
      }
      return;
    }

    if (sub === 'edit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const jobId = interaction.options.getString('job');
      const newTitle = interaction.options.getString('title');
      const newDescription = interaction.options.getString('description');
      const newStatus = interaction.options.getString('status');
      const newDeadline = interaction.options.getString('deadline');
      const newBudget = interaction.options.getNumber('budget');
      const newNotes = interaction.options.getString('notes');
      const newPriority = interaction.options.getString('priority');
      const newAssignee = interaction.options.getUser('assignee');

      try {
        const jobs = await getJobs();
        const job = jobs.find(j => j.id === jobId);
        if (!job) {
          return await interaction.editReply({ content: '❌ Job not found.' });
        }

        // parse deadline
        let parsedDeadline = null;
        if (newDeadline) {
          const parsed = chrono.parseDate(newDeadline);
          if (!parsed) {
            return await interaction.editReply({
              content: '❌ Could not understand the deadline format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          parsedDeadline = parsed.toISOString().split('T')[0]; // YYYY-MM-DD UTC
        }

        const updates = {};
        if (newTitle) updates.title = newTitle;
        if (newDescription !== null) updates.description = newDescription;
        if (newStatus) updates.status = newStatus;
        if (parsedDeadline) updates.deadline = parsedDeadline;
        if (newBudget !== null) updates.budget = newBudget;
        if (newNotes !== null) updates.notes = newNotes;
        if (newPriority) updates.priority = newPriority;
        if (newAssignee) updates.assigneeId = newAssignee.id;

        if (Object.keys(updates).length === 0) {
          return await interaction.editReply({ content: '❌ No changes provided. Please specify at least one field to update.' });
        }

        // update sheet
        console.log('📝 Updating job in Google Sheets:', job.title);
        const updatedJob = await updateJob(jobId, updates);

        // refresh client card + job thread + boards
        try {
          const clients = await getClients();
          const client = clients.find(c => c.id === job.clientId);
          if (client) {
            await ensureClientCard(interaction.client, interaction.guildId, client);

            if (client.channelId) {
              const channel = await interaction.client.channels.fetch(client.channelId).catch(() => null);
              if (channel) {
                await ensureJobThread(interaction.client, client, channel, updatedJob);
              }
            }
          }
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
          console.log('✅ Client card and boards refreshed');
        } catch (error) {
          console.error('❌ Failed to refresh client card/job thread/boards:', error);
        }

        const changedFields = Object.keys(updates).map(key => {
          const oldValue = job[key] || 'empty';
          let displayValue = updates[key];
          if (key === 'deadline' && newDeadline) {
            displayValue = `${updates[key]} UTC (from "${newDeadline}")`;
          }
          return `${key}: ${oldValue} → ${displayValue}`;
        }).join('\n');

        await interaction.editReply({
          content: `✅ Updated job ${updatedJob.title} (${updatedJob.id})\n\`\`\`\n${changedFields}\n\`\`\``
        });
      } catch (error) {
        console.error('❌ Job edit failed:', error);
        await interaction.editReply({ content: `❌ Failed to edit job: ${error.message}` });
      }
      return;
    }

    if (sub === 'complete') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const jobId = interaction.options.getString('id', true);

      try {
        // capture client before we mutate
        const jobsBefore = await getJobs();
        const job = jobsBefore.find(j => j.id === jobId);

        const { rowIndex } = await setJobComplete(jobId);

        // refresh boards & client card
        try {
          if (job?.clientId) {
            const clients = await getClients();
            const client = clients.find(c => c.id === job.clientId);
            if (client) {
              await ensureClientCard(interaction.client, interaction.guildId, client);
            }
          }
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
        } catch (e) {
          console.error('Board refresh after complete failed:', e);
        }

        await interaction.editReply(`✅ Marked **${jobId}** Complete (Jobs row ${rowIndex}). It’s now hidden from boards/cards and no longer counts as open.`);
      } catch (err) {
        const msg = err?.message || String(err);
        await interaction.editReply(`❌ Couldn’t complete **${jobId}**: ${msg}`);
      }
      return;
    }
  }
};
