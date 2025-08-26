// lib/driveManager.js
const { google } = require('googleapis');
const { getSheets } = require('./sheets');

let drive;
async function getDrive() {
  if (drive) return drive;
  
  // Use the same auth setup as sheets
  const keyFilePath = process.env.GSHEETS_KEY_FILE;
  
  let auth;
  if (keyFilePath && require('fs').existsSync(keyFilePath)) {
    // Use key file if available (local development)
    auth = new google.auth.GoogleAuth({
      keyFile: require('path').resolve(keyFilePath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
  } else if (process.env.GOOGLE_PRIVATE_KEY_B64) {
    // Use base64 decoded key (production)
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
    // Fallback to legacy method
    auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GSHEETS_SERVICE_EMAIL,
        private_key: process.env.GSHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
  }
  
  drive = google.drive({ version: 'v3', auth });
  return drive;
}

// Main CRM folder ID where all client folders will be created
const CRM_FOLDER_ID = process.env.CRM_FOLDER_ID || '1B8fLatvCAeEnceD96qmsV6UDetVLnZ3h';

/**
 * Get all existing client folders in the CRM directory
 * @returns {Array} Array of {id, name} objects for folders that match client code pattern
 */
async function getExistingClientFolders() {
  try {
    const driveApi = await getDrive();
    
    const response = await driveApi.files.list({
      q: `'${CRM_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    // Filter folders that look like client codes (up to 4 characters, alphanumeric, allowing trailing spaces)
    const clientFolders = response.data.files.filter(folder => {
      const trimmedName = folder.name.trim();
      return /^[A-Z0-9]{1,4}$/.test(trimmedName) && folder.name.length <= 4;
    });
    
    console.log(`📁 Found ${clientFolders.length} existing client folders`);
    return clientFolders;
    
  } catch (error) {
    console.error('❌ Error getting existing client folders:', error);
    return [];
  }
}

/**
 * Create a new client folder in Google Drive
 * @param {string} clientCode - The 4-character client code
 * @param {string} clientName - The client name for logging
 * @returns {string|null} The folder ID if successful, null if failed
 */
async function createClientFolder(clientCode, clientName) {
  try {
    const driveApi = await getDrive();
    
    const folderMetadata = {
      name: clientCode,
      parents: [CRM_FOLDER_ID],
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    const folder = await driveApi.files.create({
      resource: folderMetadata,
      fields: 'id',
      supportsAllDrives: true
    });
    
    console.log(`📁 Created client folder ${clientCode} for ${clientName} (ID: ${folder.data.id})`);
    return folder.data.id;
    
  } catch (error) {
    console.error(`❌ Error creating client folder for ${clientCode}:`, error);
    return null;
  }
}

/**
 * Get or create a client folder
 * @param {string} clientCode - The 4-character client code  
 * @param {string} clientName - The client name for logging
 * @returns {string|null} The folder ID if successful, null if failed
 */
async function ensureClientFolder(clientCode, clientName) {
  try {
    // First check if folder already exists
    const existingFolders = await getExistingClientFolders();
    const existing = existingFolders.find(folder => folder.name === clientCode);
    
    if (existing) {
      console.log(`📁 Client folder ${clientCode} already exists (ID: ${existing.id})`);
      return existing.id;
    }
    
    // Create new folder
    return await createClientFolder(clientCode, clientName);
    
  } catch (error) {
    console.error(`❌ Error ensuring client folder for ${clientCode}:`, error);
    return null;
  }
}

/**
 * Check all clients have folders on startup and create missing ones
 * @param {Array} clients - Array of client objects from database
 */
async function syncClientFolders(clients) {
  console.log('🔄 Syncing client folders with Google Drive...');
  console.log(`📊 Found ${clients.length} total clients to check`);
  
  try {
    console.log(`📂 Checking parent folder: ${CRM_FOLDER_ID}`);
    const existingFolders = await getExistingClientFolders();
    const existingCodes = new Set(existingFolders.map(f => f.name.trim()));
    
    console.log(`📁 Found ${existingFolders.length} existing client folders: ${Array.from(existingCodes).join(', ')}`);
    
    const clientsWithCodes = clients.filter(c => c.code);
    console.log(`👥 Clients with codes: ${clientsWithCodes.length}`);
    
    let created = 0;
    let errors = 0;
    let skipped = 0;
    
    for (const client of clients) {
      if (!client.code) {
        console.warn(`⚠️ Client ${client.name} has no code, skipping folder creation`);
        continue;
      }
      
      if (!existingCodes.has(client.code.trim())) {
        console.log(`📁 Creating missing folder for client ${client.code} - ${client.name}`);
        const folderId = await createClientFolder(client.code, client.name);
        if (folderId) {
          created++;
        } else {
          errors++;
        }
        
        // Add small delay between folder creations to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        skipped++;
      }
    }
    
    console.log(`✅ Client folder sync complete. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    
  } catch (error) {
    console.error('❌ Error syncing client folders:', error);
    console.error('Error details:', error.message);
  }
}

/**
 * Get the folder ID for a specific client code
 * @param {string} clientCode - The 4-character client code
 * @returns {string|null} The folder ID if found, null otherwise
 */
async function getClientFolderId(clientCode) {
  try {
    const existingFolders = await getExistingClientFolders();
    console.log(`🔍 Looking for folder with code: "${clientCode}"`);
    console.log(`📁 Available folders: ${existingFolders.map(f => `"${f.name}"`).join(', ')}`);
    
    const folder = existingFolders.find(f => f.name.trim() === clientCode.trim());
    if (folder) {
      console.log(`✅ Found folder "${folder.name}" with ID: ${folder.id}`);
      return folder.id;
    } else {
      console.log(`❌ No folder found for client code: "${clientCode}"`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error getting folder ID for ${clientCode}:`, error);
    return null;
  }
}

/**
 * Get all existing job folders in a specific client folder
 * @param {string} clientFolderId - The client folder ID to search in
 * @returns {Array} Array of {id, name} objects for job folders
 */
async function getExistingJobFolders(clientFolderId) {
  try {
    const driveApi = await getDrive();
    
    const response = await driveApi.files.list({
      q: `'${clientFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    // Filter folders that look like job codes (format: XXXX-001, XXXX-002, etc)
    const jobFolders = response.data.files.filter(folder => {
      return /^[A-Z0-9]{3,4}-\d{3}$/.test(folder.name.trim());
    });
    
    console.log(`📁 Found ${jobFolders.length} existing job folders in client folder`);
    return jobFolders;
    
  } catch (error) {
    console.error('❌ Error getting existing job folders:', error);
    return [];
  }
}

/**
 * Create a new job folder in a client's Google Drive folder
 * @param {string} clientFolderId - The client folder ID
 * @param {string} jobCode - The job code (e.g., "NEO-001")
 * @param {string} jobTitle - The job title for logging
 * @returns {string|null} The folder ID if successful, null if failed
 */
async function createJobFolder(clientFolderId, jobCode, jobTitle) {
  try {
    const driveApi = await getDrive();
    
    const folderMetadata = {
      name: jobCode,
      parents: [clientFolderId],
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    const folder = await driveApi.files.create({
      resource: folderMetadata,
      fields: 'id',
      supportsAllDrives: true
    });
    
    console.log(`📁 Created job folder ${jobCode} for "${jobTitle}" (ID: ${folder.data.id})`);
    return folder.data.id;
    
  } catch (error) {
    console.error(`❌ Error creating job folder for ${jobCode}:`, error);
    return null;
  }
}

/**
 * Get or create a job folder
 * @param {string} clientFolderId - The client folder ID
 * @param {string} jobCode - The job code
 * @param {string} jobTitle - The job title for logging
 * @returns {string|null} The folder ID if successful, null if failed
 */
async function ensureJobFolder(clientFolderId, jobCode, jobTitle) {
  try {
    // First check if folder already exists
    const existingFolders = await getExistingJobFolders(clientFolderId);
    const existing = existingFolders.find(folder => folder.name.trim() === jobCode.trim());
    
    if (existing) {
      console.log(`📁 Job folder ${jobCode} already exists (ID: ${existing.id})`);
      return existing.id;
    }
    
    // Create new folder
    return await createJobFolder(clientFolderId, jobCode, jobTitle);
    
  } catch (error) {
    console.error(`❌ Error ensuring job folder for ${jobCode}:`, error);
    return null;
  }
}

/**
 * Sync all job folders for all clients
 * @param {Array} clients - Array of client objects
 * @param {Array} jobs - Array of job objects
 */
async function syncJobFolders(clients, jobs) {
  console.log('🔄 Syncing job folders with Google Drive...');
  console.log(`📊 Found ${jobs.length} total jobs to check`);
  
  try {
    let created = 0;
    let errors = 0;
    let skipped = 0;
    
    for (const job of jobs) {
      if (!job.code) {
        console.warn(`⚠️ Job ${job.title} has no code, skipping folder creation`);
        continue;
      }
      
      // Find the client for this job
      const client = clients.find(c => c.id === job.clientId);
      if (!client || !client.code) {
        console.warn(`⚠️ Job ${job.code} has no valid client, skipping folder creation`);
        continue;
      }
      
      // Get the client folder ID
      const clientFolderId = await getClientFolderId(client.code);
      if (!clientFolderId) {
        console.warn(`⚠️ Client folder not found for ${client.code}, skipping job folder creation`);
        continue;
      }
      
      // Check if job folder exists, create if not
      const existingJobFolders = await getExistingJobFolders(clientFolderId);
      const existingJobCodes = new Set(existingJobFolders.map(f => f.name.trim()));
      
      if (!existingJobCodes.has(job.code.trim())) {
        console.log(`📁 Creating missing job folder for ${job.code} - ${job.title}`);
        const folderId = await createJobFolder(clientFolderId, job.code, job.title);
        if (folderId) {
          created++;
        } else {
          errors++;
        }
        
        // Add small delay between folder creations to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        skipped++;
      }
    }
    
    console.log(`✅ Job folder sync complete. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    
  } catch (error) {
    console.error('❌ Error syncing job folders:', error);
    console.error('Error details:', error.message);
  }
}

/**
 * Get the folder ID for a specific job
 * @param {string} clientCode - The client code
 * @param {string} jobCode - The job code
 * @returns {string|null} The job folder ID if found, null otherwise
 */
async function getJobFolderId(clientCode, jobCode) {
  try {
    const clientFolderId = await getClientFolderId(clientCode);
    if (!clientFolderId) {
      console.warn(`⚠️ Client folder not found for ${clientCode}`);
      return null;
    }
    
    const existingJobFolders = await getExistingJobFolders(clientFolderId);
    console.log(`🔍 Looking for job folder with code: "${jobCode}"`);
    console.log(`📁 Available job folders: ${existingJobFolders.map(f => `"${f.name}"`).join(', ')}`);
    
    const folder = existingJobFolders.find(f => f.name.trim() === jobCode.trim());
    if (folder) {
      console.log(`✅ Found job folder "${folder.name}" with ID: ${folder.id}`);
      return folder.id;
    } else {
      console.log(`❌ No job folder found for job code: "${jobCode}"`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error getting job folder ID for ${jobCode}:`, error);
    return null;
  }
}

module.exports = {
  getExistingClientFolders,
  createClientFolder,
  ensureClientFolder,
  syncClientFolders,
  getClientFolderId,
  getExistingJobFolders,
  createJobFolder,
  ensureJobFolder,
  syncJobFolders,
  getJobFolderId,
  CRM_FOLDER_ID
};
