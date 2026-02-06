<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface GitAccount {
  id: string
  provider: 'github' | 'gitlab' | 'bitbucket'
  username: string
  token: string
  gitlabUrl?: string
  commitAuthor?: string // Git commit author name to filter commits
}

interface GitRepo {
  id: string
  name: string
  fullName: string
  provider: string
  gitlabUrl?: string // For self-hosted GitLab
  mappedPlanId?: string
  mappedBucketId?: string
  autoCalculate: boolean
  defaultHours: number
}

const props = defineProps<{
  plans: Array<{ id: string; title: string }>
  buckets: Array<{ id: string; name: string; planId: string }>
}>()

const accounts = ref<GitAccount[]>([])
const repos = ref<GitRepo[]>([])
const showAddAccount = ref(false)
const selectedProvider = ref<'github' | 'gitlab'>('github')
const tokenInput = ref('')
const gitlabUrl = ref('https://gitlab.com') // For self-hosted GitLab
const commitAuthorInput = ref('') // Git commit author name
const loadingRepos = ref(false)
const fetchError = ref('')
const editingAccountId = ref<string | null>(null)

// Load from localStorage on mount
onMounted(() => {
  const savedAccounts = localStorage.getItem('git_accounts')
  const savedRepos = localStorage.getItem('git_repos')
  if (savedAccounts) accounts.value = JSON.parse(savedAccounts)
  if (savedRepos) repos.value = JSON.parse(savedRepos)
  
  // Migration: Add gitlabUrl and commitAuthor to existing data
  let needsAccountSave = false
  let needsRepoSave = false
  
  for (const account of accounts.value) {
    // Set default commitAuthor if missing
    if (!account.commitAuthor) {
      account.commitAuthor = account.username
      needsAccountSave = true
    }
  }
  
  for (const repo of repos.value) {
    if (repo.provider === 'gitlab' && !repo.gitlabUrl) {
      // Find matching account
      const account = accounts.value.find((a: GitAccount) => 
        a.provider === 'gitlab' && a.username === repo.fullName.split('/')[0]
      )
      if (account?.gitlabUrl) {
        repo.gitlabUrl = account.gitlabUrl
        needsRepoSave = true
      }
    }
  }
  
  if (needsAccountSave) saveAccounts()
  if (needsRepoSave) saveRepos()
  
  // Auto-fetch repos if we have accounts but no repos
  if (accounts.value.length > 0 && repos.value.length === 0) {
    fetchAllRepos()
  }
})

function saveAccounts() {
  localStorage.setItem('git_accounts', JSON.stringify(accounts.value))
}

function saveRepos() {
  localStorage.setItem('git_repos', JSON.stringify(repos.value))
}

async function addAccount() {
  if (!tokenInput.value.trim()) return
  
  // Validate token by fetching user info
  try {
    const username = await validateToken(selectedProvider.value, tokenInput.value)
    
    // Include gitlabUrl and commitAuthor
    const newAccount: GitAccount = {
      id: `${selectedProvider.value}_${Date.now()}`,
      provider: selectedProvider.value,
      username,
      token: tokenInput.value,
      gitlabUrl: selectedProvider.value === 'gitlab' ? getGitLabBaseUrl() : undefined,
      commitAuthor: commitAuthorInput.value.trim() || username // Default to username
    }
    
    console.log('[DEBUG] Adding account:', { 
      provider: newAccount.provider,
      gitlabUrl: newAccount.gitlabUrl 
    })
    
    accounts.value.push(newAccount)
    saveAccounts()
    
    // Auto-fetch repos
    await fetchRepos(newAccount)
    
    tokenInput.value = ''
    gitlabUrl.value = 'https://gitlab.com'
    commitAuthorInput.value = ''
    showAddAccount.value = false
  } catch (err: any) {
    console.error('[DEBUG] Error:', err)
    alert(`Failed: ${err.message}`)
  }
}

function getGitLabBaseUrl(): string {
  // Remove trailing slash
  return gitlabUrl.value.replace(/\/$/, '')
}

