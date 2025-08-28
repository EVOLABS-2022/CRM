// lib/sheetsDb.js - Google Sheets as Primary Database
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let sheets;
async function getSheets() {
  if (sheets) return sheets;
  
  const keyFilePath = process.env.GSHEETS_KEY_FILE;
  
  let auth;
  if (keyFilePath && fs.existsSync(keyFilePath)) {
    // Use key file if available (local development)
    auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyFilePath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
  } else if (process.env.GOOGLE_PRIVATE_KEY_B64) {
    // Use base64 decoded key (production)
    const privateKeyPem = Buffer.from(
      process.env.GOOGLE_PRIVATE_KEY_B64,
      'base64'
    ).toString('utf8');
    
    if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Decoded GOOGLE_PRIVATE_KEY_B64 is not a PEM');
    }
    
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
  
  sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

const SPREADSHEET_ID = process.env.GSHEETS_SHEET_ID || process.env.GSHEETS_SPREADSHEET_ID;

// === CLIENT OPERATIONS ===
async function createClient(clientData) {
  const api = await getSheets();
  
  const row = [
    clientData.id,
    clientData.code,
    clientData.name,
    clientData.contactName || '',
    clientData.contactMethod || '',
    clientData.authCode || '',
    clientData.channelId || '',
    clientData.clientCardMessageId || '',
    clientData.description || '',
    clientData.notes || '',
    new Date().toISOString()
  ];
  
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clients!A:K',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Client saved to Google Sheets:', clientData.name);
  return clientData;
}

async function getClients() {
  const api = await getSheets();
  
  try {
    const response = await api.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clients!A:K'
    });
    
    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Skip header row or empty sheet
    
    return rows.slice(1).map(row => ({
      id: row[0] || '',
      code: row[1] || '',
      name: row[2] || '',
      contactName: row[3] || '',
      contactMethod: row[4] || '',
      authCode: row[5] || '',
      channelId: row[6] || '',
      clientCardMessageId: row[7] || '',
      description: row[8] || '',
      notes: row[9] || '',
      createdAt: row[10] || ''
    })).filter(client => client.id); // Filter out empty rows
  } catch (error) {
    console.log('📋 Clients sheet not found or empty, returning empty array');
    return [];
  }
}

async function updateClientChannel(clientId, channelId, messageId) {
  const clients = await getClients();
  const clientIndex = clients.findIndex(c => c.id === clientId);
  
  if (clientIndex === -1) return false;
  
  const api = await getSheets();
  const rowNumber = clientIndex + 2; // +1 for 0-based index, +1 for header row
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Clients!G${rowNumber}:H${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[channelId, messageId]]
    }
  });
  
  return true;
}

async function updateClient(clientId, updates) {
  const clients = await getClients();
  const clientIndex = clients.findIndex(c => c.id === clientId);
  
  if (clientIndex === -1) return false;
  
  const client = clients[clientIndex];
  const api = await getSheets();
  const rowNumber = clientIndex + 2; // +1 for 0-based index, +1 for header row
  
  // Update the client object with new values
  const updatedClient = {
    ...client,
    ...updates
  };
  
  const row = [
    updatedClient.id,
    updatedClient.code,
    updatedClient.name,
    updatedClient.contactName || '',
    updatedClient.contactMethod || '',
    updatedClient.authCode || '',
    updatedClient.channelId || '',
    updatedClient.clientCardMessageId || '',
    updatedClient.description || '',
    updatedClient.notes || '',
    updatedClient.createdAt || new Date().toISOString()
  ];
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Clients!A${rowNumber}:K${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Client updated in Google Sheets:', updatedClient.name);
  return updatedClient;
}

// === JOB OPERATIONS ===
async function createJob(jobData) {
  const api = await getSheets();
  
  const row = [
    jobData.id,
    jobData.clientCode,
    jobData.clientId,
    jobData.title,
    jobData.status || 'open',
    jobData.threadId || '',
    jobData.threadCardMessageId || '',
    jobData.description || '',
    jobData.priority || '',
    jobData.assigneeId || '',
    jobData.deadline || '',
    jobData.budget || '',
    jobData.notes || '',
    new Date().toISOString()
  ];
  
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Jobs!A:N',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Job saved to Google Sheets:', jobData.title);
  return jobData;
}

