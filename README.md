# Discord CRM Bot

A comprehensive Customer Relationship Management (CRM) system built for Discord with Google Sheets integration.

## Features

- **Client Management**: Create and manage clients with contact information
- **Job Tracking**: Track jobs with status, deadlines, and assignments  
- **Task Management**: Create and manage tasks within jobs
- **Invoice System**: Generate invoices with line items and PDF export
- **Google Sheets Integration**: All data stored in Google Sheets
- **PDF Export**: Automatic PDF generation and Google Drive storage
- **Discord UI**: Interactive slash commands, modals, and embedded boards
- **Auto-sync**: Refreshes data every 60 minutes

## Commands

- `/client create` - Create a new client
- `/job create` - Create a new job for a client
- `/task create` - Create a task within a job
- `/invoice create` - Create an invoice with line items
- `/invoice edit` - Edit invoices using modal interface
- `/invoice generate` - Generate PDF and export to Google Drive
- `/sync` - Manual sync with Google Sheets

## Setup

### Prerequisites

1. Discord Bot Token
2. Google Cloud Project with Sheets & Drive APIs enabled
3. Google Service Account with credentials

### Environment Variables

Create a `.env` file with:

```env
BOT_TOKEN=your_discord_bot_token
GSHEETS_SERVICE_EMAIL=service-account@project.iam.gserviceaccount.com
GSHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GSHEETS_SPREADSHEET_ID=your_google_sheets_id
```

### Installation

1. Clone the repository
2. Run `npm install`
3. Set up environment variables
4. Deploy slash commands: `npm run deploy`
5. Start the bot: `npm start`

### Google Sheets Setup

The bot automatically creates the following sheets:
- **Clients**: Client information and contact details
- **Jobs**: Job tracking with status and deadlines
- **Tasks**: Task management within jobs
- **Invoices**: Invoice data with line items
- **Invoice Form**: Template for PDF generation

### Deployment

This bot is configured for deployment on Render using the included `render.yaml` file.

## Architecture

- **Discord.js v14** for Discord integration
- **Google Sheets API** for data storage
- **Google Drive API** for PDF export
- **Modal-based UI** for better user experience
- **Auto-incrementing IDs** for all entities
- **Real-time sync** between Discord and Google Sheets

## Invoice Features

- Up to 10 line items per invoice
- Modal-based editing interface
- Automatic PDF generation from Google Sheets
- Export to Google Drive with client names
- Auto-incrementing invoice numbers
- Due date parsing with natural language

---

🤖 Built with [Claude Code](https://claude.ai/code)