async function validateToken(provider: string, token: string): Promise<string> {
  if (provider === 'github') {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` }
    })
    if (!res.ok) throw new Error('Invalid token')
    const data = await res.json()
    return data.login
  } else if (provider === 'gitlab') {
    const baseUrl = getGitLabBaseUrl()
    const res = await fetch(`${baseUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token }
    })
    if (!res.ok) throw new Error(`Invalid token or URL: ${res.status}`)
    const data = await res.json()
    return data.username
  }
  return ''
}

async function fetchRepos(account: GitAccount) {
  if (account.provider === 'github') {
    const res = await fetch('https://api.github.com/user/repos?per_page=100', {
      headers: { Authorization: `token ${account.token}` }
    })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    const data = await res.json()
    
    const newRepos: GitRepo[] = data.map((r: any) => ({
      id: `github_${r.id}`,
      name: r.name,
      fullName: r.full_name,
      provider: 'github',
      url: r.html_url,
      autoCalculate: true,
      defaultHours: 2
    }))
    
    // Merge with existing repo configs
    newRepos.forEach((newRepo: GitRepo) => {
      const existing = repos.value.find(r => r.id === newRepo.id)
      if (!existing) {
        repos.value.push(newRepo)
      }
    })
    saveRepos()
  } else if (account.provider === 'gitlab') {
    const baseUrl = account.gitlabUrl || 'https://gitlab.com'
    console.log('[DEBUG] GitLab baseUrl:', baseUrl)
    
    const res = await fetch(`${baseUrl}/api/v4/projects?membership=true&per_page=100`, {
      headers: { 'PRIVATE-TOKEN': account.token }
    })
    if (!res.ok) throw new Error(`GitLab API error: ${res.status}`)
    const data = await res.json()
    
    const newRepos: GitRepo[] = data.map((r: any) => ({
      id: `gitlab_${r.id}`,
      name: r.name,
      fullName: r.path_with_namespace,
      provider: 'gitlab',
      url: r.web_url,
      gitlabUrl: baseUrl, // Store the GitLab URL for matching
      autoCalculate: true,
      defaultHours: 2
    }))
    
    // Merge with existing repo configs
    newRepos.forEach((newRepo: GitRepo) => {
      const existing = repos.value.find(r => r.id === newRepo.id)
      if (!existing) {
        repos.value.push(newRepo)
      }
    })
    saveRepos()
  }
}

async function fetchAllRepos() {
  loadingRepos.value = true
  fetchError.value = ''
  
  for (const account of accounts.value) {
    try {
      await fetchRepos(account)
    } catch (err: any) {
      console.error(`Failed to fetch repos for ${account.username}:`, err)
      fetchError.value = `Failed to fetch repos for ${account.username}: ${err.message}`
    }
  }
  
  loadingRepos.value = false
}

function removeAccount(id: string) {
  accounts.value = accounts.value.filter(a => a.id !== id)
  saveAccounts()
}

function startEditAuthor(account: GitAccount) {
  editingAccountId.value = account.id
  commitAuthorInput.value = account.commitAuthor || account.username
}

function saveAuthorEdit() {
  const account = accounts.value.find(a => a.id === editingAccountId.value)
  if (account) {
    account.commitAuthor = commitAuthorInput.value.trim() || account.username
    saveAccounts()
  }
  editingAccountId.value = null
  commitAuthorInput.value = ''
}

function cancelEditAuthor() {
  editingAccountId.value = null
  commitAuthorInput.value = ''
}

function getAvailableBuckets(planId: string) {
  return props.buckets.filter(b => b.planId === planId)
}

const providerIcons: Record<string, string> = {
  github: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z',
  gitlab: 'M12 21.35l3.18-9.79h-6.36L12 21.35zM4.8 11.56L12 21.35l-4.8-14.79L2.23 8.14l2.57 3.42zM19.2 11.56L12 21.35l4.8-14.79 5.97 1.38-2.57 3.42z'
}
</script>