async function getJobs() {
  const api = await getSheets();
  
  try {
    const response = await api.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Jobs!A:N'
    });
    
    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Skip header row or empty sheet
    
    return rows.slice(1).map(row => ({
      id: row[0] || '',
      clientCode: row[1] || '',
      clientId: row[2] || '',
      title: row[3] || '',
      status: row[4] || 'open',
      threadId: row[5] || '',
      threadCardMessageId: row[6] || '',
      description: row[7] || '',
      priority: row[8] || '',
      assigneeId: row[9] || '',
      deadline: row[10] || '',
      budget: parseFloat(row[11]) || 0,
      notes: row[12] || '',
      createdAt: row[13] || ''
    })).filter(job => job.id); // Filter out empty rows
  } catch (error) {
    console.log('📋 Jobs sheet not found or empty, returning empty array');
    return [];
  }
}

async function updateJobThread(jobId, threadId, messageId) {
  const jobs = await getJobs();
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  
  if (jobIndex === -1) return false;
  
  const api = await getSheets();
  const rowNumber = jobIndex + 2; // +1 for 0-based index, +1 for header row
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Jobs!F${rowNumber}:G${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[threadId, messageId]]
    }
  });
  
  return true;
}

async function updateJob(jobId, updates) {
  const jobs = await getJobs();
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  
  if (jobIndex === -1) return false;
  
  const job = jobs[jobIndex];
  const api = await getSheets();
  const rowNumber = jobIndex + 2; // +1 for 0-based index, +1 for header row
  
  // Update the job object with new values
  const updatedJob = {
    ...job,
    ...updates
  };
  
  const row = [
    updatedJob.id,
    updatedJob.clientCode,
    updatedJob.clientId,
    updatedJob.title,
    updatedJob.status || 'open',
    updatedJob.threadId || '',
    updatedJob.threadCardMessageId || '',
    updatedJob.description || '',
    updatedJob.priority || '',
    updatedJob.assigneeId || '',
    updatedJob.deadline || '',
    updatedJob.budget || '',
    updatedJob.notes || '',
    updatedJob.createdAt || new Date().toISOString()
  ];
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Jobs!A${rowNumber}:N${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Job updated in Google Sheets:', updatedJob.title);
  
  // Clean up tasks if job was closed/completed
  if (updatedJob.status === 'completed' || updatedJob.status === 'closed') {
    try {
      await cleanupTasksForClosedJobs();
    } catch (error) {
      console.error('⚠️ Failed to cleanup tasks for closed jobs:', error);
    }
  }
  
  return updatedJob;
}

// === INVOICE OPERATIONS ===
async function createInvoice(invoiceData) {
  const api = await getSheets();
  
  // Build the row with basic invoice data
  const row = [
    invoiceData.id,
    invoiceData.clientCode,
    invoiceData.clientId,
    invoiceData.jobId,
    invoiceData.status || 'draft',
    invoiceData.dueAt || '',
    invoiceData.total || 0,
    invoiceData.notes || '',
    invoiceData.terms || '',
    new Date().toISOString()
  ];
  
  // Add line items (up to 10)
  const lineItems = invoiceData.lineItems || [];
  for (let i = 0; i < 10; i++) {
    if (i < lineItems.length) {
      row.push(lineItems[i].description || '');
      row.push(lineItems[i].price || 0);
    } else {
      row.push(''); // Empty description
      row.push(''); // Empty price
    }
  }
  
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Invoices!A:AD',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Invoice saved to Google Sheets:', invoiceData.id);
  return invoiceData;
}

async function getInvoices() {
  const api = await getSheets();
  
  try {
    const response = await api.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Invoices!A:AD'
    });
    
    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Skip header row or empty sheet
    
    return rows.slice(1).map(row => {
      // Parse line items
      const lineItems = [];
      for (let i = 0; i < 10; i++) {
        const descIndex = 10 + (i * 2);
        const priceIndex = 11 + (i * 2);
        const description = row[descIndex];
        const price = row[priceIndex];
        
        if (description && description.trim()) {
          lineItems.push({
            description: description.trim(),
            price: parseFloat(price) || 0
          });
        }
      }
      
      return {
        id: row[0] || '',
        clientCode: row[1] || '',
        clientId: row[2] || '',
        jobId: row[3] || '',
        status: row[4] || 'draft',
        dueAt: row[5] || '',
        total: parseFloat(row[6]) || 0,
        notes: row[7] || '',
        terms: row[8] || '',
        issuedAt: row[9] || '',
        lineItems: lineItems
      };
    }).filter(invoice => invoice.id); // Filter out empty rows
  } catch (error) {
    console.log('📋 Invoices sheet not found or empty, returning empty array');
    return [];
  }
}

