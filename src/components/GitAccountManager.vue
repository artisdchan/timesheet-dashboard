<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { gitService } from '../services/gitService'
import { encryptionService } from '../services/encryption'
import { GIT_PROVIDERS, type GitProvider, type GitAccount } from '../types/git'

const props = defineProps<{
  microsoftUserId: string
}>()

const emit = defineEmits<{
  accountsChanged: [accounts: GitAccount[]]
  error: [message: string]
}>()

// State
const accounts = ref<GitAccount[]>([])
const loading = ref(false)
const showAddForm = ref(false)
const editingAccount = ref<GitAccount | null>(null)
const testingToken = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// Form state
const formProvider = ref<GitProvider>('github')
const formDisplayName = ref('')
const formToken = ref('')
const formBaseUrl = ref('')
const formUsername = ref('')
const formPassphrase = ref('')
const formConfirmPassphrase = ref('')

// Validation errors
const formErrors = ref<Record<string, string>>({})

// Computed
const isSelfHosted = computed(() => {
  return GIT_PROVIDERS[formProvider.value]?.supportsSelfHosted ?? false
})

const providerOptions = computed(() => Object.values(GIT_PROVIDERS))

// Load accounts on mount
onMounted(async () => {
  await loadAccounts()
})

async function loadAccounts() {
  loading.value = true
  try {
    accounts.value = await gitService.getGitAccounts(props.microsoftUserId)
    emit('accountsChanged', accounts.value)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load accounts'
    emit('error', message)
  } finally {
    loading.value = false
  }
}

function resetForm() {
  formProvider.value = 'github'
  formDisplayName.value = ''
  formToken.value = ''
  formBaseUrl.value = ''
  formUsername.value = ''
  formPassphrase.value = ''
  formConfirmPassphrase.value = ''
  formErrors.value = {}
  testResult.value = null
}

function openAddForm() {
  resetForm()
  showAddForm.value = true
  editingAccount.value = null
}

function openEditForm(account: GitAccount) {
  editingAccount.value = account
  formProvider.value = account.provider
  formDisplayName.value = account.display_name
  formBaseUrl.value = account.base_url || ''
  formUsername.value = account.username || ''
  formToken.value = '' // Don't show encrypted token
  formPassphrase.value = ''
  formConfirmPassphrase.value = ''
  formErrors.value = {}
  showAddForm.value = true
}

function closeForm() {
  showAddForm.value = false
  editingAccount.value = null
  resetForm()
}

function validateForm(): boolean {
  const errors: Record<string, string> = {}

  if (!formDisplayName.value.trim()) {
    errors.displayName = 'Display name is required'
  }

  if (!editingAccount.value && !formToken.value.trim()) {
    errors.token = 'Token is required for new accounts'
  }

  if (isSelfHosted.value && !formBaseUrl.value.trim()) {
    errors.baseUrl = 'Base URL is required for self-hosted'
  }

  if (!editingAccount.value) {
    if (!formPassphrase.value) {
      errors.passphrase = 'Passphrase is required'
    } else if (formPassphrase.value.length < 8) {
      errors.passphrase = 'Passphrase must be at least 8 characters'
    }

    if (formPassphrase.value !== formConfirmPassphrase.value) {
      errors.confirmPassphrase = 'Passphrases do not match'
    }
  }

  formErrors.value = errors
  return Object.keys(errors).length === 0
}

async function testToken() {
  if (!formToken.value) return

  testingToken.value = true
  testResult.value = null

  try {
    const { validateGitToken } = await import('../services/gitProviders')
    const result = await validateGitToken(formProvider.value, formToken.value, {
      isSelfHosted: isSelfHosted.value,
      baseUrl: formBaseUrl.value || undefined,
    })

    if (result.valid) {
      testResult.value = { success: true, message: `Valid! Username: ${result.username}` }
      if (!formDisplayName.value && result.username) {
        formDisplayName.value = result.username
      }
    } else {
      testResult.value = { success: false, message: result.error || 'Invalid token' }
    }
  } catch (err) {
    testResult.value = { success: false, message: 'Failed to test token' }
  } finally {
    testingToken.value = false
  }
}

async function handleSubmit() {
  if (!validateForm()) return

  loading.value = true

  try {
    if (editingAccount.value) {
      // Update existing account
      await gitService.updateGitAccount(
        props.microsoftUserId,
        editingAccount.value.id,
        {
          displayName: formDisplayName.value,
          token: formToken.value || undefined,
          isActive: true,
        },
        formPassphrase.value || encryptionService.getStoredPassphrase() || undefined
      )
    } else {
      // Create new account
      await gitService.addGitAccount(
        props.microsoftUserId,
        {
          provider: formProvider.value,
          display_name: formDisplayName.value,
          is_self_hosted: isSelfHosted.value,
          base_url: isSelfHosted.value ? formBaseUrl.value : undefined,
          username: formUsername.value || undefined,
          token: formToken.value,
        },
        formPassphrase.value
      )

      // Store passphrase for this session
      encryptionService.storePassphrase(formPassphrase.value)
    }

    await loadAccounts()
    closeForm()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save account'
    emit('error', message)
  } finally {
    loading.value = false
  }
}

