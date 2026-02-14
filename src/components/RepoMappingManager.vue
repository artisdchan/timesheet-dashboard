<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { gitService } from '../services/gitService'
import { encryptionService } from '../services/encryption'
import type { GitAccount, GitRepoMapping, GitRepository } from '../types/git'
import { GIT_PROVIDERS } from '../types/git'

const props = defineProps<{
  microsoftUserId: string
  accounts: GitAccount[]
  plans: Array<{ id: string; title: string }>
  buckets: Array<{ id: string; name: string; planId: string }>
}>()

const emit = defineEmits<{
  mappingsChanged: [mappings: GitRepoMapping[]]
  error: [message: string]
}>()

// State
const mappings = ref<GitRepoMapping[]>([])
const loading = ref(false)
const showAddForm = ref(false)
const editingMapping = ref<GitRepository | null>(null)
const loadingRepos = ref(false)
const availableRepos = ref<GitRepository[]>([])
const passphraseError = ref(false)
// Form state
const formAccountId = ref('')
const formSelectedRepos = ref<string[]>([])
const formPlanId = ref('')
const formBucketId = ref('')
const formBranch = ref('')              // Selected branch for commits
const formImportSince = ref('')
const formCommitPattern = ref('')
const formPassphrase = ref('')
const availableBranches = ref<string[]>([])  // List of branches from selected repo
const loadingBranches = ref(false)

// Computed
const availableBuckets = computed(() => {
  if (!formPlanId.value) return []
  return props.buckets.filter(b => b.planId === formPlanId.value)
})

const hasPassphrase = computed(() => encryptionService.hasValidPassphrase())

// Load mappings on mount
onMounted(async () => {
  await loadMappings()
})

async function loadMappings() {
  loading.value = true
  try {
    mappings.value = await gitService.getRepoMappings(props.microsoftUserId)
    emit('mappingsChanged', mappings.value)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load mappings'
    emit('error', message)
  } finally {
    loading.value = false
  }
}

function resetForm() {
  formAccountId.value = ''
  formSelectedRepos.value = []
  formPlanId.value = ''
  formBucketId.value = ''
  formBranch.value = ''
  formImportSince.value = ''
  formCommitPattern.value = ''
  formPassphrase.value = ''
  passphraseError.value = false
  editingMapping.value = null
  availableRepos.value = []
  availableBranches.value = []
  loadingBranches.value = false
}

function openAddForm() {
  resetForm()
  showAddForm.value = true
  
  // Try to use stored passphrase
  const stored = encryptionService.getStoredPassphrase()
  if (stored) {
    formPassphrase.value = stored
  }
}

function closeForm() {
  showAddForm.value = false
  resetForm()
}