async function updateInvoice(invoiceId, updates) {
  const invoices = await getInvoices();
  const invoiceIndex = invoices.findIndex(inv => inv.id === invoiceId);
  
  if (invoiceIndex === -1) return false;
  
  const invoice = invoices[invoiceIndex];
  const updatedInvoice = { ...invoice, ...updates };
  
  // Recalculate total if line items changed
  if (updates.lineItems) {
    updatedInvoice.total = updates.lineItems.reduce((sum, item) => sum + item.price, 0);
  }
  
  const api = await getSheets();
  const rowNumber = invoiceIndex + 2; // +2 for header and 0-based index
  
  // Build the row with basic invoice data
  const row = [
    updatedInvoice.id,
    updatedInvoice.clientCode,
    updatedInvoice.clientId,
    updatedInvoice.jobId,
    updatedInvoice.status || 'draft',
    updatedInvoice.dueAt || '',
    updatedInvoice.total || 0,
    updatedInvoice.notes || '',
    updatedInvoice.terms || '',
    updatedInvoice.issuedAt || ''
  ];
  
  // Add line items (up to 10)
  const lineItems = updatedInvoice.lineItems || [];
  for (let i = 0; i < 10; i++) {
    if (i < lineItems.length) {
      row.push(lineItems[i].description || '');
      row.push(lineItems[i].price || 0);
    } else {
      row.push(''); // Empty description
      row.push(''); // Empty price
    }
  }
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Invoices!A${rowNumber}:AD${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Invoice updated in Google Sheets:', updatedInvoice.id);
  return updatedInvoice;
}

// === TASK OPERATIONS ===
async function createTask(taskData) {
  const api = await getSheets();
  
  const row = [
    taskData.id,
    taskData.jobId,
    taskData.title,
    taskData.description || '',
    taskData.status || 'open',
    taskData.assigneeId || '',
    taskData.deadline || '',
    taskData.priority || '',
    new Date().toISOString(),
    taskData.completedAt || ''
  ];
  
  await api.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Tasks!A:J',
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Task saved to Google Sheets:', taskData.title);
  return taskData;
}

async function getTasks() {
  const api = await getSheets();
  
  try {
    const response = await api.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Tasks!A:J'
    });
    
    const rows = response.data.values || [];
    if (rows.length <= 1) return []; // Skip header row or empty sheet
    
    return rows.slice(1).map(row => ({
      id: row[0] || '',
      jobId: row[1] || '',
      title: row[2] || '',
      description: row[3] || '',
      status: row[4] || 'open',
      assigneeId: row[5] || '',
      deadline: row[6] || '',
      priority: row[7] || '',
      createdAt: row[8] || '',
      completedAt: row[9] || ''
    })).filter(task => task.id); // Filter out empty rows
  } catch (error) {
    console.log('📋 Tasks sheet not found or empty, returning empty array');
    return [];
  }
}

async function updateTask(taskId, updates) {
  const tasks = await getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) return false;
  
  const task = tasks[taskIndex];
  const api = await getSheets();
  const rowNumber = taskIndex + 2; // +1 for 0-based index, +1 for header row
  
  // Update the task object with new values
  const updatedTask = {
    ...task,
    ...updates
  };
  
  // If marking as completed, set completedAt
  if (updates.status === 'completed' && !updatedTask.completedAt) {
    updatedTask.completedAt = new Date().toISOString();
  }
  
  const row = [
    updatedTask.id,
    updatedTask.jobId,
    updatedTask.title,
    updatedTask.description || '',
    updatedTask.status || 'open',
    updatedTask.assigneeId || '',
    updatedTask.deadline || '',
    updatedTask.priority || '',
    updatedTask.createdAt || new Date().toISOString(),
    updatedTask.completedAt || ''
  ];
  
  await api.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Tasks!A${rowNumber}:J${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row]
    }
  });
  
  console.log('✅ Task updated in Google Sheets:', updatedTask.title);
  return updatedTask;
}

