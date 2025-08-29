const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getClients, updateClient } = require('../lib/sheetsDb');
const { refreshAllBoards } = require('../lib/board');
const { refreshAllAdminBoards } = require('../utils/adminBoard');
const { hasPermission, PERMISSIONS } = require('../config/roles');

// Generate 8-character auth code (mix of upper/lower letters and numbers)
function generateAuthCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, characters.length);
    result += characters[randomIndex];
  }
  
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('repair')
    .setDescription('System maintenance and repair tools')
    .addSubcommand(sub =>
      sub
        .setName('clients')
        .setDescription('Repair client data (missing IDs, auth codes, etc.)')
        .addBooleanOption(opt =>
          opt.setName('dry_run')
            .setDescription('Preview changes without applying them')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('all')
        .setDescription('Run full system repair (clients + refresh boards)')
        .addBooleanOption(opt =>
          opt.setName('dry_run')
            .setDescription('Preview changes without applying them')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    // Check permissions - only Office level can run repairs
    if (!hasPermission(interaction.member, PERMISSIONS.OFFICE)) {
      return interaction.reply({
        content: '❌ You need Office permissions to run system repairs.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    const isDryRun = interaction.options.getBoolean('dry_run') || false;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'clients' || sub === 'all') {
        const repairResult = await repairClientData(isDryRun);
        
        const embed = new EmbedBuilder()
          .setTitle(isDryRun ? '🔍 Client Repair Preview' : '🔧 Client Repair Complete')
          .setDescription(isDryRun ? 'Preview of changes that would be made:' : 'Client data has been repaired:')
          .addFields(
            { name: 'Missing IDs Fixed', value: `${repairResult.idsFixed}`, inline: true },
            { name: 'Missing Auth Codes Fixed', value: `${repairResult.authCodesFixed}`, inline: true },
            { name: 'Clients Processed', value: `${repairResult.totalProcessed}`, inline: true }
          )
          .setColor(isDryRun ? 0xf39c12 : 0x2ecc71);

        if (repairResult.errors.length > 0) {
          embed.addFields({
            name: 'Errors Encountered',
            value: repairResult.errors.slice(0, 5).join('\n') + 
                   (repairResult.errors.length > 5 ? `\n...and ${repairResult.errors.length - 5} more` : ''),
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });

        // If this was a real repair (not dry run) and we're doing full repair, refresh boards
        if (!isDryRun && sub === 'all') {
          try {
            await Promise.all([
              refreshAllBoards(interaction.client),
              refreshAllAdminBoards(interaction.client)
            ]);
            
            await interaction.followUp({
              content: '✅ System boards refreshed successfully.',
              flags: MessageFlags.Ephemeral
            });
          } catch (error) {
            console.error('Failed to refresh boards after repair:', error);
            await interaction.followUp({
              content: '⚠️ Client repair completed but board refresh failed. Run `/sync` manually.',
              flags: MessageFlags.Ephemeral
            });
          }
        }
      }

    } catch (error) {
      console.error('❌ System repair failed:', error);
      await interaction.editReply({
        content: `❌ System repair failed: ${error.message}`
      });
    }
  }
};

async function repairClientData(isDryRun = false) {
  const result = {
    idsFixed: 0,
    authCodesFixed: 0,
    totalProcessed: 0,
    errors: []
  };

  try {
    const clients = await getClients();
    result.totalProcessed = clients.length;

    // Track existing IDs and auth codes to prevent duplicates
    const existingIds = new Set(clients.filter(c => c.id).map(c => c.id));
    const existingAuthCodes = new Set(clients.filter(c => c.authCode).map(c => c.authCode));

    for (const client of clients) {
      const updates = {};
      let needsUpdate = false;

      // Check for missing ID
      if (!client.id || client.id.trim() === '') {
        let newId;
        do {
          newId = uuidv4();
        } while (existingIds.has(newId));
        
        updates.id = newId;
        existingIds.add(newId);
        result.idsFixed++;
        needsUpdate = true;
      }

      // Check for missing auth code
      if (!client.authCode || client.authCode.trim() === '') {
        let newAuthCode;
        do {
          newAuthCode = generateAuthCode();
        } while (existingAuthCodes.has(newAuthCode));
        
        updates.authCode = newAuthCode;
        existingAuthCodes.add(newAuthCode);
        result.authCodesFixed++;
        needsUpdate = true;
      }

      // Apply updates if needed and not in dry run mode
      if (needsUpdate && !isDryRun) {
        try {
          // Use the client's existing ID if it has one, otherwise use the row index
          const clientIdentifier = client.id || client.name || `Row ${clients.indexOf(client) + 1}`;
          await updateClient(clientIdentifier, updates);
          console.log(`✅ Repaired client: ${client.name} - ${Object.keys(updates).join(', ')}`);
        } catch (error) {
          const errorMsg = `Failed to update ${client.name}: ${error.message}`;
          result.errors.push(errorMsg);
          console.error('❌ Client repair error:', errorMsg);
        }
      } else if (needsUpdate && isDryRun) {
        console.log(`🔍 Would repair client: ${client.name} - ${Object.keys(updates).join(', ')}`);
      }
    }

  } catch (error) {
    result.errors.push(`System error: ${error.message}`);
    throw error;
  }

  return result;
}