<template>
  <div class="git-settings">
    <h2>Git Integration</h2>
    
    <!-- Connected Accounts -->
    <section class="section">
      <h3>Connected Accounts</h3>
      <div v-if="accounts.length === 0" class="empty-state">
        No accounts connected. Add your first Git provider below.
      </div>
      <div v-else class="accounts-list">
        <div v-for="account in accounts" :key="account.id" class="account-card">
          <!-- View Mode -->
          <template v-if="editingAccountId !== account.id">
            <div class="account-info">
              <svg class="provider-icon" viewBox="0 0 24 24" fill="currentColor">
                <path :d="providerIcons[account.provider]" />
              </svg>
              <div class="account-details">
                <span class="username">{{ account.username }}</span>
                <span v-if="account.provider === 'gitlab' && account.gitlabUrl" class="gitlab-url">
                  {{ account.gitlabUrl }}
                </span>
                <span v-if="account.commitAuthor" class="commit-author">
                  Author: {{ account.commitAuthor }}
                </span>
                <span v-else class="commit-author" style="color: #e53e3e;">
                  Author: {{ account.username }} (click Edit to change)
                </span>
              </div>
            </div>
            <div class="account-actions">
              <button class="btn-edit" @click="startEditAuthor(account)">Edit Author</button>
              <button class="btn-remove" @click="removeAccount(account.id)">Remove</button>
            </div>
          </template>
          
          <!-- Edit Mode -->
          <template v-else>
            <div class="edit-author-form">
              <label>Commit Author Name:</label>
              <input 
                v-model="commitAuthorInput" 
                type="text" 
                placeholder="e.g., Nuttapol Chot"
              />
              <div class="edit-actions">
                <button class="btn-secondary" @click="cancelEditAuthor">Cancel</button>
                <button class="btn-primary" @click="saveAuthorEdit">Save</button>
              </div>
            </div>
          </template>
        </div>
      </div>
      
      <button v-if="!showAddAccount" class="btn-add" @click="showAddAccount = true">
        + Add Account
      </button>
      
      <div v-else class="add-account-form">
        <select v-model="selectedProvider">
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
        </select>
        <input 
          v-if="selectedProvider === 'gitlab'"
          v-model="gitlabUrl" 
          type="url" 
          placeholder="GitLab URL (e.g., https://gitlab.company.com)"
        />
        <input 
          v-model="tokenInput" 
          type="password" 
          placeholder="Personal Access Token"
        />
        <input 
          v-model="commitAuthorInput" 
          type="text" 
          placeholder="Git Commit Author Name (optional, defaults to username)"
        />
        <div class="form-actions">
          <button class="btn-secondary" @click="showAddAccount = false">Cancel</button>
          <button class="btn-primary" @click="addAccount" :disabled="!tokenInput">
            Connect
          </button>
        </div>
        <p class="help-text">
          Create a token at 
          <a v-if="selectedProvider === 'github'" href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
          <span v-else>
            <template v-if="gitlabUrl === 'https://gitlab.com'">
              <a href="https://gitlab.com/-/profile/personal_access_tokens" target="_blank">gitlab.com/-/profile/personal_access_tokens</a>
            </template>
            <template v-else>
              {{ gitlabUrl }}/-/profile/personal_access_tokens
            </template>
          </span>
          with scope: <strong>{{ selectedProvider === 'github' ? 'repo' : 'read_api, read_repository' }}</strong>
          <span v-if="selectedProvider === 'gitlab'" class="url-hint"><br>For self-hosted GitLab, enter your custom URL above.</span>
        </p>
      </div>
    </section>
    
    <!-- Repository Mappings -->
    <section class="section">
      <div class="section-header">
        <h3>Repository Mappings</h3>
        <button 
          v-if="accounts.length > 0" 
          class="btn-refresh" 
          @click="fetchAllRepos"
          :disabled="loadingRepos"
        >
          <span v-if="loadingRepos" class="spinner"></span>
          {{ loadingRepos ? 'Loading...' : 'Refresh Repos' }}
        </button>
      </div>
      <div v-if="repos.length === 0" class="empty-state">
        <span v-if="accounts.length === 0">Connect an account to see your repositories.</span>
        <span v-else-if="loadingRepos">Loading repositories...</span>
        <span v-else>No repositories found. Click "Refresh Repos" to fetch.</span>
      </div>
      <div v-if="fetchError" class="error-message">
        {{ fetchError }}
      </div>
      <div v-else class="repos-list">
        <div v-for="repo in repos" :key="repo.id" class="repo-card">
          <div class="repo-header">
            <span class="repo-name">{{ repo.name }}</span>
            <span class="repo-provider">{{ repo.provider }}</span>
          </div>
          <div class="repo-config">
            <div class="form-group">
              <label>Map to Project</label>
              <select v-model="repo.mappedPlanId" @change="saveRepos">
                <option value="">-- Select Project --</option>
                <option v-for="plan in plans" :key="plan.id" :value="plan.id">
                  {{ plan.title }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Default Bucket</label>
              <select v-model="repo.mappedBucketId" @change="saveRepos" :disabled="!repo.mappedPlanId">
                <option value="">-- Select Bucket --</option>
                <option v-for="bucket in getAvailableBuckets(repo.mappedPlanId || '')" :key="bucket.id" :value="bucket.id">
                  {{ bucket.name }}
                </option>
              </select>
            </div>
            <div class="form-row">
              <label class="checkbox">
                <input type="checkbox" v-model="repo.autoCalculate" @change="saveRepos" />
                Auto-calculate hours
              </label>
              <div v-if="!repo.autoCalculate" class="form-group small">
                <label>Default hours</label>
                <input type="number" v-model.number="repo.defaultHours" min="0.5" max="8" step="0.5" @change="saveRepos" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.git-settings {
  padding: 1.5rem;
  max-width: 800px;
}

h2 {
  margin: 0 0 1.5rem 0;
  color: #2d3748;
}

h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #4a5568;
}