async function cleanupTasksForClosedJobs() {
  const tasks = await getTasks();
  const jobs = await getJobs();
  
  // Find tasks that belong to closed/completed jobs
  const closedJobIds = jobs
    .filter(job => job.status === 'completed' || job.status === 'closed')
    .map(job => job.id);
  
  const tasksToDelete = tasks.filter(task => closedJobIds.includes(task.jobId));
  
  if (tasksToDelete.length === 0) {
    return { deleted: 0 };
  }
  
  // Delete tasks by updating the sheet (remove rows)
  const api = await getSheets();
  const allTasks = await getTasks();
  
  // Filter out tasks that should be deleted
  const remainingTasks = allTasks.filter(task => !closedJobIds.includes(task.jobId));
  
  // Clear the Tasks sheet and rewrite with remaining tasks
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Tasks!A2:J'
  });
  
  // Re-write remaining tasks if any
  if (remainingTasks.length > 0) {
    const rows = remainingTasks.map(task => [
      task.id,
      task.jobId, 
      task.title,
      task.description || '',
      task.status || 'open',
      task.assigneeId || '',
      task.deadline || '',
      task.priority || '',
      task.createdAt || '',
      task.completedAt || ''
    ]);
    
    await api.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Tasks!A:J',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows
      }
    });
  }
  
  console.log(`🧹 Cleaned up ${tasksToDelete.length} tasks from closed jobs`);
  return { deleted: tasksToDelete.length };
}

// === UTILITY FUNCTIONS ===
async function initializeSheets() {
  const api = await getSheets();
  
  // Create headers if sheets don't exist
  const clientHeaders = [['ID', 'Code', 'Name', 'Contact Name', 'Contact Method', 'Auth Code', 'Channel ID', 'Card Message ID', 'Description', 'Notes', 'Created At']];
  const jobHeaders = [['ID', 'Client Code', 'Client ID', 'Title', 'Status', 'Thread ID', 'Thread Message ID', 'Description', 'Priority', 'Assignee ID', 'Deadline', 'Budget', 'Notes', 'Created At']];
  const invoiceHeaders = [['ID', 'Client Code', 'Client ID', 'Job ID', 'Status', 'Due Date', 'Total', 'Notes', 'Terms', 'Issued At', 
    'Line1_Description', 'Line1_Price', 'Line2_Description', 'Line2_Price', 'Line3_Description', 'Line3_Price', 
    'Line4_Description', 'Line4_Price', 'Line5_Description', 'Line5_Price', 'Line6_Description', 'Line6_Price',
    'Line7_Description', 'Line7_Price', 'Line8_Description', 'Line8_Price', 'Line9_Description', 'Line9_Price', 
    'Line10_Description', 'Line10_Price']];
  const taskHeaders = [['ID', 'Job ID', 'Title', 'Description', 'Status', 'Assignee ID', 'Deadline', 'Priority', 'Created At', 'Completed At']];
  
  try {
    // Try to set headers for each sheet
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clients!A1:K1',
      valueInputOption: 'RAW',
      requestBody: { values: clientHeaders }
    });
    
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Jobs!A1:N1',
      valueInputOption: 'RAW',
      requestBody: { values: jobHeaders }
    });
    
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Invoices!A1:AD1',
      valueInputOption: 'RAW',
      requestBody: { values: invoiceHeaders }
    });
    
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Tasks!A1:J1',
      valueInputOption: 'RAW',
      requestBody: { values: taskHeaders }
    });
    
    console.log('✅ Google Sheets initialized with headers');
  } catch (error) {
    console.log('📋 Sheets initialization:', error.message);
  }
}

async function clearAllData() {
  const api = await getSheets();
  
  // Clear all data except headers
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clients!A2:H'
  });
  
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Jobs!A2:H'
  });
  
  await api.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Invoices!A2:AD'
  });
  
  console.log('✅ All data cleared from Google Sheets');
}

module.exports = {
  // Client operations
  createClient,
  getClients,
  updateClientChannel,
  updateClient,
  
  // Job operations
  createJob,
  getJobs,
  updateJobThread,
  updateJob,
  
  // Invoice operations
  createInvoice,
  getInvoices,
  updateInvoice,
  
  // Task operations
  createTask,
  getTasks,
  updateTask,
  cleanupTasksForClosedJobs,
  
  // Utility
  initializeSheets,
  clearAllData
};
