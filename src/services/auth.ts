import { PublicClientApplication, type AuthenticationResult, type AccountInfo } from '@azure/msal-browser'

// Get Azure AD configuration from environment variables
// In Vite, env vars must start with VITE_ to be exposed to client
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || 'common'

// Validate configuration
if (!CLIENT_ID || CLIENT_ID === 'your-client-id-here') {
  console.warn(
    '%c[Timesheet Dashboard] Azure AD Client ID not configured!\n' +
    'Please set VITE_AZURE_CLIENT_ID in your .env file',
    'color: orange; font-weight: bold;'
  )
}

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage' as const,
    storeAuthStateInCookie: false,
  },
}

// Scopes needed for Planner access
const loginRequest = {
  scopes: [
    'User.Read',
    'Tasks.Read',
    'Tasks.ReadWrite',
  ],
  prompt: 'select_account' as const,
}

const graphScopes = {
  scopes: [
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Tasks.Read',
    'https://graph.microsoft.com/Tasks.ReadWrite',
  ]
}

class AuthService {
  private msalInstance: PublicClientApplication
  private account: AccountInfo | null = null
  private isProcessing = false

  constructor() {
    this.msalInstance = new PublicClientApplication(msalConfig)
  }

  async initialize(): Promise<void> {
    await this.msalInstance.initialize()
    
    // Check if we have a hash response from redirect
    if (window.location.hash && window.location.hash.includes('state=')) {
      try {
        const response = await this.msalInstance.handleRedirectPromise()
        if (response) {
          this.account = response.account
          // Clean the URL
          window.history.replaceState({}, document.title, window.location.pathname)
        }
      } catch (error) {
        console.error('Error handling redirect:', error)
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } else {
      // Check for existing accounts
      const accounts = this.msalInstance.getAllAccounts()
      if (accounts.length > 0) {
        this.account = accounts[0] ?? null
      }
    }
  }

  async login(): Promise<AuthenticationResult | null> {
    if (this.isProcessing) {
      return null
    }

    // Check if configured
    if (!this.isConfigured()) {
      throw new Error(
        'Azure AD not configured. Please set VITE_AZURE_CLIENT_ID in your .env file'
      )
    }

    this.isProcessing = true

    try {
      // Use redirect flow instead of popup (avoids popup blocker)
      await this.msalInstance.loginRedirect(loginRequest)
      return null
    } catch (error) {
      console.error('Login redirect failed:', error)
      throw error
    } finally {
      this.isProcessing = false
    }
  }

  async logout(): Promise<void> {
    try {
      await this.msalInstance.logoutRedirect()
    } catch (error) {
      console.error('Logout error:', error)
      this.account = null
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.account) {
      return null
    }

    try {
      const response = await this.msalInstance.acquireTokenSilent({
        ...graphScopes,
        account: this.account,
      })
      return response.accessToken
    } catch (error) {
      console.error('Failed to get token silently:', error)
      this.account = null
      return null
    }
  }

  isAuthenticated(): boolean {
    return this.account !== null
  }

  getAccount(): AccountInfo | null {
    return this.account
  }

  isConfigured(): boolean {
    return !!CLIENT_ID && CLIENT_ID !== 'your-client-id-here'
  }

  getConfig(): { clientId: string; tenantId: string } {
    return {
      clientId: CLIENT_ID,
      tenantId: TENANT_ID,
    }
  }
}

export const authService = new AuthService()
export default authService
