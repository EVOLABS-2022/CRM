// commands/job.js
const { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } = require('discord.js');
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
      console.log('Job details:', { clientCode, title });

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
        await interaction.editReply({ content: `✅ Created job ${title} (${jobId}) for ${client.name}` });
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

        // Create modal with current job values pre-filled
        const modal = new ModalBuilder()
          .setCustomId(`job_edit_${job.id}_${client.code}`)
          .setTitle(`Edit Job: ${job.id}`)

        // Create text input fields with current values
        const titleInput = new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Job Title')
          .setStyle(TextInputStyle.Short)
          .setValue(job.title || '')
          .setRequired(true)
          .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(job.description || '')
          .setRequired(false)
          .setMaxLength(1000);

        const statusInput = new TextInputBuilder()
          .setCustomId('status')
          .setLabel('Status (open, in-progress, pending, completed, closed)')
          .setStyle(TextInputStyle.Short)
          .setValue(job.status || 'open')
          .setRequired(false)
          .setMaxLength(20);

        const priorityInput = new TextInputBuilder()
          .setCustomId('priority')
          .setLabel('Priority (low, medium, high, urgent)')
          .setStyle(TextInputStyle.Short)
          .setValue(job.priority || '')
          .setRequired(false)
          .setMaxLength(20);

        const notesInput = new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Additional Notes')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(job.notes || '')
          .setRequired(false)
          .setMaxLength(500);

        // Add inputs to action rows (Discord requires this)
        const firstRow = new ActionRowBuilder().addComponents(titleInput);
        const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
        const thirdRow = new ActionRowBuilder().addComponents(statusInput);
        const fourthRow = new ActionRowBuilder().addComponents(priorityInput);
        const fifthRow = new ActionRowBuilder().addComponents(notesInput);

        modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

        // Show the modal instead of replying
        await interaction.showModal(modal);

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
  },

  // Handle modal submission for job editing
  async handleModal(interaction) {
    if (!interaction.customId.startsWith('job_edit_')) return false;
    
    // Parse job ID and client code from custom ID
    const [, , jobId, clientCode] = interaction.customId.split('_');
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      // Get form values
      const newTitle = interaction.fields.getTextInputValue('title');
      const newDescription = interaction.fields.getTextInputValue('description');
      const newStatus = interaction.fields.getTextInputValue('status');
      const newPriority = interaction.fields.getTextInputValue('priority');
      const newNotes = interaction.fields.getTextInputValue('notes');
      
      // Validate status if provided
      const validStatuses = ['open', 'in-progress', 'pending', 'completed', 'closed'];
      if (newStatus && !validStatuses.includes(newStatus.toLowerCase())) {
        return await interaction.editReply({
          content: `❌ Invalid status "${newStatus}". Valid options: ${validStatuses.join(', ')}`
        });
      }
      
      // Validate priority if provided
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (newPriority && !validPriorities.includes(newPriority.toLowerCase())) {
        return await interaction.editReply({
          content: `❌ Invalid priority "${newPriority}". Valid options: ${validPriorities.join(', ')}`
        });
      }
      
      // Get current job to compare changes
      const jobs = await getJobs();
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        return await interaction.editReply({ content: '❌ Job not found.' });
      }
      
      // Build updates object only for changed fields
      const updates = {};
      if (newTitle !== job.title) updates.title = newTitle;
      if (newDescription !== (job.description || '')) updates.description = newDescription;
      if (newStatus && newStatus.toLowerCase() !== (job.status || 'open')) updates.status = newStatus.toLowerCase();
      if (newPriority && newPriority.toLowerCase() !== (job.priority || '')) updates.priority = newPriority.toLowerCase();
      if (newNotes !== (job.notes || '')) updates.notes = newNotes;
      
      if (Object.keys(updates).length === 0) {
        return await interaction.editReply({ content: '✅ No changes made to the job.' });
      }
      
      // Update job in sheets
      console.log('📝 Updating job in Google Sheets:', job.title);
      const updatedJob = await updateJob(jobId, updates);
      
      // Refresh client card, job thread, and boards
      try {
        const clients = await getClients();
        const client = clients.find(c => c.code === clientCode);
        
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
      console.error('❌ Job modal update failed:', error);
      await interaction.editReply({ content: `❌ Failed to update job: ${error.message}` });
    }
    
    return true; // Indicate we handled this modal
  }
};
