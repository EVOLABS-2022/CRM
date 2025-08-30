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

async function buildAdminBoard(guildId, inquiryThreadId = null, invoiceThreadId = null) {
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
  
  // Find channel IDs for links
  const clientBoardChannelId = '👥-client-board'; // Will be resolved by Discord
  const jobBoardChannelId = '🛠️-job-board';
  const taskBoardChannelId = 'task-board';
  
  sections.push(`• **${activeClients.length}** active [clients](https://discord.com/channels/${guildId}/${clientBoardChannelId})`);
  
  if (inquiryThreadId) {
    sections.push(`• **${leads.length}** new [inquiries](https://discord.com/channels/${guildId}/${inquiryThreadId})`);
  } else {
    sections.push(`• **${leads.length}** new inquiries`);
  }
  
  sections.push(`• **${openJobs.length}** open [jobs](https://discord.com/channels/${guildId}/${jobBoardChannelId})`);
  sections.push(`• **${activeTasks.length}** active [tasks](https://discord.com/channels/${guildId}/${taskBoardChannelId})`);
  
  if (invoiceThreadId) {
    sections.push(`• **${pendingInvoices.length}** pending [invoices](https://discord.com/channels/${guildId}/${invoiceThreadId})`);
  } else {
    sections.push(`• **${pendingInvoices.length}** pending invoices`);
  }
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

async function ensureAdminThreads(client, adminChannel) {
  const threads = await adminChannel.threads.fetchActive();
  
  let inquiryThread = threads.threads.find(t => t.name.includes('New Inquiries'));
  let invoiceThread = threads.threads.find(t => t.name.includes('Invoices'));
  
  // Create inquiry thread if it doesn't exist
  if (!inquiryThread) {
    inquiryThread = await adminChannel.threads.create({
      name: '🆕 New Inquiries',
      autoArchiveDuration: 1440, // 24 hours
      reason: 'Admin board inquiry thread'
    });
    console.log('✅ Created inquiry thread in admin channel');
  }
  
  // Create invoice thread if it doesn't exist
  if (!invoiceThread) {
    invoiceThread = await adminChannel.threads.create({
      name: '🧾 Invoices',
      autoArchiveDuration: 1440, // 24 hours
      reason: 'Admin board invoice thread'
    });
    console.log('✅ Created invoice thread in admin channel');
  }
  
  return { inquiryThread, invoiceThread };
}

async function refreshInquiryThread(client, threadId, leads) {
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread) return;
    
    // Use the same embed from leadBoard but post it in the thread
    const { refreshLeadsBoard } = require('./leadBoard');
    
    const embed = new EmbedBuilder()
      .setTitle('🆕 New Inquiries')
      .setColor('#f39c12')
      .setDescription('New inquiries from website and Telegram that need to be converted to active clients\n\n═══════════════════════════════════');

    const leadList = Array.isArray(leads) ? leads : [];

    if (leadList.length === 0) {
      embed.addFields({
        name: 'No inquiries found',
        value: 'All inquiries have been converted to active clients! 🎉',
        inline: false
      });
    } else {
      for (const lead of leadList) {
        const infoLines = [];
        
        if (lead.contactName || lead.contactMethod) {
          const contactParts = [lead.contactName, lead.contactMethod].filter(Boolean);
          infoLines.push(`**Contact:** ${contactParts.join(' | ') || 'N/A'}`);
        }
        
        if (lead.description && lead.description.trim()) {
          infoLines.push(`**Description:** ${lead.description.trim()}`);
        }
        
        if (lead.notes && lead.notes.trim()) {
          infoLines.push(`**Notes:** ${lead.notes.trim()}`);
        }
        
        const systemInfo = [];
        if (lead.id) systemInfo.push(`ID: ${lead.id}`);
        if (lead.authCode) systemInfo.push(`Auth: ${lead.authCode}`);
        if (lead.createdAt) {
          const date = new Date(lead.createdAt);
          systemInfo.push(`Created: ${date.toLocaleDateString()}`);
        }
        
        if (systemInfo.length > 0) {
          infoLines.push(`**System:** ${systemInfo.join(' | ')}`);
        }
        
        infoLines.push(`**Status:** 🔄 **Ready for Conversion**`);
        
        const fieldValue = infoLines.length > 0 ? infoLines.join('\n') : 'No additional information available';

        embed.addFields({
          name: `${lead.code || 'NO-CODE'} — ${lead.name || 'Unnamed Lead'}`,
          value: fieldValue.length > 1024 ? fieldValue.substring(0, 1021) + '...' : fieldValue,
          inline: false,
        });
      }

      embed.addFields({
        name: '═══════════════════════════════════',
        value: '\u200b',
        inline: false
      });

      embed.addFields({
        name: '💡 How to Convert Inquiries',
        value: 'Use `/client convert <inquiry>` to convert an inquiry to an active client. This will create their Discord channel and make them appear on the main client board.',
        inline: false
      });
    }

    embed.setFooter({ 
      text: `${leadList.length} inquiries • Updated ${new Date().toLocaleString()}` 
    });

    // Update the first message in the thread or send new one
    const messages = await thread.messages.fetch({ limit: 1 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await thread.send({ embeds: [embed] });
    }
    
    console.log(`✅ Inquiry thread updated with ${leadList.length} inquiries`);
  } catch (error) {
    console.error('Failed to refresh inquiry thread:', error);
  }
}

