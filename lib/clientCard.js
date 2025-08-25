// lib/clientCard.js
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getClients, getJobs, updateClientChannel } = require('./sheetsDb');
const { ensureJobThread } = require('./jobThreads');

const CRM_CATEGORY_NAME = '🗂️ | CRM';
const CLIENT_ICON = '🪪';

function slugifyChannelName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function channelNameForClient(client) {
  const code = (client.code || client.id || 'code').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
  const nm = slugifyChannelName(client.name || 'client');
  return `${CLIENT_ICON}-${code}-${nm}`; // 🪪-acm1-acme-co
}

function prettyDate(d) {
  if (!d) return null;
  // Handle YYYY-MM-DD strings as UTC dates to avoid timezone shifts
  const dt = (d instanceof Date) ? d : new Date(d + 'T12:00:00.000Z');
  if (isNaN(dt)) return null;
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()];
  return `${mon} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}

async function ensureCrmCategory(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  // exact
  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CRM_CATEGORY_NAME);
  // migrate legacy
  if (!cat) {
    const legacy = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🗂️|CRM');
    if (legacy) {
      try { await legacy.setName(CRM_CATEGORY_NAME, 'Normalize CRM category'); } catch {}
      cat = legacy;
    }
  }
  // create if needed
  if (!cat) {
    cat = await guild.channels.create({
      name: CRM_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: 'Create CRM category'
    });
  }
  return cat;
}

async function ensureClientChannel(client, guildId, clientRec) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const category = await ensureCrmCategory(client, guildId);
  if (!category) return null;

  const desired = channelNameForClient(clientRec);
  console.log(`🔍 Looking for channel: ${desired} for client: ${clientRec.name} (ID: ${clientRec.id})`);

  let channel = null;
  
  // First try: Look up by stored channelId
  if (clientRec.channelId) {
    channel = guild.channels.cache.get(clientRec.channelId) || null;
    if (channel) {
      console.log(`✅ Found channel by ID: ${channel.name}`);
    } else {
      console.log(`❌ Channel ID ${clientRec.channelId} not found in cache`);
    }
  }

  // Second try: Look by name in category (try both new and old patterns)
  if (!channel) {
    // Try new clean format
    channel = guild.channels.cache.find(
      c => c.parentId === category.id && c.name === desired && c.type === ChannelType.GuildText
    ) || null;
    
    // Try old format with potential spaces/special chars in code
    if (!channel) {
      const oldCode = clientRec.code.toLowerCase(); // Don't clean the code
      const oldDesired = `${CLIENT_ICON}-${oldCode}-${slugifyChannelName(clientRec.name || 'client')}`;
      channel = guild.channels.cache.find(
        c => c.parentId === category.id && c.name === oldDesired && c.type === ChannelType.GuildText
      ) || null;
      if (channel) {
        console.log(`✅ Found channel by old name pattern in category: ${channel.name}`);
      }
    }
    
    if (channel) {
      console.log(`✅ Found channel by name in category: ${channel.name}`);
      // Update the stored channelId since we found it by name
      clientRec.channelId = channel.id;
    }
  }

  // Third try: Look by name anywhere (in case it's in wrong category)
  if (!channel) {
    // Try new clean format
    channel = guild.channels.cache.find(
      c => c.name === desired && c.type === ChannelType.GuildText
    ) || null;
    
    // Try old format
    if (!channel) {
      const oldCode = clientRec.code.toLowerCase();
      const oldDesired = `${CLIENT_ICON}-${oldCode}-${slugifyChannelName(clientRec.name || 'client')}`;
      channel = guild.channels.cache.find(
        c => c.name === oldDesired && c.type === ChannelType.GuildText
      ) || null;
      if (channel) {
        console.log(`✅ Found channel by old name pattern globally: ${channel.name}`);
      }
    }
    
    if (channel) {
      console.log(`✅ Found channel by name globally: ${channel.name}, moving to correct category`);
      clientRec.channelId = channel.id;
    }
  }

  // If still no channel, create it
  if (!channel) {
    console.log(`🏗️ Creating new channel: ${desired}`);
    channel = await guild.channels.create({
      name: desired,
      type: ChannelType.GuildText,
      parent: category.id,
      reason: `Client channel for ${clientRec.name}`
    });
    
    // Sync permissions with parent category
    await channel.lockPermissions();
    clientRec.channelId = channel.id;
    console.log(`✅ Created new channel: ${channel.name} (${channel.id})`);
  } else {
    // move + rename if needed
    if (channel.parentId !== category.id) {
      await channel.setParent(category.id, { lockPermissions: false }).catch(() => {});
    }
    if (channel.name !== desired) {
      await channel.setName(desired).catch(() => {});
    }
    if (!clientRec.channelId || clientRec.channelId !== channel.id) {
      clientRec.channelId = channel.id;
    }
  }

  // keep near bottom
  try { await channel.edit({ position: category.children.cache.size + 1 }); } catch {}

  // Save channel ID to Google Sheets if it was updated
  if (clientRec.channelId === channel.id) {
    try {
      await updateClientChannel(clientRec.id, channel.id, clientRec.clientCardMessageId || '');
      console.log(`💾 Saved channel ID ${channel.id} to Google Sheets for client ${clientRec.name}`);
    } catch (error) {
      console.error(`❌ Failed to save channel ID to Google Sheets:`, error);
    }
  }

  return channel;
}

function buildClientCardEmbed(clientRec, jobs, guildId) {
  const title = `**${clientRec.name} — ${clientRec.code || clientRec.id}**`;
  const descLine = clientRec.description ? clientRec.description : '_(no description)_';
  const contactBits = [clientRec.contactName, clientRec.contactMethod].filter(Boolean).join(' | ');
  const contactLine = `*${contactBits || '—'}*`;
  const authLine = clientRec.authCode ? `**Auth Code:** \`${clientRec.authCode}\`` : '';
  const notesLine = `**Notes:** *${(clientRec.notes || '').trim() || '—'}*`;

  const openJobs = (jobs || []).filter(j => j.clientId === clientRec.id && j.status !== 'completed');
  const jobLines = openJobs.map(j => {
    const due = j.deadline ? ` — *due ${prettyDate(j.deadline)}*` : '';
    const link = j.threadId
      ? `[${j.title}](https://discord.com/channels/${guildId}/${j.threadId})`
      : `**${j.title}**`;
    const desc = j.description ? `\n*${j.description}*` : '';
    return `${link}${due}${desc}`;
  });

  const descriptionParts = [
    title,
    descLine,
    // no blank line before contact per your spec
    contactLine ? `${contactLine}\n` : '\n'
  ];
  
  if (authLine) {
    descriptionParts.push(authLine);
  }
  
  descriptionParts.push(
    notesLine,
    '',
    '**Open Jobs**',
    jobLines.length ? jobLines.join('\n\n') : '_none_',
    '', // Line break after last job
    '', // Second line break
    '', // Triple line break before client ID
    `*Client ID: ${clientRec.id}*` // Client ID at bottom
  );

  return new EmbedBuilder()
    .setColor(0x1abc9c)
    .setDescription(descriptionParts.join('\n'));
}