async function handleDelete(account: GitAccount) {
  if (!confirm(`Delete "${account.display_name}"? This will also delete all repository mappings.`)) {
    return
  }

  loading.value = true
  try {
    await gitService.deleteGitAccount(props.microsoftUserId, account.id)
    await loadAccounts()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete account'
    emit('error', message)
  } finally {
    loading.value = false
  }
}



function getProviderDisplayName(provider: GitProvider): string {
  return GIT_PROVIDERS[provider]?.displayName || provider
}
</script>

<template>
  <div class="git-account-manager">
    <!-- Header -->
    <div class="manager-header">
      <h3>Git Accounts</h3>
      <button class="btn-add" @click="openAddForm" :disabled="loading">
        + Add Account
      </button>
    </div>

    <!-- Accounts List -->
    <div v-if="accounts.length === 0 && !loading" class="empty-state">
      <p>No Git accounts connected.</p>
      <p class="hint">Add your GitHub, GitLab, or self-hosted Git accounts to import commits.</p>
    </div>

    <div v-else-if="loading && !showAddForm" class="loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <div v-else class="accounts-list">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="account-card"
        :class="{ inactive: !account.is_active }"
      >
        <div class="account-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <!-- GitHub Icon -->
            <path v-if="account.provider === 'github' || account.provider === 'github_enterprise'"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
            <!-- GitLab Icon -->
            <path v-else-if="account.provider === 'gitlab' || account.provider === 'gitlab_self_hosted'"
              d="M12 21.35l3.18-9.79h-6.36L12 21.35zM4.8 11.56L12 21.35l-4.8-14.79L2.23 8.14l2.57 3.42zM19.2 11.56L12 21.35l4.8-14.79 5.97 1.38-2.57 3.42z"
            />
            <!-- Generic Git Icon -->
            <path v-else
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
            />
          </svg>
        </div>

        <div class="account-info">
          <div class="account-name">{{ account.display_name }}</div>
          <div class="account-meta">
            <span class="provider-badge">{{ getProviderDisplayName(account.provider) }}</span>
            <span v-if="account.is_self_hosted && account.base_url" class="base-url">
              {{ account.base_url }}
            </span>
            <span v-if="account.username" class="username">@{{ account.username }}</span>
          </div>
        </div>

        <div class="account-actions">
          <button class="btn-edit" @click="openEditForm(account)">Edit</button>
          <button class="btn-delete" @click="handleDelete(account)">Delete</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Form Modal -->
    <div v-if="showAddForm" class="form-overlay" @click.self="closeForm">
      <div class="form-modal">
        <header class="form-header">
          <h4>{{ editingAccount ? 'Edit Account' : 'Add Git Account' }}</h4>
          <button class="btn-close" @click="closeForm">&times;</button>
        </header>

        <div class="form-body">
          <!-- Provider Selection (only for new accounts) -->
          <div v-if="!editingAccount" class="form-group">
            <label>Provider</label>
            <select v-model="formProvider" class="form-select">
              <option v-for="option in providerOptions" :key="option.type" :value="option.type">
                {{ option.displayName }}
              </option>
            </select>
          </div>

          <!-- Display Name -->
          <div class="form-group">
            <label>Display Name *</label>
            <input
              v-model="formDisplayName"
              type="text"
              placeholder="e.g., Work GitHub, Company GitLab"
              class="form-input"
              :class="{ error: formErrors.displayName }"
            />
            <span v-if="formErrors.displayName" class="error-text">{{ formErrors.displayName }}</span>
          </div>

          <!-- Self-hosted URL -->
          <div v-if="isSelfHosted" class="form-group">
            <label>Base URL *</label>
            <input
              v-model="formBaseUrl"
              type="url"
              placeholder="https://git.company.com"
              class="form-input"
              :class="{ error: formErrors.baseUrl }"
            />
            <span v-if="formErrors.baseUrl" class="error-text">{{ formErrors.baseUrl }}</span>
          </div>

          <!-- Username (for GitLab mostly) -->
          <div class="form-group">
            <label>Username (optional)</label>
            <input
              v-model="formUsername"
              type="text"
              placeholder="Your Git username"
              class="form-input"
            />
          </div>

          <!-- Token -->
          <div class="form-group">
            <label>
              {{ editingAccount ? 'Token (leave blank to keep current)' : 'Personal Access Token *' }}
            </label>
            <div class="token-input-group">
              <input
                v-model="formToken"
                type="password"
                :placeholder="editingAccount ? '••••••••' : 'ghp_xxx or glpat-xxx'"
                class="form-input"
                :class="{ error: formErrors.token }"
              />
              <button
                v-if="!editingAccount && formToken"
                type="button"
                class="btn-test"
                @click="testToken"
                :disabled="testingToken"
              >
                {{ testingToken ? 'Testing...' : 'Test' }}
              </button>
            </div>
            <span v-if="formErrors.token" class="error-text">{{ formErrors.token }}</span>
            <span v-if="testResult" class="test-result" :class="{ success: testResult.success }">
              {{ testResult.message }}
            </span>
            <p class="help-text">
              Create token at:
              <a v-if="formProvider === 'github'" href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a>
              <a v-else-if="formProvider === 'gitlab'" href="https://gitlab.com/-/profile/personal_access_tokens" target="_blank">gitlab.com/-/profile/personal_access_tokens</a>
              <span v-else>your Git provider settings</span>
              <br>
              <strong>Scopes:</strong> {{ formProvider.startsWith('github') ? 'repo (full control of private repositories)' : 'read_api, read_repository' }}
            </p>
          </div>

          <!-- Passphrase (only for new accounts or when changing token) -->
          <div v-if="!editingAccount || formToken" class="form-group">
            <label>Encryption Passphrase *</label>
            <input
              v-model="formPassphrase"
              type="password"
              placeholder="Min 8 characters"
              class="form-input"
              :class="{ error: formErrors.passphrase }"
            />
            <span v-if="formErrors.passphrase" class="error-text">{{ formErrors.passphrase }}</span>
            <p class="help-text">
              This passphrase encrypts your token. You'll need it to import commits.
              It's stored securely in your browser session.
            </p>
          </div>

          <!-- Confirm Passphrase (only for new accounts) -->
          <div v-if="!editingAccount" class="form-group">
            <label>Confirm Passphrase *</label>
            <input
              v-model="formConfirmPassphrase"
              type="password"
              placeholder="Re-enter passphrase"
              class="form-input"
              :class="{ error: formErrors.confirmPassphrase }"
            />
            <span v-if="formErrors.confirmPassphrase" class="error-text">{{ formErrors.confirmPassphrase }}</span>
          </div>
        </div>

        <footer class="form-footer">
          <button type="button" class="btn-secondary" @click="closeForm">Cancel</button>
          <button type="button" class="btn-primary" @click="handleSubmit" :disabled="loading">
            {{ loading ? 'Saving...' : (editingAccount ? 'Update' : 'Add Account') }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.git-account-manager {
  background: white;
  border-radius: 8px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.manager-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.btn-add {
  padding: 0.5rem 1rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
}

.btn-add:hover:not(:disabled) {
  background: #38a169;
}

.btn-add:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #718096;
  background: #f7fafc;
  border-radius: 8px;
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 0.875rem;
  margin-top: 0.5rem;
  color: #a0aec0;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  color: #718096;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f7fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.account-card.inactive {
  opacity: 0.6;
}

.account-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  color: #667eea;
}

