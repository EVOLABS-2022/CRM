// scripts/deploy-commands.js
// Deploys commands to a single guild (instant) and clears global commands to avoid "outdated" errors.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  try {
    const { BOT_TOKEN, DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
    const token = BOT_TOKEN || DISCORD_TOKEN;
    if (!token || !CLIENT_ID || !GUILD_ID) {
      throw new Error('Missing BOT_TOKEN/DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env');
    }

    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd?.data && typeof cmd.data.toJSON === 'function') {
        commands.push(cmd.data.toJSON());
      } else {
        console.warn(`Skipping ${file}: no valid .data`);
      }
    }

    const rest = new REST({ version: '10' }).setToken(token);

    // 1) Deploy to guild (instant updates)
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Deployed ${commands.length} guild commands to ${GUILD_ID}.`);

    // 2) Clear globals to prevent "This command is outdated" messages
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] }
    );
    console.log('🧹 Cleared all global commands.');

    console.log('🎉 Done.');
  } catch (err) {
    console.error('❌ Deploy failed:', err);
    process.exit(1);
  }
})();
