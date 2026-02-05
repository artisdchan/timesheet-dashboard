# Timesheet Dashboard

A simple, fast timesheet dashboard that syncs with Microsoft Planner. Built with Vue 3, TypeScript, and Vite.

## Features

- 🔐 **Secure Microsoft Authentication** - Uses MSAL.js for secure Azure AD login
- 📅 **Weekly View** - See your tasks organized by week with daily breakdown
- 📊 **Bucket Summary** - Visual breakdown of hours by bucket
- 🔍 **Search & Filter** - Quickly find tasks by name
- ⏱️ **Auto-parse Hours** - Extracts hours from Planner labels (category1-category9)
- ✅ **Create Tasks** - Add new tasks directly from the dashboard
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## Prerequisites

Before using this dashboard, you need to register an application in Azure Active Directory.

### 1. Register App in Azure AD

1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **"New registration"**
3. Enter a name (e.g., "Timesheet Dashboard")
4. Select **"Accounts in any organizational directory (Any Azure AD directory - Multitenant)"** for multi-tenant
   - OR select **"Accounts in this organizational directory only"** for single-tenant
5. Set **Redirect URI**:
   - Platform: **Single-page application (SPA)**
   - URI: `http://localhost:5173` (for development)
6. Click **Register**

### 2. Configure API Permissions

1. In your app registration, go to **"API permissions"**
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Add these **Delegated permissions**:
   - `User.Read` - Read user profile
   - `Tasks.Read` - Read user's tasks
   - `Tasks.ReadWrite` - Read and write user's tasks
5. Click **"Grant admin consent"** (if you have admin rights)

### 3. Copy Configuration Values

1. On the **Overview** page, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID** (only needed for single-tenant)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your Azure AD configuration:

```env
# Azure AD Application (client) ID
VITE_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Azure AD Tenant ID
# Use "common" for multi-tenant apps (any organization can use)
# Use your specific tenant ID for single-tenant apps
VITE_AZURE_TENANT_ID=common
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Building for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_AZURE_CLIENT_ID` | Azure AD Application (client) ID | **Required** |
| `VITE_AZURE_TENANT_ID` | Azure AD Tenant ID | `common` |

**Note:** In Vite, only environment variables prefixed with `VITE_` are exposed to the client-side code.

## Time Tracking with Planner Labels

Planner uses internal category names for labels. This app maps them to hours:

| Label | Category | Hours |
|-------|----------|-------|
| 30m | category1 | 0.5h |
| 1h | category2 | 1h |
| 1.5h | category3 | 1.5h |
| 2h | category4 | 2h |
| 3h | category5 | 3h |
| 4h | category6 | 4h |
| 5h | category11 | 5h |
| 6h | category7 | 6h |
| 7h | category8 | 7h |
| 8h | category9 | 8h |

### How to Use in Planner

1. Create a task in Microsoft Planner
2. Set a **Due Date** (this determines which day the task appears)
3. Apply a **Label** (for hours tracking)
4. Set **Priority** (Medium is default)
5. Mark as **Complete** when done

The dashboard will automatically extract the hours from the label.

## Project Structure

```
src/
├── components/
│   ├── LoginView.vue       # Login page
│   ├── TimesheetView.vue   # Main timesheet dashboard
│   └── CreateTaskModal.vue # Create task modal
├── services/
│   ├── auth.ts             # MSAL authentication
│   ├── graph.ts            # Microsoft Graph API client
│   └── timeParser.ts       # Time parsing utilities
├── types/
│   └── planner.ts          # TypeScript types
├── App.vue                 # Root component
└── main.ts                 # Entry point
```

## Troubleshooting

### "Configuration Required" message
- Check that `VITE_AZURE_CLIENT_ID` is set in your `.env` file
- Restart the dev server after changing `.env`

### "Login failed" error
- Verify your Client ID is correct
- Check that the redirect URI matches your app URL
- Ensure API permissions are granted

### No tasks showing
- Make sure you have tasks assigned to you in Planner
- Check that tasks have due dates within the last 3 months
- Verify you're looking at the correct project/bucket

### Hours not showing correctly
- Open browser dev tools (F12) to see debug logs
- Check that labels are applied correctly in Planner

## Technology Stack

- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **MSAL.js** - Microsoft Authentication Library
- **Microsoft Graph API** - Access to Planner data
- **date-fns** - Date utility library

## License

MIT
