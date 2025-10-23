# Claude Instructions for Voice Assistant

## System Information

This Claude Code instance is running within a voice-controlled assistant sandbox environment.

### Sandbox Structure
- **Working Directory**: `./sandbox/`
- **Home Symlink**: `sandbox/home/` → `/home/myra`
- **Obsidian Vault Symlink**: `sandbox/ObsidianVault/` → `/run/media/myra/DropboxSD/Dropbox/Obsidian Vault/`

### Permissions
- **Read**: Allowed anywhere in the system
- **Write/Edit/Replace**: Only allowed within the `sandbox/` directory (and its symlinked locations)

## Shopping List

### Location
- **File**: `sandbox/ObsidianVault/📌 Pinned/🛒 Shopping List.md`
- **Vault Location**: `sandbox/ObsidianVault/`

The shopping list is maintained in the Obsidian vault on the Dropbox SD card. It's organized by categories (Dry, Perishable, Misc) with checkboxes for tracking completed purchases.

## Custom Commands

When creating custom commands for Myra:

1. **Create executable script** in `sandbox/home/.local/bin/` with the command name
2. **Make it executable** with `chmod +x`
3. **Update welcome message** in `sandbox/home/.zshrc` to include the new command with appropriate Nerd Font icon

### Welcome Message Format
```
   [icon]  command-name    Description of what it does
```

### Common Nerd Font Icons for Commands:
- 󰏘 (CAD/design tools)
- 󰭹 (AI/brain for AI tools)
- 󰗃 (download for downloaders)
- 󰅩 (text editor)
- 󰖕 (weather)
- 󰈙 (document/file)
- 󰊤 (terminal/shell)
- 󰒋 (media/video)
- 󰌽 (development)
- 󰑭 (database)
- 󰜮 (server/network)

### Example Command Creation:
```bash
# Create script
echo '#!/bin/bash\ncd "/path/to/directory" && command' > sandbox/home/.local/bin/my-command
chmod +x sandbox/home/.local/bin/my-command

# Add to welcome message in .zshrc
echo "   󰈙  my-command       Description of command"
```

Always update both the command script AND the welcome message when creating new custom commands.

## Reading Document Files

### Pandoc
Pandoc is installed and can be used to read .docx files in the terminal.

**Usage:**
```bash
# Read .docx file as plain text
pandoc "filename.docx" -t plain

# Convert to markdown
pandoc "filename.docx" -t markdown

# Convert to other formats
pandoc "filename.docx" -o output.pdf
```

**Common use cases:**
- Reading job application documents (.docx)
- Converting between document formats
- Extracting text from Word documents for processing

## SSH Connection Details

### ssh-bs Command
- **Purpose**: SSH to basement server
- **Command**: `ssh-bs`
- **Script location**: `sandbox/home/Scripts/ssh-basement-server.sh`
- **Connection**: `ssh -i ~/.ssh/myra-key-passwordless myra@nixos`

#### File Transfer Usage:
```bash
# Upload files to basement server
scp -i ~/.ssh/myra-key-passwordless file.txt myra@nixos:/path/to/destination/

# Download files from basement server
scp -i ~/.ssh/myra-key-passwordless myra@nixos:/path/to/file.txt ./

# Recursive directory transfer
scp -i ~/.ssh/myra-key-passwordless -r directory/ myra@nixos:/path/to/destination/
```

## Job Applications Folder

### Location
- **CSV File**: `sandbox/home/applications/applications-status.csv`
- **Applications Folder**: `sandbox/home/applications/applications/`

### Structure
The job applications folder follows a consistent structure:
- **applications-status.csv**: Master tracking file with columns: Job, Pay, Link, Status
- **applications/**: Folder containing individual application subfolders
- **Resume files**: Base resume templates in the root folder

### Folder Naming Convention
Each application subfolder is named: `[Company] - [Position Title]`

### CSV Format
```csv
Job,Pay,Link,Status
[Position] – [Company] (Remote),[Salary Range],[Application Link],[Status]
```

### Application Folder Contents
Each company folder contains:
- `job-listing.txt`: Full job posting details extracted from the listing URL
- `Resume and Cover Letter.docx` (when prepared for submission)
- Some may have additional formats (e.g., `.txt` versions)

### Job Listing Workflow

When user provides a job posting URL, follow this automated workflow:

1. **Fetch job details**: Use `curl` + `pandoc` to extract text from the URL
   ```bash
   curl -s "URL" | pandoc -f html -t plain | head -n 400
   ```

2. **Add to CSV**: Append new row to `sandbox/home/applications/applications-status.csv`
   - Format: `Position – Company (Location),~$XXK–$XXK,URL,New`
   - Default status: "New"

3. **Create folder**: Create application subfolder with naming convention
   ```bash
   mkdir -p "sandbox/home/applications/applications/[Company] - [Position]"
   ```

4. **Create job-listing.txt**: Generate structured text file with:
   - Job title, company, location, salary
   - Application link
   - About the company
   - Role overview/summary
   - Responsibilities
   - Requirements/qualifications
   - Nice to haves (if applicable)
   - Compensation & benefits
   - Any special notes (e.g., portfolio required, application limits, etc.)

### Resume Templates (Root Level)
- `Resume (Digital Strategist) 9_24.docx`
- `Resume (Senior Product Designer) 9_24.docx`

### Resume and Cover Letter Generation Workflow

When user requests to create a resume and cover letter for a specific position, follow this workflow:

1. **Locate application folder**: Find the application subfolder matching the company/position name
   ```bash
   find sandbox/home/applications/applications -type d -iname "*[company-name]*"
   ```

2. **Read source materials**:
   - Read the `job-listing.txt` from the application folder
   - Read `sandbox/home/applications/resume-template.txt` (master template with all experience, skills, and talking points)

3. **Generate resume.txt**: Create a tailored resume that:
   - Emphasizes relevant experience and skills matching the job requirements
   - Highlights specific achievements and metrics that align with the role
   - Incorporates appropriate objective statement from template
   - Maintains professional formatting in plain text
   - Focuses on mobile/product design experience when applicable
   - Showcases design systems, research, and collaboration skills as relevant

4. **Generate cover-letter.txt**: Create a compelling cover letter that:
   - Opens with enthusiasm for the specific role and company mission
   - Highlights 3-5 key experiences directly relevant to job requirements
   - Demonstrates understanding of company's challenges and opportunities
   - Shows measurable impact from previous work (percentages, metrics)
   - Connects personal values/interests to company mission
   - Closes with clear next steps and availability
   - Uses company-specific talking points from template when available

5. **Save files**: Create both files in the application folder:
   - `sandbox/home/applications/applications/[Company] - [Position]/resume.txt`
   - `sandbox/home/applications/applications/[Company] - [Position]/cover-letter.txt`

6. **Update status** (optional): Update CSV status to "Resume Ready" if materials are complete

**Key principles:**
- Tailor content specifically to job requirements and company mission
- Use concrete examples and metrics from resume template
- Maintain consistent voice and professional tone
- Emphasize end-to-end design, collaboration, and measurable impact
- Highlight relevant technical skills (Figma, design systems, mobile design, etc.)

### Status Values
- **New**: Job added but not yet applied
- **Resume Ready**: Application materials prepared
- **Submitted**: Application submitted
- **Listing closed before submit**: Job closed before application
- **No longer available**: Job listing removed
- **Listing ended**: Job posting expired