async function refreshInvoiceThread(client, threadId, invoices, clients, jobs) {
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread) return;
    
    const embed = new EmbedBuilder()
      .setTitle('🧾 Invoices')
      .setColor('#ffcc00')
      .setDescription('List of all invoices with status and due dates\n\n═══════════════════════════════════');

    const invList = Array.isArray(invoices) ? invoices : [];

    if (invList.length === 0) {
      embed.addFields({
        name: 'No invoices found',
        value: 'No invoices in the system yet.',
        inline: false
      });
    } else {
      for (const inv of invList) {
        const client = clients.find(c => c.code === inv.clientCode);
        const job = jobs.find(j => j.jobCode === inv.jobCode);

        const due = inv.dueDate ? new Date(inv.dueDate + 'T12:00:00.000Z').toLocaleDateString() : null;
        const status = inv.status || 'Unknown';

        embed.addFields({
          name: `#${inv.invoiceNumber || '????'} — ${inv.title || 'Untitled'}`,
          value: `Client: ${client ? `${client.code} — ${client.name}` : 'Unknown'}\nJob: ${job ? job.title : 'Unknown'}\nStatus: ${status}${due ? ` (due ${due})` : ''}`,
          inline: false,
        });
      }
    }

    embed.setFooter({ 
      text: `${invList.length} invoices • Updated ${new Date().toLocaleString()}` 
    });

    // Update the first message in the thread or send new one
    const messages = await thread.messages.fetch({ limit: 1 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [embed] });
    } else {
      await thread.send({ embeds: [embed] });
    }
    
    console.log(`✅ Invoice thread updated with ${invList.length} invoices`);
  } catch (error) {
    console.error('Failed to refresh invoice thread:', error);
  }
}

async function refreshAdminBoard(client, guildId, channelId, messageId = null) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return null;
    
    // Ensure threads exist and get their IDs
    const { inquiryThread, invoiceThread } = await ensureAdminThreads(client, channel);
    
    // Refresh thread contents
    const leads = getLeadsFromClients(await getClients());
    const invoices = await getInvoices();
    const clients = await getClients();
    const jobs = await getJobs();
    
    await Promise.all([
      refreshInquiryThread(client, inquiryThread.id, leads),
      refreshInvoiceThread(client, invoiceThread.id, invoices, clients, jobs)
    ]);
    
    const embed = await buildAdminBoard(guildId, inquiryThread.id, invoiceThread.id);
    
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
