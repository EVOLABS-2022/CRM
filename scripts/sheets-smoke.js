// scripts/sheets-smoke.js
require('dotenv').config();
const { google } = require('googleapis');

(async () => {
  try {
    const sheetId = process.env.GSHEETS_SHEET_ID;
    const keyFile = process.env.GSHEETS_KEY_FILE;
    if (!sheetId || !keyFile) {
      throw new Error('Missing GSHEETS_SHEET_ID or GSHEETS_KEY_FILE');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Clients!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [['PING from bot']] },
    });

    console.log('✅ Write OK:', res.status, res.statusText);
  } catch (e) {
    console.error('❌ Smoke failed:', e.response?.data || e.message);
    process.exit(1);
  }
})();