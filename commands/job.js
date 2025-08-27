const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const chrono = require('chrono-node');
const { getClients, getJobs, createJob, updateJobThread, updateJob } = require('../lib/sheetsDb');
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
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      
      // Handle client field autocomplete
      if (focused.name === 'client') {
      
      const clients = await getClients();

      // Debug logging
      console.log('Job autocomplete - Focused field:', focused.name, 'Value:', `"${focused.value}"`, 'Type:', typeof focused.value);
      console.log('Number of clients from Sheets:', clients.length);

      // If no clients exist, return empty array
      if (clients.length === 0) {
        console.log('No clients found in Sheets');
        return await interaction.respond([]);
      }

      // Filter clients that have codes
      const validClients = clients.filter(c => c.code);
      console.log('Valid clients with codes:', validClients.length);
      
      // If no valid clients, return empty
      if (validClients.length === 0) {
        console.log('No valid clients with codes found');
        return await interaction.respond([]);
      }
      
      // Always show all clients, just filter if text is typed
      const choices = validClients.map(c => ({
        name: `${c.code} - ${c.name}`,
        value: c.code
      }));

      // Filter only if user has typed something
      const filtered = (!focused.value || focused.value === '')
        ? choices
        : choices.filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase()));

      console.log('Returning choices:', filtered.length);
      await interaction.respond(filtered.slice(0, 25));
      }
      
      // Handle job field autocomplete
      if (focused.name === 'job') {
        const jobs = await getJobs();
        const choices = jobs
          .filter(j => j.status !== 'completed' && j.status !== 'closed')
          .map(j => ({
            name: `${j.id} - ${j.title}`,
            value: j.id
          }))
          .filter(choice => 
            !focused.value || 
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
          )
          .slice(0, 25);
        
        await interaction.respond(choices);
      }
    } catch (error) {
      console.error('Job autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      // Defer reply to prevent timeout during processing
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      console.log('🔧 Starting job creation...');
      const clientCode = interaction.options.getString('client');
      const title = interaction.options.getString('title');
      console.log('Job details:', { clientCode, title });

      try {
        // Get clients and jobs from Sheets
        const clients = await getClients();
        const existingJobs = await getJobs();

        const client = clients.find(c => c.code === clientCode);
        if (!client) {
          return await interaction.editReply({
            content: `❌ Client with code ${clientCode} not found.`
          });
        }

        // Sequential job number for this client
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

        // Create job folder in Google Drive
        try {
          console.log('📁 Creating Drive folder for job:', job.title);
          const clientFolderId = await getClientFolderId(client.code.trim());
          if (clientFolderId) {
            const jobFolderId = await ensureJobFolder(clientFolderId, job.id, job.title);
            if (jobFolderId) {
              console.log(`✅ Created/found job folder ${job.id} (ID: ${jobFolderId})`);
            } else {
              console.warn(`⚠️ Could not create/find job folder for ${job.id}`);
            }
          } else {
            console.warn(`⚠️ Client folder not found for ${client.code}, skipping job folder creation`);
          }
        } catch (error) {
          console.error('❌ Failed to create job folder:', error);
        }

        // Update client card to show new job
        try {
          await ensureClientCard(interaction.client, interaction.guildId, client);
          console.log('✅ Client card updated with new job');
        } catch (error) {
          console.error('Failed to update client card:', error);
        }

        // Update client card immediately, then full sync
        try {
          await ensureClientCard(interaction.client, interaction.guildId, client);
          console.log('✅ Client card updated with new job');
        } catch (error) {
          console.error('Failed to update client card:', error);
        }

        // Update relevant boards with fresh Sheets data
        try {
          console.log('🔄 Updating boards after job creation...');
          await Promise.all([
            refreshAllBoards(interaction.client),
            refreshAllAdminBoards(interaction.client)
          ]);
          console.log('✅ Boards updated successfully');
        } catch (error) {
          console.error('❌ Failed to update boards:', error);
          // Continue anyway - boards will be updated by scheduler
        }

        console.log('✅ Job creation complete, sending reply...');
        await interaction.editReply({
          content: `✅ Created job ${title} (${jobId}) for ${client.name}`
        });
        
      } catch (error) {
        console.error('❌ Job creation failed:', error);
        await interaction.editReply({
          content: `❌ Failed to create job: ${error.message}`
        });
      }
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
        // Check if job exists
        const jobs = await getJobs();
        const job = jobs.find(j => j.id === jobId);
        
        if (!job) {
          return await interaction.editReply({
            content: '❌ Job not found.'
          });
        }

        // Parse deadline if provided
        let parsedDeadline = null;
        if (newDeadline) {
          const parsed = chrono.parseDate(newDeadline);
          if (!parsed) {
            return await interaction.editReply({
              content: '❌ Could not understand the deadline format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
            });
          }
          // Format as YYYY-MM-DD for storage (using UTC date for global team consistency)
          parsedDeadline = parsed.toISOString().split('T')[0];
        }

        // Build updates object
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
          return await interaction.editReply({
            content: '❌ No changes provided. Please specify at least one field to update.'
          });
        }

        // Update job in Google Sheets
        console.log('📝 Updating job in Google Sheets:', job.title);
        const updatedJob = await updateJob(jobId, updates);

        // Refresh client card, job thread, and boards
        try {
          const clients = await getClients();
          const client = clients.find(c => c.id === job.clientId);
          if (client) {
            await ensureClientCard(interaction.client, interaction.guildId, client);
            
            // Update job thread card with latest job data
            if (client.channelId) {
              const channel = await interaction.client.channels.fetch(client.channelId).catch(() => null);
              if (channel) {
                await ensureJobThread(interaction.client, client, channel, updatedJob);
              }
            }
          }
          
          // Update relevant boards with fresh Sheets data
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
          let newValue = updates[key];
          let displayValue = newValue;
          
          // Show original natural language for deadline
          if (key === 'deadline' && newDeadline) {
            displayValue = `${newValue} UTC (from "${newDeadline}")`;
          }
          
          return `${key}: ${oldValue} → ${displayValue}`;
        }).join('\n');

        await interaction.editReply({
          content: `✅ Updated job ${updatedJob.title} (${updatedJob.id})\n\`\`\`\n${changedFields}\n\`\`\``
        });
        
      } catch (error) {
        console.error('❌ Job edit failed:', error);
        await interaction.editReply({
          content: `❌ Failed to edit job: ${error.message}`
        });
      }
    }
  }
};
