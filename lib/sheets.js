// lib/sheets.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { formatDate } = require('./date');

let sheets;
async function getSheets() {
  if (sheets) return sheets;
  
  const keyFilePath = process.env.GSHEETS_KEY_FILE;
  
  const auth =
    keyFilePath && fs.existsSync(keyFilePath)
      ? new google.auth.GoogleAuth({
          keyFile: path.resolve(keyFilePath),
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
      : new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GSHEETS_SERVICE_EMAIL,
            private_key: process.env.GSHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
  
  sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

const SHEET_ID = process.env.GSHEETS_SHEET_ID || process.env.GSHEETS_SPREADSHEET_ID;

async function exportSnapshot(clients, jobs) {
  const api = await getSheets();

  const clientRows = clients.map(c => [
    c.id,
    c.code,
    c.name,
    c.contact,
    c.email,
    c.phone,
    c.notes,
    c.channelId || '',
    formatDate(c.createdAt),
    c.archived ? 'Yes' : 'No',
  ]);

  const jobRows = jobs.map(j => [
    j.id,
    j.code,
    j.title,
    j.clientId,
    j.status,
    j.priority || '',
    j.assigneeId || '',
    formatDate(j.deadline),
    j.budget || '',
    (j.tags || []).join(','),
    j.description || '',
    j.threadId || '',
    formatDate(j.createdAt),
    formatDate(j.closedAt),
  ]);

  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Clients!A:Z',
    valueInputOption: 'RAW',
    requestBody: { values: [['id', 'code', 'name', 'contact', 'email', 'phone', 'notes', 'channelId', 'createdAt', 'archived'], ...clientRows] },
  });

  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Jobs!A:Z',
    valueInputOption: 'RAW',
    requestBody: { values: [['id','code','title','clientId','status','priority','assigneeId','deadline','budget','tags','description','threadId','createdAt','closedAt'], ...jobRows] },
  });
}

module.exports = { getSheets, exportSnapshot };