# Google Workspace MCP Server Setup Guide

This guide will help you set up the Google Workspace MCP server to integrate Google Calendar, Gmail, Drive, Docs, Sheets, Slides, Forms, Tasks, and Chat with your Claude voice assistant.

## What You'll Get

- **Calendar**: Create/update events, check availability, schedule meetings
- **Gmail**: Read, send, search emails, manage labels
- **Drive**: Upload, download, organize files and folders
- **Docs/Sheets/Slides**: Create and edit documents, spreadsheets, presentations
- **Forms**: Create forms and manage responses
- **Tasks**: Manage task lists and to-dos
- **Chat**: Send messages to Google Chat spaces

## Prerequisites

- Python 3.10+
- `uvx` or `uv` package manager (already installed)
- Google account (free Gmail or Google Workspace)
- Google Cloud Project (free to create)

## Installation Steps

### Step 1: Google Cloud OAuth Setup

1. **Go to Google Cloud Console**: https://console.cloud.google.com/

2. **Create a New Project** (or use existing):
   - Click "Select Project" → "New Project"
   - Name it (e.g., "Claude Voice Assistant")
   - Click "Create"

3. **Enable Required APIs**:
   Go to "APIs & Services" → "Library" and enable these APIs:
   - Google Calendar API
   - Gmail API
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Slides API
   - Google Forms API
   - Google Tasks API
   - Google Chat API (if using Workspace)
   - Custom Search API (optional)

   **Quick Links**:
   - [Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   - [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - [Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
   - [Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   - [Slides API](https://console.cloud.google.com/apis/library/slides.googleapis.com)

4. **Create OAuth Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure OAuth consent screen:
     - User Type: External (for personal Gmail) or Internal (for Workspace)
     - App name: "Claude Voice Assistant"
     - User support email: Your email
     - Developer email: Your email
     - Add scopes later (server will request needed scopes)
     - Add your email as a test user
     - Click "Save and Continue"
   - Application type: **Desktop app**
   - Name: "Claude Voice Assistant Desktop"
   - Click "Create"
   - **Download the JSON** or copy the Client ID and Client Secret

### Step 2: Configure Environment Variables

1. **Copy the example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and add your OAuth credentials**:
   ```bash
   # Google Workspace MCP Configuration
   GOOGLE_OAUTH_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret-here
   OAUTHLIB_INSECURE_TRANSPORT=1
   ```

3. **Optional settings**:
   - `USER_GOOGLE_EMAIL`: Your default Google account email
   - `MCP_ENABLE_OAUTH21=true`: For multi-user support
   - `WORKSPACE_MCP_STATELESS_MODE=true`: For stateless operation

### Step 3: Install and Run the MCP Server

#### Option A: Quick Start with uvx (Recommended)

```bash
# Core tools only (essential operations)
uvx workspace-mcp --tool-tier core

# Extended tools (adds management features)
uvx workspace-mcp --tool-tier extended

# All tools (complete API access)
uvx workspace-mcp --tool-tier complete
```

#### Option B: Development Mode

```bash
# Navigate to the Google Workspace MCP directory
cd src/mcp/google_workspace_mcp

# Install dependencies
uv sync

# Run with specific tools
uv run main.py --tools gmail calendar drive

# Run with all tools
uv run main.py --tool-tier complete
```

#### Option C: One-Click Claude Desktop Install

If you're using Claude Desktop (not the voice assistant):

1. Locate the `.dxt` file:
   ```
   src/mcp/google_workspace_mcp/google_workspace_mcp.dxt
   ```

2. Double-click the file - Claude Desktop will prompt you to install

3. In Claude Desktop → Settings → Extensions → Google Workspace MCP:
   - Paste your `GOOGLE_OAUTH_CLIENT_ID`
   - Paste your `GOOGLE_OAUTH_CLIENT_SECRET`
   - Set `OAUTHLIB_INSECURE_TRANSPORT=1`

### Step 4: First-Time Authentication

When you first run the server, it will:

1. Open your default browser
2. Ask you to log in to your Google account
3. Show the permissions the app needs
4. Ask you to authorize access

After authorization, the server will:
- Save your tokens locally (in `.credentials/` or similar)
- Auto-refresh tokens when they expire
- Not require re-authentication unless you revoke access

### Step 5: Test the Integration

Try asking your voice assistant:

- "What's on my calendar today?"
- "Check my emails"
- "Create a new document called Meeting Notes"
- "Upload this file to my Drive"
- "Add a task to my list"

## Tool Tiers Explained

### Core Tier (Recommended for Voice Assistant)
Essential read/create/search operations:
- Read emails, calendars, documents
- Create new items
- Basic search functionality

### Extended Tier
Adds management features:
- Labels, filters, batch operations
- Advanced formatting
- Permissions management

### Complete Tier
Full API access including:
- Administrative functions
- Advanced settings
- All possible operations

## Troubleshooting

### "Invalid Client" Error
- Verify your Client ID and Secret are correct
- Make sure you created a "Desktop app" (not Web application)
- Check that APIs are enabled in Google Cloud Console

### "Access Denied" Error
- Add your email as a test user in OAuth consent screen
- Make sure you're logging in with the correct Google account
- Check that required APIs are enabled

### Browser Not Opening
- Manually visit the URL shown in the terminal
- Complete authentication in browser
- Server will automatically detect the callback

### Token Expired
- Server should auto-refresh tokens
- If not, delete the `.credentials/` folder and re-authenticate

## Security Notes

- **Never commit `.env` to git** - it contains your secrets
- The `.dxt` file is safe to share - it doesn't contain credentials
- OAuth tokens are stored locally and never shared
- Use `OAUTHLIB_INSECURE_TRANSPORT=1` only for development
- For production, set up proper HTTPS redirect URIs

## Advanced Configuration

### Multi-User Support (OAuth 2.1)

Enable OAuth 2.1 for multiple users:

```bash
MCP_ENABLE_OAUTH21=true
WORKSPACE_MCP_STATELESS_MODE=true
```

This allows different users to authenticate and use the same server instance.

### Custom Tool Selection

Run with specific tools only:

```bash
uv run main.py --tools gmail calendar drive docs
```

### Environment-Specific Configs

Create multiple env files:
- `.env.development` - For testing
- `.env.production` - For live use

## Integration with Voice Assistant

The Google Workspace MCP server integrates with your Claude voice assistant automatically. Once running, you can use natural language to:

- Schedule meetings: "Schedule a meeting with John tomorrow at 2pm"
- Check calendar: "What's on my calendar this week?"
- Email: "Send an email to sarah@example.com about the project update"
- Documents: "Create a new doc for brainstorming ideas"
- Drive: "Find my presentation from last week"
- Tasks: "Add 'Buy groceries' to my task list"

## Resources

- **Documentation**: https://workspacemcp.com
- **GitHub Repository**: https://github.com/taylorwilsdon/google_workspace_mcp
- **Google Cloud Console**: https://console.cloud.google.com/
- **API Scopes Reference**: https://developers.google.com/identity/protocols/oauth2/scopes

## License

This MCP server is licensed under MIT. See the repository for details.