async function fetchRepositories() {
  if (!formAccountId.value) return
  
  const passphrase = formPassphrase.value || encryptionService.getStoredPassphrase()
  if (!passphrase) {
    passphraseError.value = true
    return
  }
  
  passphraseError.value = false
  loadingRepos.value = true
  availableRepos.value = []
  
  try {
    const repos = await gitService.listGitRepositories(
      props.microsoftUserId,
      formAccountId.value,
      passphrase
    )
    availableRepos.value = repos
    
    // Store passphrase if it worked
    if (formPassphrase.value) {
      encryptionService.storePassphrase(formPassphrase.value)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch repositories'
    emit('error', message)
    
    // Clear passphrase if it failed (likely wrong)
    if (formPassphrase.value) {
      passphraseError.value = true
    }
  } finally {
    loadingRepos.value = false
  }
}

async function fetchBranches() {
  if (formSelectedRepos.value.length !== 1) return
  
  const repoFullName = formSelectedRepos.value[0]
  if (!repoFullName) return
  
  const passphrase = formPassphrase.value || encryptionService.getStoredPassphrase()
  if (!passphrase) return
  
  loadingBranches.value = true
  availableBranches.value = []
  
  try {
    const branches = await gitService.listGitBranches(
      props.microsoftUserId,
      formAccountId.value,
      repoFullName,
      passphrase
    )
    availableBranches.value = branches
    
    // Set default branch if available
    const selectedRepo = availableRepos.value.find(r => r.full_name === repoFullName)
    if (selectedRepo && branches.includes(selectedRepo.default_branch)) {
      formBranch.value = selectedRepo.default_branch
    } else if (branches.length > 0) {
      formBranch.value = branches[0] ?? ''
    }
  } catch (err) {
    console.error('Failed to fetch branches:', err)
    // Non-fatal error, user can still type branch manually
    availableBranches.value = []
  } finally {
    loadingBranches.value = false
  }
}

async function handleSubmit() {
  if (!formAccountId.value || formSelectedRepos.value.length === 0 || !formPlanId.value || !formBucketId.value) {
    emit('error', 'Please fill in all required fields')
    return
  }
  
  loading.value = true
  
  try {
    // Create mappings for all selected repositories
    for (const repoFullName of formSelectedRepos.value) {
      const selectedRepo = availableRepos.value.find(r => r.full_name === repoFullName)
      if (!selectedRepo) continue
      
      await gitService.createRepoMapping(props.microsoftUserId, {
        git_account_id: formAccountId.value,
        repo_full_name: selectedRepo.full_name,
        repo_url: selectedRepo.url,
        default_branch: formBranch.value || selectedRepo.default_branch,
        plan_id: formPlanId.value,
        bucket_id: formBucketId.value,
        import_since: formImportSince.value || undefined,
        commit_pattern: formCommitPattern.value || undefined,
      })
    }
    
    await loadMappings()
    closeForm()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create mapping'
    emit('error', message)
  } finally {
    loading.value = false
  }
}

async function handleDelete(mapping: GitRepoMapping) {
  const account = props.accounts.find(a => a.id === mapping.git_account_id)
  const displayName = account?.display_name || 'this account'
  
  if (!confirm(`Delete mapping for "${mapping.repo_full_name}" from ${displayName}?`)) {
    return
  }
  
  loading.value = true
  try {
    await gitService.deleteRepoMapping(props.microsoftUserId, mapping.id)
    await loadMappings()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete mapping'
    emit('error', message)
  } finally {
    loading.value = false
  }
}

function getAccountDisplayName(accountId: string): string {
  const account = props.accounts.find(a => a.id === accountId)
  if (!account) return 'Unknown'
  
  const providerName = GIT_PROVIDERS[account.provider]?.displayName || account.provider
  return `${account.display_name} (${providerName})`
}

function getPlanTitle(planId: string): string {
  const plan = props.plans.find(p => p.id === planId)
  return plan?.title || 'Unknown'
}

function getBucketName(bucketId: string): string {
  const bucket = props.buckets.find(b => b.id === bucketId)
  return bucket?.name || 'Unknown'
}

// Watch for account changes to reset repo selection
watch(formAccountId, () => {
  formSelectedRepos.value = []
  availableRepos.value = []
  availableBranches.value = []
  formBranch.value = ''
})

// Watch for repo selection changes to fetch branches
watch(formSelectedRepos, () => {
  formBranch.value = ''
  availableBranches.value = []
  
  // Fetch branches if exactly one repo is selected
  if (formSelectedRepos.value.length === 1) {
    fetchBranches()
  }
})

// Watch for plan changes to reset bucket selection
watch(formPlanId, () => {
  formBucketId.value = ''
})
</script>

<template>
  <div class="repo-mapping-manager">
    <!-- Header -->
    <div class="manager-header">
      <h3>Repository Mappings</h3>
      <button 
        class="btn-add" 
        @click="openAddForm" 
        :disabled="loading || accounts.length === 0"
      >
        + Map Repository
      </button>
    </div>

    <!-- Empty States -->
    <div v-if="accounts.length === 0" class="empty-state">
      <p>Add a Git account first to map repositories.</p>
    </div>

    <div v-else-if="mappings.length === 0 && !loading" class="empty-state">
      <p>No repository mappings yet.</p>
      <p class="hint">Map repositories to Planner projects to enable Git import.</p>
    </div>

    <div v-else-if="loading && !showAddForm" class="loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Mappings List -->
    <div v-else class="mappings-list">
      <div
        v-for="mapping in mappings"
        :key="mapping.id"
        class="mapping-card"
      >
        <div class="mapping-info">
          <div class="repo-name">
            <svg class="repo-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            {{ mapping.repo_full_name }}
          </div>
          <div class="mapping-details">
            <span class="account">{{ getAccountDisplayName(mapping.git_account_id) }}</span>
            <span class="arrow">→</span>
            <span class="destination">{{ getPlanTitle(mapping.plan_id) }} / {{ getBucketName(mapping.bucket_id) }}</span>
          </div>
          <div v-if="mapping.commit_pattern || mapping.import_since" class="mapping-config">
            <span v-if="mapping.import_since" class="config-item">
              Since: {{ mapping.import_since }}
            </span>
            <span v-if="mapping.commit_pattern" class="config-item">
              Pattern: {{ mapping.commit_pattern }}
            </span>
          </div>
        </div>

        <button class="btn-delete" @click="handleDelete(mapping)">Remove</button>
      </div>
    </div>

    <!-- Add Form Modal -->
    <div v-if="showAddForm" class="form-overlay" @click.self="closeForm">
      <div class="form-modal">
        <header class="form-header">
          <h4>Map Repository to Project</h4>
          <button class="btn-close" @click="closeForm">&times;</button>
        </header>

        <div class="form-body">
          <!-- Passphrase Input (if not stored) -->
          <div v-if="!hasPassphrase" class="form-group">
            <label>Encryption Passphrase *</label>
            <input
              v-model="formPassphrase"
              type="password"
              placeholder="Enter your passphrase"
              class="form-input"
              :class="{ error: passphraseError }"
            />
            <span v-if="passphraseError" class="error-text">
              Invalid passphrase. Please check and try again.
            </span>
            <p class="help-text">
              Required to decrypt your Git token for fetching repositories.
            </p>
          </div>

          <!-- Account Selection -->
          <div class="form-group">
            <label>Git Account *</label>
            <select v-model="formAccountId" class="form-select">
              <option value="">Select an account...</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">
                {{ account.display_name }} ({{ GIT_PROVIDERS[account.provider]?.displayName || account.provider }})
              </option>
            </select>
          </div>

          <!-- Fetch Repos Button -->
          <div v-if="formAccountId && availableRepos.length === 0" class="form-group">
            <button
              type="button"
              class="btn-fetch"
              @click="fetchRepositories"
              :disabled="loadingRepos || (!hasPassphrase && !formPassphrase)"
            >
              <span v-if="loadingRepos" class="spinner-small"></span>
              {{ loadingRepos ? 'Fetching...' : 'Fetch Repositories' }}
            </button>
          </div>

          <!-- Repository Selection -->
          <div v-if="availableRepos.length > 0" class="form-group">
            <label>Repositories ({{ formSelectedRepos.length }} selected) *</label>
            <div class="repos-checklist">
              <label 
                v-for="repo in availableRepos" 
                :key="repo.id" 
                class="repo-checkbox"
                :class="{ selected: formSelectedRepos.includes(repo.full_name) }"
              >
                <input
                  type="checkbox"
                  :value="repo.full_name"
                  v-model="formSelectedRepos"
                />
                <span class="repo-name">{{ repo.full_name }}</span>
              </label>
            </div>
            <p v-if="formSelectedRepos.length === 0" class="hint-text">
              Select at least one repository to map
            </p>
          </div>

          <!-- Branch Selection -->
          <div v-if="formSelectedRepos.length > 0" class="form-group">
            <label>Branch for Import *</label>
            <div class="branch-input-group">
              <select 
                v-if="availableBranches.length > 0" 
                v-model="formBranch" 
                class="form-select"
              >
                <option value="">Select a branch...</option>
                <option v-for="branch in availableBranches" :key="branch" :value="branch">
                  {{ branch }}
                </option>
              </select>
              <input
                v-else
                v-model="formBranch"
                type="text"
                placeholder="Enter branch name (e.g., main, develop)"
                class="form-input"
              />
              <button
                v-if="formSelectedRepos.length === 1 && !loadingBranches"
                type="button"
                class="btn-fetch-branches"
                @click="fetchBranches"
                title="Refresh branches"
              >
                ↻
              </button>
              <span v-if="loadingBranches" class="spinner-small"></span>
            </div>
            <p class="help-text">
              Commits will be fetched from this branch. 
              <span v-if="formSelectedRepos.length > 1">When multiple repos are selected, the default branch of each repo will be used.</span>
            </p>
          </div>

          <!-- Plan Selection -->
          <div class="form-group">
            <label>Planner Project *</label>
            <select v-model="formPlanId" class="form-select">
              <option value="">Select a project...</option>
              <option v-for="plan in plans" :key="plan.id" :value="plan.id">
                {{ plan.title }}
              </option>
            </select>
          </div>

          <!-- Bucket Selection -->
          <div class="form-group">
            <label>Bucket *</label>
            <select v-model="formBucketId" class="form-select" :disabled="!formPlanId">
              <option value="">Select a bucket...</option>
              <option v-for="bucket in availableBuckets" :key="bucket.id" :value="bucket.id">
                {{ bucket.name }}
              </option>
            </select>
          </div>

          <!-- Import Since -->
          <div class="form-group">
            <label>Import Commits Since (optional)</label>
            <input
              v-model="formImportSince"
              type="date"
              class="form-input"
            />
            <p class="help-text">
              Only import commits from this date onwards. Leave blank to import all commits.
            </p>
          </div>

          <!-- Commit Pattern -->
          <div class="form-group">
            <label>Commit Message Pattern (optional)</label>
            <input
              v-model="formCommitPattern"
              type="text"
              placeholder="e.g., ^\[TS-\d+\] or ^feat:"
              class="form-input"
            />
            <p class="help-text">
              Regex pattern to filter commits. Only matching commits will be imported.
            </p>
          </div>
        </div>

        <footer class="form-footer">
          <button type="button" class="btn-secondary" @click="closeForm">Cancel</button>
          <button 
            type="button" 
            class="btn-primary" 
            @click="handleSubmit" 
            :disabled="loading || formSelectedRepos.length === 0 || !formPlanId || !formBucketId"
          >
            {{ loading ? 'Saving...' : `Create ${formSelectedRepos.length || ''} Mapping${formSelectedRepos.length === 1 ? '' : 's'}` }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.repo-mapping-manager {
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

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
  margin-right: 0.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.mappings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mapping-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f7fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.mapping-info {
  flex: 1;
  min-width: 0;
}

.repo-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 0.375rem;
}

.repo-icon {
  width: 18px;
  height: 18px;
  color: #667eea;
}

.mapping-details {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #718096;
  flex-wrap: wrap;
}

.mapping-details .account {
  color: #667eea;
  font-weight: 500;
}

.mapping-details .arrow {
  color: #a0aec0;
}

.mapping-details .destination {
  color: #48bb78;
}

.mapping-config {
  display: flex;
  gap: 1rem;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #a0aec0;
}

.btn-delete {
  padding: 0.375rem 0.75rem;
  background: #fff5f5;
  color: #e53e3e;
  border: 1px solid #fc8181;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
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

.help-text {
  font-size: 0.8rem;
  color: #718096;
  margin: 0.5rem 0 0;
}

.btn-fetch {
  width: 100%;
  padding: 0.75rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-fetch:hover:not(:disabled) {
  background: #5a67d8;
}

.btn-fetch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

/* Repository Checklist */
.repos-checklist {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.5rem;
  background: white;
}

.repo-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.repo-checkbox:hover {
  background: #f7fafc;
}

.repo-checkbox.selected {
  background: #ebf8ff;
}

.repo-checkbox input[type="checkbox"] {
  cursor: pointer;
}

.repo-checkbox .repo-name {
  font-size: 0.875rem;
  color: #2d3748;
  font-weight: 500;
  margin: 0;
}

.hint-text {
  font-size: 0.8rem;
  color: #a0aec0;
  margin: 0.5rem 0 0;
}

/* Branch Input Group */
.branch-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.branch-input-group .form-select,
.branch-input-group .form-input {
  flex: 1;
}

.btn-fetch-branches {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
}

.btn-fetch-branches:hover {
  background: #5a67d8;
}

@media (max-width: 600px) {
  .form-modal {
    max-height: 100vh;
    border-radius: 0;
  }
  
  .mapping-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  
  .mapping-details .arrow {
    display: none;
  }
}
</style>