.account-icon svg {
  width: 24px;
  height: 24px;
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 0.25rem;
}

.account-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.provider-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #667eea;
  color: white;
  border-radius: 4px;
  text-transform: uppercase;
}

.base-url,
.username {
  font-size: 0.8rem;
  color: #718096;
}

.account-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-edit,
.btn-delete {
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  border: none;
}

.btn-edit {
  background: #ebf8ff;
  color: #3182ce;
}

.btn-edit:hover {
  background: #bee3f8;
}

.btn-delete {
  background: #fff5f5;
  color: #e53e3e;
}

.btn-delete:hover {
  background: #fed7d7;
}

/* Form Modal */
.form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 1rem;
}

.form-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.form-header h4 {
  margin: 0;
  font-size: 1.1rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #718096;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: #2d3748;
}

.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #4a5568;
  margin-bottom: 0.375rem;
}

.form-input,
.form-select {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input.error {
  border-color: #e53e3e;
}

.error-text {
  font-size: 0.8rem;
  color: #e53e3e;
  margin-top: 0.25rem;
  display: block;
}

.token-input-group {
  display: flex;
  gap: 0.5rem;
}

.token-input-group .form-input {
  flex: 1;
}

.btn-test {
  padding: 0.5rem 1rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}

.btn-test:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  font-size: 0.8rem;
  margin-top: 0.5rem;
  display: block;
}

.test-result.success {
  color: #48bb78;
}

.test-result:not(.success) {
  color: #e53e3e;
}

.help-text {
  font-size: 0.8rem;
  color: #718096;
  margin: 0.5rem 0 0;
}

.help-text a {
  color: #667eea;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
}

.btn-secondary {
  padding: 0.625rem 1.25rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-secondary:hover {
  background: #f7fafc;
}

.btn-primary {
  padding: 0.625rem 1.25rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-primary:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .form-modal {
    max-height: 100vh;
    border-radius: 0;
  }
}
</style>
