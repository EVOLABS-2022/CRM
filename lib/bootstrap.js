// lib/bootstrap.js
const { ChannelType } = require('discord.js');

const CRM_CATEGORY = '🗂️ | CRM';
const LEGACY_CATEGORY = '🗂️|CRM'; // will be renamed to CRM_CATEGORY

// Canonical channel names (no spaces)
const CLIENT_BOARD_CH = '👥-client-board';
const JOB_BOARD_CH    = '🛠️-job-board';

// Legacy names to migrate from (with/without spaces)
const LEGACY_CLIENT_NAMES = ['👥 | client-board', '👥|client-board'];
const LEGACY_JOB_NAMES    = ['🛠️ | job-board', '🛠️|job-board'];

async function ensureCrmCategory(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  let cat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === CRM_CATEGORY
  );

  if (!cat) {
    const legacy = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === LEGACY_CATEGORY
    );
    if (legacy) {
      try { await legacy.setName(CRM_CATEGORY, 'Normalize CRM category name'); } catch {}
      cat = legacy;
    }
  }

  if (!cat) {
    cat = await guild.channels.create({
      name: CRM_CATEGORY,
      type: ChannelType.GuildCategory,
      reason: 'Create CRM category',
    });
  }
  return cat;
}

async function findAnyByNames(guild, names) {
  return guild.channels.cache.find(c => names.includes(c.name)) || null;
}

async function ensureChannelUnder(client, guildId, canonicalName, type = ChannelType.GuildText) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const cat = await ensureCrmCategory(client, guildId);
  if (!cat) return null;

  // 1) Try exact canonical under category
  let ch = guild.channels.cache.find(
    c => c.type === type && c.name === canonicalName && c.parentId === cat.id
  ) || null;

  // 2) If not present, try exact canonical anywhere and move under category
  if (!ch) {
    const anywhere = guild.channels.cache.find(c => c.type === type && c.name === canonicalName) || null;
    if (anywhere) {
      ch = anywhere;
      if (ch.parentId !== cat.id) {
        await ch.setParent(cat.id, { lockPermissions: false }).catch(() => {});
      }
    }
  }

  // 3) If still missing, look for legacy names and rename+move
  if (!ch) {
    const legacyList = canonicalName === CLIENT_BOARD_CH ? LEGACY_CLIENT_NAMES : LEGACY_JOB_NAMES;
    const legacy = await findAnyByNames(guild, legacyList);
    if (legacy && legacy.type === type) {
      ch = legacy;
      if (ch.parentId !== cat.id) {
        await ch.setParent(cat.id, { lockPermissions: false }).catch(() => {});
      }
      if (ch.name !== canonicalName) {
        await ch.setName(canonicalName).catch(() => {});
      }
    }
  }

  // 4) Still nothing? Create canonical fresh under category
  if (!ch) {
    ch = await guild.channels.create({
      name: canonicalName,
      type,
      parent: cat.id,
      reason: `CRM auto-create: ${canonicalName}`,
    });
  }

  // Keep at bottom of category for stability (best-effort)
  try { await ch.edit({ position: cat.children.cache.size + 1 }); } catch {}

  return ch;
}

async function ensureCrmInfra(client, guildId) {
  await ensureCrmCategory(client, guildId);
  const clientBoard = await ensureChannelUnder(client, guildId, CLIENT_BOARD_CH);
  const jobBoard    = await ensureChannelUnder(client, guildId, JOB_BOARD_CH);
  return { clientBoard, jobBoard };
}

module.exports = {
  ensureCrmInfra,
  ensureCrmCategory,
  ensureChannelUnder,
  CRM_CATEGORY,
  CLIENT_BOARD_CH,
  JOB_BOARD_CH,
};