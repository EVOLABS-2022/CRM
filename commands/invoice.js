const { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const chrono = require('chrono-node');
const { getClients, getJobs, getInvoices, createInvoice, updateInvoice } = require('../lib/sheetsDb');
const { generateInvoiceEmbed } = require('../utils/invoiceEmbed');
const { refreshInvoicesBoard } = require('../utils/invoiceBoard');

// Invoice numbers are now calculated dynamically from existing invoices

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invoice')
    .setDescription('Manage invoices')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new invoice')
        .addStringOption(opt =>
          opt.setName('client').setDescription('Client').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('job').setDescription('Job').setRequired(true).setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('due').setDescription('Due date (e.g., "next Friday", "in 2 weeks", "Dec 15")').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('notes').setDescription('Optional notes')
        )
        .addStringOption(opt =>
          opt.setName('terms').setDescription('Optional terms')
        )
        .addStringOption(opt =>
          opt.setName('item1').setDescription('Line item 1 description')
        )
        .addNumberOption(opt =>
          opt.setName('price1').setDescription('Line item 1 price (required if item1 provided)')
        )
        .addStringOption(opt =>
          opt.setName('item2').setDescription('Line item 2 description')
        )
        .addNumberOption(opt =>
          opt.setName('price2').setDescription('Line item 2 price (required if item2 provided)')
        )
        .addStringOption(opt =>
          opt.setName('item3').setDescription('Line item 3 description')
        )
        .addNumberOption(opt =>
          opt.setName('price3').setDescription('Line item 3 price (required if item3 provided)')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit an existing invoice (opens modal)')
        .addStringOption(opt =>
          opt.setName('invoice').setDescription('Invoice to edit').setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('generate')
        .setDescription('Generate formatted invoice (pushes data to Invoice Form tab)')
        .addStringOption(opt =>
          opt.setName('invoice').setDescription('Invoice to generate').setRequired(true).setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'client') {
      try {
        const clients = await getClients();
        
        // If no clients, return empty
        if (clients.length === 0) {
          return await interaction.respond([]);
        }

        // Filter clients that have codes (some entries are missing codes)
        const validClients = clients.filter(c => c.code);
        
        const results = validClients.map(c => ({
          name: `${c.code} - ${c.name}`,
          value: c.code
        }));

        // Show all clients if nothing typed, otherwise filter
        let filtered;
        if (!focused.value || focused.value === '') {
          filtered = results;
        } else {
          filtered = results.filter(r => 
            r.name.toLowerCase().includes(focused.value.toLowerCase())
          );
        }

        await interaction.respond(filtered.slice(0, 25));
      } catch (error) {
        console.error('Client autocomplete error:', error);
        await interaction.respond([]);
      }
    }

    if (focused.name === 'job') {
      try {
        const clientCode = interaction.options.getString('client');
        
        // If no client selected yet, show message
        if (!clientCode) {
          return await interaction.respond([{
            name: 'Please select a client first',
            value: 'SELECT_CLIENT_FIRST'
          }]);
        }

        // Get all jobs for the selected client
        const jobs = await getJobs();
        const clientJobs = jobs.filter(j => j.clientCode === clientCode);
        
        // If no jobs for this client, show message
        if (clientJobs.length === 0) {
          return await interaction.respond([{
            name: 'No jobs found for this client',
            value: 'NO_JOBS'
          }]);
        }

        // Show only open jobs (not closed/completed)
        const openJobs = clientJobs.filter(j => j.status !== 'closed' && j.status !== 'completed');
        
        if (openJobs.length === 0) {
          return await interaction.respond([{
            name: 'No open jobs for this client',
            value: 'NO_OPEN_JOBS'
          }]);
        }

        const results = openJobs.map(j => ({
          name: `${j.id} - ${j.title}`,
          value: j.id
        }));

        // Show all jobs if nothing typed, otherwise filter
        let filtered;
        if (!focused.value || focused.value === '') {
          filtered = results;
        } else {
          filtered = results.filter(r => 
            r.name.toLowerCase().includes(focused.value.toLowerCase())
          );
        }

        await interaction.respond(filtered.slice(0, 25));
      } catch (error) {
        console.error('Job autocomplete error:', error);
        await interaction.respond([]);
      }
    }

    // Handle invoice field autocomplete for edit command
    if (focused.name === 'invoice') {
      try {
        const invoices = await getInvoices();
        
        if (invoices.length === 0) {
          return await interaction.respond([{
            name: 'No invoices found',
            value: 'NO_INVOICES'
          }]);
        }

        // Get clients to show client names in autocomplete
        const clients = await getClients();
        
        const results = invoices.map(inv => {
          const client = clients.find(c => c.id === inv.clientId);
          const clientName = client ? client.name : 'Unknown Client';
          return {
            name: `${clientName} - #${inv.id} - $${inv.total}`,
            value: inv.id
          };
        });

        // Filter based on what user typed
        let filtered;
        if (!focused.value || focused.value === '') {
          filtered = results;
        } else {
          filtered = results.filter(r => 
            r.name.toLowerCase().includes(focused.value.toLowerCase())
          );
        }

        await interaction.respond(filtered.slice(0, 25));
      } catch (error) {
        console.error('Invoice autocomplete error:', error);
        await interaction.respond([]);
      }
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      // Defer reply to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const clientCode = interaction.options.getString('client');
      const jobId = interaction.options.getString('job');
      const dueInput = interaction.options.getString('due');
      const notes = interaction.options.getString('notes') || '';
      const terms = interaction.options.getString('terms') || '';

      // Process line items (up to 3 via slash command, expandable to 10 via edit)
      const lineItems = [];
      let total = 0;
      
      for (let i = 1; i <= 3; i++) {
        const item = interaction.options.getString(`item${i}`);
        const price = interaction.options.getNumber(`price${i}`);
        
        if (item) {
          if (price === null) {
            return await interaction.editReply({
              content: `❌ Price is required for line item ${i}: "${item}"`
            });
          }
          
          lineItems.push({
            description: item,
            price: price
          });
          total += price;
        }
      }

      // Parse due date using natural language
      const parsedDue = chrono.parseDate(dueInput);
      if (!parsedDue) {
        return await interaction.editReply({
          content: '❌ Could not understand the due date format. Try "next Friday", "in 2 weeks", "Dec 15", etc.'
        });
      }
      // Format as YYYY-MM-DD for storage (using UTC date for global team consistency)
      const due = parsedDue.toISOString().split('T')[0];

      try {
        // Check for invalid selections from autocomplete
        if (jobId === 'SELECT_CLIENT_FIRST' || jobId === 'NO_JOBS' || jobId === 'NO_OPEN_JOBS') {
          return await interaction.editReply({ 
            content: '❌ Please select a valid job for the invoice.' 
          });
        }

        // Get data from Sheets
        const clients = await getClients();
        const jobs = await getJobs();
        const existingInvoices = await getInvoices();

        const client = clients.find(c => c.code === clientCode);
        const job = jobs.find(j => j.id === jobId);

        if (!client || !job) {
          return await interaction.editReply({ 
            content: '❌ Invalid client or job.' 
          });
        }

        // Generate invoice number by finding the highest existing number (starting from 679)
        let maxInvoiceNum = 678; // Start before 679 so first invoice will be 000679
        for (const existingInvoice of existingInvoices) {
          const num = parseInt(existingInvoice.id, 10);
          if (!isNaN(num) && num > maxInvoiceNum) {
            maxInvoiceNum = num;
          }
        }
        const invoiceNumber = String(maxInvoiceNum + 1).padStart(6, '0');

        const invoice = {
          id: invoiceNumber,
          clientId: client.id,
          clientCode: client.code,
          jobId: job.id,
          status: 'draft',
          dueAt: due,
          total: total,
          notes,
          terms,
          lineItems: lineItems
        };

        console.log('💾 Saving invoice to Google Sheets:', invoice.id);
        await createInvoice(invoice);

        // Refresh invoice board with updated data
        try {
          const allClients = await getClients();
          const allJobs = await getJobs();
          const allInvoices = await getInvoices();
          await refreshInvoicesBoard(interaction.client, allInvoices, allClients, allJobs);
          console.log('✅ Invoice board refreshed');
        } catch (error) {
          console.error('❌ Failed to refresh invoice board:', error);
        }

        await interaction.editReply({
          embeds: [generateInvoiceEmbed(invoice, client, job)],
        });
        
      } catch (error) {
        console.error('❌ Invoice creation failed:', error);
        await interaction.editReply({
          content: `❌ Failed to create invoice: ${error.message}`
        });
      }
    }

    if (sub === 'edit') {
      const invoiceId = interaction.options.getString('invoice');

      try {
        // Check for invalid selections from autocomplete
        if (invoiceId === 'NO_INVOICES') {
          return await interaction.reply({
            content: '❌ No invoices available to edit.',
            flags: MessageFlags.Ephemeral
          });
        }

        const invoices = await getInvoices();
        const invoice = invoices.find(inv => inv.id === invoiceId);

        if (!invoice) {
          return await interaction.reply({
            content: '❌ Invoice not found.',
            flags: MessageFlags.Ephemeral
          });
        }

        // Create modal with current invoice values
        const modal = new ModalBuilder()
          .setCustomId(`edit_invoice_${invoiceId}`)
          .setTitle(`Edit Invoice #${invoiceId}`);

        // Status field
        const statusInput = new TextInputBuilder()
          .setCustomId('status')
          .setLabel('Status')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('draft, sent, paid, overdue, cancelled')
          .setValue(invoice.status || 'draft')
          .setRequired(false);

        // Due date field
        const dueDateInput = new TextInputBuilder()
          .setCustomId('due_date')
          .setLabel('Due Date')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('next Friday, in 2 weeks, Dec 15, etc.')
          .setValue(invoice.dueAt || '')
          .setRequired(false);

        // Notes field
        const notesInput = new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notes')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Invoice notes...')
          .setValue(invoice.notes || '')
          .setRequired(false);

        // Terms field
        const termsInput = new TextInputBuilder()
          .setCustomId('terms')
          .setLabel('Terms')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Payment terms...')
          .setValue(invoice.terms || '')
          .setRequired(false);

        // Line items field (show current items, allow editing)
        const currentItems = invoice.lineItems || [];
        const itemsText = currentItems.length > 0 
          ? currentItems.map((item, i) => `${i+1}. ${item.description} - $${item.price}`).join('\n')
          : '';
        
        const lineItemsInput = new TextInputBuilder()
          .setCustomId('line_items')
          .setLabel('Line Items')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Web Design - 500\nHosting Setup - 100\nLogo Design - 200')
          .setValue(itemsText)
          .setRequired(false);

        // Add inputs to action rows
        const row1 = new ActionRowBuilder().addComponents(statusInput);
        const row2 = new ActionRowBuilder().addComponents(dueDateInput);
        const row3 = new ActionRowBuilder().addComponents(notesInput);
        const row4 = new ActionRowBuilder().addComponents(termsInput);
        const row5 = new ActionRowBuilder().addComponents(lineItemsInput);

        modal.addComponents(row1, row2, row3, row4, row5);

        await interaction.showModal(modal);

      } catch (error) {
        console.error('❌ Failed to show invoice edit modal:', error);
        await interaction.reply({
          content: `❌ Failed to open edit modal: ${error.message}`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (sub === 'generate') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const invoiceId = interaction.options.getString('invoice');

      try {
        // Check for invalid selections from autocomplete  
        if (invoiceId === 'NO_INVOICES') {
          return await interaction.editReply({
            content: '❌ No invoices available to generate.'
          });
        }

        const invoices = await getInvoices();
        const invoice = invoices.find(inv => inv.id === invoiceId);

        if (!invoice) {
          return await interaction.editReply({
            content: '❌ Invoice not found.'
          });
        }

        // Get client and job data for the invoice
        const clients = await getClients();
        const jobs = await getJobs();
        const client = clients.find(c => c.id === invoice.clientId);
        const job = jobs.find(j => j.id === invoice.jobId);

        if (!client) {
          return await interaction.editReply({
            content: '❌ Client not found for this invoice.'
          });
        }

        // TODO: Need cell mapping information from user
        // This will populate the "Invoice Form" tab with invoice data
        await generateInvoiceForm(invoice, client, job);

        await interaction.editReply({
          content: `✅ Invoice #${invoiceId} has been generated and pushed to the Invoice Form tab.\n📄 PDF export in progress...`
        });

      } catch (error) {
        console.error('❌ Invoice generation failed:', error);
        await interaction.editReply({
          content: `❌ Failed to generate invoice: ${error.message}`
        });
      }
    }
  }
};

async function generateInvoiceForm(invoice, client, job) {
  const { getSheets } = require('../lib/sheets');
  const SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID;
  
  
  const api = await getSheets();
  
  // Build updates array based on provided cell mappings
  const updates = [];
  
  // Basic Invoice Data
  if (invoice.id) {
    updates.push({ range: 'Invoice Form!G11', values: [[invoice.id]] });
  }
  
  if (client.name) {
    updates.push({ range: 'Invoice Form!B12:C12', values: [[client.name, '']] });
  }
  
  if (client.contactName) {
    updates.push({ range: 'Invoice Form!B15:C15', values: [[client.contactName, '']] });
  }
  
  if (invoice.dueAt) {
    updates.push({ range: 'Invoice Form!G14', values: [[invoice.dueAt]] });
  }
  
  if (invoice.notes) {
    updates.push({ range: 'Invoice Form!B31:E38', values: [[invoice.notes, '', '', '']] });
  }
  
  // Line Items (up to 10 items, rows 19-28)
  const lineItems = invoice.lineItems || [];
  for (let i = 0; i < 10; i++) {
    const rowNum = 19 + i;
    
    if (i < lineItems.length) {
      // Item has data
      const item = lineItems[i];
      updates.push({ 
        range: `Invoice Form!B${rowNum}:D${rowNum}`, 
        values: [[item.description, '', '']] 
      });
      updates.push({ 
        range: `Invoice Form!F${rowNum}`, 
        values: [[item.price]] 
      });
    } else {
      // Clear empty rows
      updates.push({ 
        range: `Invoice Form!B${rowNum}:D${rowNum}`, 
        values: [['', '', '']] 
      });
      updates.push({ 
        range: `Invoice Form!F${rowNum}`, 
        values: [['']] 
      });
    }
  }

  // Batch update all cells at once for better performance
  if (updates.length > 0) {
    const batchUpdateRequest = {
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        valueInputOption: 'RAW',
        data: updates
      }
    };

    await api.spreadsheets.values.batchUpdate(batchUpdateRequest);
  }
  
  console.log(`✅ Invoice #${invoice.id} data pushed to Invoice Form tab with ${lineItems.length} line items`);
  
  // Export Invoice Form tab as PDF
  await exportInvoicePDF(invoice.id, api, client);
}

async function exportInvoicePDF(invoiceId, sheetsApi, client) {
  try {
    const SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID;
    
    // Get the sheet info to find the Invoice Form tab ID
    const sheetInfo = await sheetsApi.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    
    const invoiceFormSheet = sheetInfo.data.sheets.find(
      sheet => sheet.properties.title === 'Invoice Form'
    );
    
    if (!invoiceFormSheet) {
      console.error('❌ Invoice Form tab not found');
      return;
    }
    
    const sheetId = invoiceFormSheet.properties.sheetId;
    
    // Export specific sheet as PDF in portrait mode
    const exportUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?` +
      `format=pdf&portrait=true&size=A4&fzr=false&gid=${sheetId}`;
    
    // Get authenticated client with proper scopes for Drive API
    const { google } = require('googleapis');
    const fs = require('fs');
    const path = require('path');
    
    const keyFilePath = process.env.GSHEETS_KEY_FILE;
    
    const auth = keyFilePath && fs.existsSync(keyFilePath)
      ? new google.auth.GoogleAuth({
          keyFile: path.resolve(keyFilePath),
          scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        })
      : new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GSHEETS_SERVICE_EMAIL,
            private_key: process.env.GSHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
        });
    
    const authClient = await auth.getClient();
    const response = await authClient.request({
      url: exportUrl,
      responseType: 'stream'
    });
    
    // Save to Google Drive folder
    await savePDFToDrive(invoiceId, response.data, auth, client);
    
    console.log(`✅ Invoice #${invoiceId} exported as PDF`);
    
  } catch (error) {
    console.error(`❌ Failed to export PDF for invoice ${invoiceId}:`, error.message);
  }
}

async function savePDFToDrive(invoiceId, pdfStream, auth, client) {
  try {
    const { google } = require('googleapis');
    
    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = '1Oa_DYQt7NZFlXdwurAT8LS0WUDkgg84g';
    const fileName = `${client.name} - Invoice ${invoiceId}.pdf`;
    
    
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };
    
    const media = {
      mimeType: 'application/pdf',
      body: pdfStream,
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      supportsAllDrives: true,
    });
    
    console.log(`✅ PDF saved to Google Drive: ${fileName} (ID: ${file.data.id})`);
    
  } catch (error) {
    console.error('❌ Failed to save PDF to Drive:', error.message);
  }
}