.section {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1rem;
  border: 1px solid #e2e8f0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  margin: 0;
}

.btn-refresh {
  padding: 0.375rem 0.75rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-refresh:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-refresh:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  color: #718096;
  font-style: italic;
  padding: 1rem 0;
}

.error-message {
  color: #e53e3e;
  background: #fff5f5;
  border: 1px solid #fc8181;
  border-radius: 6px;
  padding: 0.75rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
}

/* Accounts */
.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.account-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f7fafc;
  border-radius: 6px;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.account-details {
  display: flex;
  flex-direction: column;
}

.gitlab-url {
  font-size: 0.75rem;
  color: #718096;
}

.commit-author {
  font-size: 0.75rem;
  color: #48bb78;
}

.provider-icon {
  width: 24px;
  height: 24px;
  color: #4a5568;
}

.username {
  font-weight: 600;
  color: #2d3748;
}

.provider {
  color: #718096;
  font-size: 0.875rem;
  text-transform: capitalize;
}

.account-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-edit {
  padding: 0.375rem 0.75rem;
  background: #ebf8ff;
  color: #3182ce;
  border: 1px solid #90cdf4;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-edit:hover {
  background: #bee3f8;
}

.btn-remove {
  padding: 0.375rem 0.75rem;
  background: #fff5f5;
  color: #e53e3e;
  border: 1px solid #fc8181;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.edit-author-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-author-form label {
  font-size: 0.875rem;
  color: #4a5568;
}

.edit-author-form input {
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.875rem;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-add {
  padding: 0.625rem 1rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

/* Add Account Form */
.add-account-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: #f7fafc;
  border-radius: 6px;
}

.add-account-form select,
.add-account-form input {
  padding: 0.625rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.help-text {
  margin: 0;
  font-size: 0.8rem;
  color: #718096;
}

.help-text a {
  color: #667eea;
}

.url-hint {
  color: #dd6b20;
  font-style: italic;
}

/* Repositories */
.repos-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.repo-card {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 1rem;
}

.repo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.repo-name {
  font-weight: 600;
  color: #2d3748;
}

.repo-provider {
  font-size: 0.75rem;
  color: #718096;
  text-transform: uppercase;
  padding: 0.25rem 0.5rem;
  background: #edf2f7;
  border-radius: 4px;
}

.repo-config {
  display: grid;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-size: 0.875rem;
  color: #4a5568;
}

.form-group select,
.form-group input {
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.875rem;
}

.form-group select:disabled {
  background: #f7fafc;
  color: #a0aec0;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.form-group.small {
  width: 100px;
}

.form-group.small input {
  width: 100%%;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #4a5568;
  cursor: pointer;
}

.checkbox input {
  cursor: pointer;
}
</style>
