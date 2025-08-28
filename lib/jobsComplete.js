// lib/jobsComplete.js
const { google } = require('googleapis');

// Try to reuse config from sheetsDb if available
let sheetsDb = null;
try { sheetsDb = require('../lib/sheetsDb'); } catch { /* ignore */ }

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!email || !key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  key = key.replace(/\\n/g, '\n'); // fix escaped newlines on Render
  const auth = new google.auth.JWT(email, null, key, SCOPES);
  return google.sheets({ version: 'v4', auth });
}

function resolveSpreadsheetId() {
  // Prefer whatever sheetsDb already uses
  const fromModule =
    (sheetsDb && (
      sheetsDb.SPREADSHEET_ID ||
      sheetsDb.spreadsheetId ||
      (typeof sheetsDb.getSpreadsheetId === 'function' ? sheetsDb.getSpreadsheetId() : undefined)
    )) || null;

  const fromEnv =
    process.env.GOOGLE_SHEETS_ID ||
    process.env.GOOGLE_SHEET_ID ||
    process.env.SHEETS_SPREADSHEET_ID ||
    process.env.SHEETS_ID ||
    process.env.SPREADSHEET_ID ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.CRM_SHEETS_ID ||
    null;

  const id = fromModule || fromEnv;
  if (!id) {
    throw new Error('Missing spreadsheetId. Export SPREADSHEET_ID from lib/sheetsDb, or set GOOGLE_SHEETS_ID in env.');
  }
  console.log(`[jobsComplete] Using spreadsheetId from ${fromModule ? 'sheetsDb' : 'env'}`);
  return id;
}

/**
 * Set Status=Complete in Jobs (col E), and color the entire row light red.
 * @param {string} jobId e.g. "NEO-001"
 * @returns {{rowIndex:number}}
 */
async function setJobComplete(jobId) {
  const spreadsheetId = resolveSpreadsheetId();
  const sheets = getSheetsClient();

  // 1) Read headers+rows to find the row by ID
  const range = 'Jobs!A:E';
  const read = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = read.data.values || [];
  if (rows.length === 0) throw new Error('Jobs sheet appears empty');

  const header = rows[0];
  const idCol = header.indexOf('ID');         // expected col A
  const statusCol = header.indexOf('Status'); // expected col E
  if (idCol === -1 || statusCol === -1) {
    throw new Error('Jobs sheet must have headers "ID" and "Status"');
  }

  const dataRows = rows.slice(1);
  const idxInData = dataRows.findIndex(r => (r[idCol] || '').trim() === jobId.trim());
  if (idxInData === -1) throw new Error(`ID not found: ${jobId}`);

  const rowIndex = idxInData + 2; // 1-based row number (account for header)

  // 2) Write Status = Complete
  const statusA1 = `Jobs!${columnLetter(statusCol + 1)}${rowIndex}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: statusA1,
    valueInputOption: 'RAW',
    requestBody: { values: [['Complete']] },
  });

  // 3) Color entire row light red
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const jobsSheet = sheetMeta.data.sheets.find(s => s.properties.title === 'Jobs');
  if (!jobsSheet) throw new Error('Sheet "Jobs" not found');
  const sheetId = jobsSheet.properties.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowIndex - 1, // 0-based inclusive
              endRowIndex: rowIndex,       // exclusive
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: rgb('#F8D7DA'),
              },
            },
            fields: 'userEnteredFormat.backgroundColor',
          },
        },
      ],
    },
  });

  return { rowIndex };
}

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { red: 1, green: 1, blue: 1 };
  const num = parseInt(m[1], 16);
  return {
    red: ((num >> 16) & 255) / 255,
    green: ((num >> 8) & 255) / 255,
    blue: (num & 255) / 255,
  };
}

module.exports = { setJobComplete };