async function ensureClientCard(client, guildId, clientRec) {
  const channel = await ensureClientChannel(client, guildId, clientRec);
  if (!channel) return null;

  // ensure each open job has a thread so links work
  const jobs = await getJobs();
  const myJobs = jobs.filter(j => j.clientId === clientRec.id && j.status !== 'completed');
  for (const j of myJobs) {
    if (!j.threadId) {
      try { await ensureJobThread(client, clientRec, channel, j); } catch {}
    }
  }

  const embed = buildClientCardEmbed(clientRec, jobs, guildId);

  if (clientRec.clientCardMessageId) {
    try {
      const msg = await channel.messages.fetch(clientRec.clientCardMessageId);
      await msg.edit({ embeds: [embed] });
      return msg;
    } catch {
      // fallthrough to send new
    }
  }

  const sent = await channel.send({ embeds: [embed] });
  clientRec.clientCardMessageId = sent.id;
  
  // Update client with channel and message IDs in Sheets
  if (clientRec.channelId && clientRec.clientCardMessageId) {
    await updateClientChannel(clientRec.id, clientRec.channelId, clientRec.clientCardMessageId);
  }
  
  return sent;
}

async function syncClientChannelName(client, guildId, clientRec) {
  return ensureClientChannel(client, guildId, clientRec);
}

async function syncAllClientChannelsAndCards(client, guildId) {
  const clients = await getClients();
  console.log(`📋 Syncing channels for ${clients.length} clients`);
  for (const c of clients) {
    try { 
      console.log(`🔄 Creating channel for client: ${c.name} (${c.code})`);
      await ensureClientCard(client, guildId, c); 
      console.log(`✅ Channel created/updated for: ${c.name}`);
    } catch (error) {
      console.error(`❌ Failed to create channel for ${c.name}:`, error.message);
    }
  }
  console.log('✅ All client channels synced');
}

module.exports = {
  ensureClientCard,
  syncClientChannelName,
  syncAllClientChannelsAndCards,
};
