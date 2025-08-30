// commands/job.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const chrono = require('chrono-node');
const { getClients, getJobs, createJob, updateJob } = require('../lib/sheetsDb');
const { refreshAllBoards } = require('../lib/board');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { ensureClientCard } = require('../lib/clientCard');
const { ensureJobThread } = require('../lib/jobThreads');
const { getClientFolderId, ensureJobFolder } = require('../lib/driveManager');

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
        .addUserOption(opt =>
          opt.setName('assignee').setDescription('Assign job to a team member')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit an existing job')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client code').setRequired(true).setAutocomplete(true)
        )
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
            { name: 'Lead', value: 'lead' },
            { name: 'Contracted', value: 'contracted' },
            { name: 'In Progress', value: 'in-progress' },
            { name: 'Completed', value: 'completed' },
            { name: 'Invoiced', value: 'invoiced' },
            { name: 'Closed', value: 'closed' }
          )
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
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Additional notes')
        )
        .addStringOption(opt =>
          opt.setName('due_date').setDescription('Due date (e.g., "next Friday", "in 2 weeks", "Dec 15")')
        )
        .addUserOption(opt =>
          opt.setName('assignee').setDescription('Assign job to a team member')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('complete')
        .setDescription('Mark a job Complete (updates Sheet and hides from boards)')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client code').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('id').setDescription('Job ID to complete').setRequired(true).setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);

      // /job create -> client OR /job edit -> client
      if (focused.name === 'client') {
        const clients = await getClients();
        if (!clients?.length) return await interaction.respond([]);
        const valid = clients.filter(c => c.code);
        const choices = valid.map(c => ({ name: `${c.code} - ${c.name}`, value: c.code }));
        const filtered = (!focused.value ? choices : choices.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())));
        return await interaction.respond(filtered.slice(0, 25));
      }

      // /job edit -> job (filtered by client)
      if (focused.name === 'job') {
        const jobs = await getJobs();
        const clients = await getClients();
        
        // Get the selected client code from the interaction
        const selectedClientCode = interaction.options.getString('client');
        
        if (!selectedClientCode) {
          // If no client is selected yet, show a helpful message
          return await interaction.respond([
            { name: 'Please select a client first', value: 'select-client-first' }
          ]);
        }
        
        // Find the selected client to get their ID
        const selectedClient = clients.find(c => c.code === selectedClientCode);
        if (!selectedClient) {
          return await interaction.respond([{ name: '❌ Invalid client code - please reselect client', value: 'invalid-client' }]);
        }
        
        // Filter jobs by the selected client
        const clientJobs = jobs.filter(j => 
          j.clientId === selectedClient.id && 
          j.status !== 'completed' && 
          j.status !== 'closed'
        );
        
        if (clientJobs.length === 0) {
          return await interaction.respond([{ name: `📭 No open jobs found for ${selectedClient.name}`, value: 'no-jobs' }]);
        }
        
        const choices = clientJobs
          .map(j => ({ name: `${j.id} - ${j.title}`, value: j.id }))
          .filter(choice => !focused.value || choice.name.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25);
          
        return await interaction.respond(choices);
      }

      // /job complete -> id (filtered by client)
      if (focused.name === 'id') {
        const jobs = await getJobs();
        const clients = await getClients();
        
        // Get the selected client code from the interaction
        const selectedClientCode = interaction.options.getString('client');
        
        if (!selectedClientCode) {
          // If no client is selected yet, show a helpful message
          return await interaction.respond([
            { name: 'Please select a client first', value: 'select-client-first' }
          ]);
        }
        
        // Find the selected client to get their ID
        const selectedClient = clients.find(c => c.code === selectedClientCode);
        if (!selectedClient) {
          return await interaction.respond([{ name: '❌ Invalid client code - please reselect client', value: 'invalid-client' }]);
        }
        
        // Filter jobs by the selected client (only open jobs for completion)
        const clientJobs = jobs.filter(j => 
          j.clientId === selectedClient.id && 
          j.status !== 'completed' && 
          j.status !== 'closed'
        );
        
        if (clientJobs.length === 0) {
          return await interaction.respond([{ name: `📭 No open jobs found for ${selectedClient.name}`, value: 'no-jobs' }]);
        }
        
        const choices = clientJobs
          .map(j => ({ name: `${j.id} - ${j.title}`, value: j.id }))
          .filter(choice => !focused.value || choice.name.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25);
          
        return await interaction.respond(choices);
      }

      return await interaction.respond([]);
    } catch (err) {
      console.error('Job autocomplete error:', err);
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
      const assignee = interaction.options.getUser('assignee');
      console.log('Job details:', { clientCode, title, assignee: assignee?.id });

      try {
        const clients = await getClients();
        const existingJobs = await getJobs();

        const client = clients.find(c => c.code === clientCode);
        if (!client) {
          return await interaction.editReply({ content: `❌ Client with code ${clientCode} not found.` });
        }

        const clientJobs = existingJobs.filter(j => j.clientCode === clientCode);
        const number = String(clientJobs.length + 1).padStart(3, '0');
        const jobId = `${clientCode}-${number}`;

        const job = {
          id: jobId,
          clientCode,
          clientId: client.id,
          title,
          status: 'lead'
        };
        
        if (assignee) {
          job.assigneeId = assignee.id;
        }

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

        // client card
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
        const assigneeText = assignee ? ` assigned to ${assignee.displayName}` : '';
        await interaction.editReply({ content: `✅ Created job ${title} (${jobId}) for ${client.name}${assigneeText}` });
      } catch (error) {
        console.error('❌ Job creation failed:', error);
        await interaction.editReply({ content: `❌ Failed to create job: ${error.message}` });
      }
      return;
    }

    if (sub === 'edit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const clientCode = interaction.options.getString('client');
      const jobId = interaction.options.getString('job');
      
      // Check for invalid autocomplete selections
      if (jobId === 'select-client-first' || jobId === 'no-jobs' || jobId === 'invalid-client') {
        return await interaction.editReply({ 
          content: '❌ Please select a valid client first, then choose a job from that client.' 
        });
      }
      
      try {
        // Validate the client exists
        const clients = await getClients();
        const client = clients.find(c => c.code === clientCode);
        if (!client) {
          return await interaction.editReply({ content: `❌ Client with code ${clientCode} not found.` });
        }

        const jobs = await getJobs();
        const job = jobs.find(j => j.id === jobId);
        if (!job) {
          return await interaction.editReply({ content: '❌ Job not found.' });
        }
        
        // Validate that the job belongs to the selected client
        if (job.clientId !== client.id) {
          return await interaction.editReply({ 
            content: `❌ Job ${jobId} does not belong to client ${clientCode}. Please select the correct client.` 
          });
        }

        // Get the edit parameters
        const newTitle = interaction.options.getString('title');
        const newDescription = interaction.options.getString('description');
        const newStatus = interaction.options.getString('status');
        const newPriority = interaction.options.getString('priority');
        const newNotes = interaction.options.getString('notes');
        const newDueDate = interaction.options.getString('due_date');
        const newAssignee = interaction.options.getUser('assignee');

        // Build updates object only for provided fields
        const updates = {};
        if (newTitle) updates.title = newTitle;
        if (newDescription !== null) updates.description = newDescription;
        if (newStatus) updates.status = newStatus;
        if (newPriority) updates.priority = newPriority;
        if (newNotes !== null) updates.notes = newNotes;
        
        // Handle due date parsing
        if (newDueDate) {
          const parsedDate = chrono.parseDate(newDueDate);
          if (!parsedDate) {
            return await interaction.editReply({
              content: '❌ Could not understand the due date. Try formats like "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          updates.deadline = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
        
        // Handle assignee
        if (newAssignee) {
          updates.assigneeId = newAssignee.id;
        }

        if (Object.keys(updates).length === 0) {
          // Show current job details if no updates provided
          const currentDetails = [
            `**Job:** ${job.title}`,
            `**Client:** ${client.name} (${clientCode})`,
            `**Status:** ${job.status || 'open'}`,
            `**Description:** ${job.description || 'None'}`,
            `**Priority:** ${job.priority || 'Not set'}`,
            `**Due Date:** ${job.deadline ? new Date(job.deadline + 'T12:00:00.000Z').toLocaleDateString() : 'Not set'}`,
            `**Assignee:** ${job.assigneeId ? `<@${job.assigneeId}>` : 'Not assigned'}`,
            `**Notes:** ${job.notes || 'None'}`
          ].join('\n');

          return await interaction.editReply({
            content: `📝 **Current Job Details: ${job.id}**\n\n${currentDetails}\n\n💡 *To edit, use the same command with parameters like:*\n\`/job edit client:${clientCode} job:${job.id} title:New Title\``
          });
        }

        // Update job in sheets
        console.log('📝 Updating job in Google Sheets:', job.title);
        const updatedJob = await updateJob(job.id, updates);

        // Refresh client card, job thread, and boards
        try {
          await ensureClientCard(interaction.client, interaction.guildId, client);
          if (client.channelId) {
            const channel = await interaction.client.channels.fetch(client.channelId).catch(() => null);
            if (channel) {
              await ensureJobThread(interaction.client, client, channel, updatedJob);
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

        // Show success message with changes
        const changedFields = Object.keys(updates).map(key => {
          const oldValue = job[key] || 'empty';
          const newValue = updates[key];
          return `**${key}:** ${oldValue} → ${newValue}`;
        }).join('\n');

        await interaction.editReply({
          content: `✅ **Updated job ${updatedJob.title} (${updatedJob.id})**\n\n${changedFields}`
        });

      } catch (error) {
        console.error('❌ Job edit failed:', error);
        await interaction.editReply({ content: `❌ Failed to load job: ${error.message}` });
      }
      return;
    }

    if (sub === 'complete') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const clientCode = interaction.options.getString('client');
      const jobId = interaction.options.getString('id', true);
      console.log(`[job.complete] invoked for ${jobId} (client: ${clientCode})`);

      try {
        // Check for invalid autocomplete selections
        if (jobId === 'select-client-first' || jobId === 'no-jobs' || jobId === 'invalid-client') {
          return await interaction.editReply({ 
            content: '❌ Please select a valid client first, then choose a job from that client.' 
          });
        }
        
        // Validate the client exists
        const clients = await getClients();
        const client = clients.find(c => c.code === clientCode);
        if (!client) {
          return await interaction.editReply({ content: `❌ Client with code ${clientCode} not found.` });
        }

        // capture job before we mutate
        const jobsBefore = await getJobs();
        const job = jobsBefore.find(j => j.id === jobId);
        
        if (!job) {
          return await interaction.editReply({ content: '❌ Job not found.' });
        }
        
        // Validate that the job belongs to the selected client
        if (job.clientId !== client.id) {
          return await interaction.editReply({ 
            content: `❌ Job ${jobId} does not belong to client ${clientCode}. Please select the correct client.` 
          });
        }

        // Write status that matches the rest of the system
        const updatedJob = await updateJob(jobId, { status: 'completed' });

        // refresh boards & client card
        try {
          // Use the client we already have from validation
          await ensureClientCard(interaction.client, interaction.guildId, client);
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
        } catch (e) {
          console.error('Board refresh after complete failed:', e);
        }

        await interaction.editReply(`✅ Marked **${updatedJob.id}** completed. It's now hidden from boards/cards and won't count as open.`);
      } catch (err) {
        const msg = err?.message || String(err);
        await interaction.editReply(`❌ Couldn’t complete **${jobId}**: ${msg}`);
      }
      return;
    }
  }
};
