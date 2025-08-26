const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getClients, getJobs } = require('../lib/sheetsDb');
const { getJobFolderId, getClientFolderId } = require('../lib/driveManager');
const { google } = require('googleapis');
const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Upload files to a client\'s job folder')
    .addStringOption(opt =>
      opt.setName('client').setDescription('Client').setRequired(true).setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('job').setDescription('Job').setRequired(true).setAutocomplete(true)
    )
    .addAttachmentOption(opt =>
      opt.setName('file').setDescription('File to upload').setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description').setDescription('Optional description of the file')
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'client') {
      try {
        const clients = await getClients();
        const choices = clients
          .filter(c => !c.archived && c.code)
          .map(c => ({
            name: `${c.code.trim()} - ${c.name}`,
            value: c.code.trim()
          }))
          .filter(choice => 
            !focused.value || 
            choice.name.toLowerCase().includes(focused.value.toLowerCase())
          )
          .slice(0, 25);
        
        await interaction.respond(choices);
      } catch (error) {
        console.error('Client autocomplete error:', error);
        await interaction.respond([]);
      }
    }
    
    if (focused.name === 'job') {
      try {
        const selectedClientCode = interaction.options.getString('client');
        if (!selectedClientCode) {
          return await interaction.respond([{
            name: 'Please select a client first',
            value: 'SELECT_CLIENT_FIRST'
          }]);
        }
        
        // Get jobs for the selected client
        const clients = await getClients();
        const jobs = await getJobs();
        
        const selectedClient = clients.find(c => c.code && c.code.trim() === selectedClientCode);
        if (!selectedClient) {
          return await interaction.respond([{
            name: 'Invalid client selected',
            value: 'INVALID_CLIENT'
          }]);
        }
        
        const clientJobs = jobs.filter(j => j.clientId === selectedClient.id);
        
        if (clientJobs.length === 0) {
          return await interaction.respond([{
            name: 'No jobs found for this client',
            value: 'NO_JOBS'
          }]);
        }
        
        const choices = clientJobs.map(j => ({
          name: `${j.id} - ${j.title}`,
          value: j.id
        }))
        .filter(choice => 
          !focused.value || 
          choice.name.toLowerCase().includes(focused.value.toLowerCase())
        )
        .slice(0, 25);
        
        await interaction.respond(choices);
      } catch (error) {
        console.error('Job autocomplete error:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    // Check if user has Office role for file upload access
    if (!interaction.member.roles.cache.has('1408987391162585138')) {
      return interaction.reply({ 
        content: '❌ You need the Office role to upload files.',
        ephemeral: true 
      });
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const clientCode = interaction.options.getString('client');
    const jobId = interaction.options.getString('job');
    const attachment = interaction.options.getAttachment('file');
    const description = interaction.options.getString('description') || '';
    
    try {
      // Validate inputs
      if (jobId === 'SELECT_CLIENT_FIRST' || jobId === 'NO_JOBS' || jobId === 'INVALID_CLIENT') {
        return await interaction.editReply({
          content: '❌ Please select a valid client and job.'
        });
      }
      
      // Get client and job data with security validation
      const clients = await getClients();
      const jobs = await getJobs();
      
      const client = clients.find(c => c.code && c.code.trim() === clientCode);
      const job = jobs.find(j => j.id === jobId);
      
      if (!client || !job) {
        return await interaction.editReply({
          content: '❌ Invalid client or job selected.'
        });
      }
      
      // SECURITY CHECK: Ensure the job belongs to the selected client
      if (job.clientId !== client.id) {
        console.warn(`🚨 Security violation attempt: Job ${jobId} does not belong to client ${clientCode}`);
        return await interaction.editReply({
          content: '❌ Security error: Job does not belong to the selected client.'
        });
      }
      
      // Check file size (Discord limit is 25MB for normal users, 100MB for Nitro)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (attachment.size > maxSize) {
        return await interaction.editReply({
          content: `❌ File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`
        });
      }
      
      // Get the job folder ID
      const jobFolderId = await getJobFolderId(client.code.trim(), job.id);
      if (!jobFolderId) {
        return await interaction.editReply({
          content: `❌ Could not find the job folder for ${job.id}. Please ensure the job folder exists.`
        });
      }
      
      console.log(`📤 Uploading file ${attachment.name} to job ${job.id} for client ${client.code.trim()}`);
      
      // Download file from Discord
      const fileStream = await downloadFileFromDiscord(attachment.url);
      
      // Upload to Google Drive
      const driveFileId = await uploadToGoogleDrive(
        fileStream,
        attachment.name,
        jobFolderId,
        attachment.contentType,
        description
      );
      
      if (driveFileId) {
        await interaction.editReply({
          content: `✅ File uploaded successfully!\n` +
            `📁 **Client**: ${client.name} (${client.code.trim()})\n` +
            `🎯 **Job**: ${job.title} (${job.id})\n` +
            `📄 **File**: ${attachment.name}\n` +
            `💾 **Size**: ${(attachment.size / 1024).toFixed(1)} KB\n` +
            `🗂️ **Drive ID**: ${driveFileId}` +
            (description ? `\n📝 **Description**: ${description}` : '')
        });
      } else {
        await interaction.editReply({
          content: '❌ Failed to upload file to Google Drive.'
        });
      }
      
    } catch (error) {
      console.error('❌ File upload failed:', error);
      await interaction.editReply({
        content: `❌ Upload failed: ${error.message}`
      });
    }
  }
};

/**
 * Download a file from Discord CDN
 * @param {string} url - Discord attachment URL
 * @returns {Promise<Stream>} File stream
 */
async function downloadFileFromDiscord(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const request = client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      
      resolve(response);
    });
    
    request.on('error', (error) => {
      reject(new Error(`Download failed: ${error.message}`));
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Upload a file stream to Google Drive
 * @param {Stream} fileStream - The file data stream
 * @param {string} fileName - Original filename
 * @param {string} folderId - Google Drive folder ID
 * @param {string} mimeType - File MIME type
 * @param {string} description - File description
 * @returns {string|null} File ID if successful, null if failed
 */
async function uploadToGoogleDrive(fileStream, fileName, folderId, mimeType, description) {
  try {
    // Get Google Drive API instance (reuse auth from sheets)
    const { google } = require('googleapis');
    const { getSheets } = require('../lib/sheets');
    
    // Create auth using same method as sheets
    const keyFilePath = process.env.GSHEETS_KEY_FILE;
    
    let auth;
    if (keyFilePath && require('fs').existsSync(keyFilePath)) {
      auth = new google.auth.GoogleAuth({
        keyFile: require('path').resolve(keyFilePath),
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
      });
    } else if (process.env.GOOGLE_PRIVATE_KEY_B64) {
      const privateKeyPem = Buffer.from(
        process.env.GOOGLE_PRIVATE_KEY_B64,
        'base64'
      ).toString('utf8');
      
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL || process.env.GSHEETS_SERVICE_EMAIL,
          private_key: privateKeyPem,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
      });
    } else {
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GSHEETS_SERVICE_EMAIL,
          private_key: process.env.GSHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
      });
    }
    
    const drive = google.drive({ version: 'v3', auth });
    
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
      description: description || `Uploaded via Discord by CRM bot`
    };
    
    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: fileStream,
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      supportsAllDrives: true,
      fields: 'id'
    });
    
    console.log(`✅ File uploaded to Google Drive: ${fileName} (ID: ${file.data.id})`);
    return file.data.id;
    
  } catch (error) {
    console.error('❌ Google Drive upload failed:', error);
    return null;
  }
}
