<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { format, parseISO, startOfDay, isSameDay } from 'date-fns'
import { gitService } from '../services/gitService'
import { encryptionService } from '../services/encryption'
import type { GitAccount, GitRepoMapping, GitCommit } from '../types/git'
import PassphrasePrompt from './PassphrasePrompt.vue'

interface GitCommitStats {
  filesChanged: number
  additions: number
  deletions: number
  totalLines: number
}

interface DraftEntry {
  id: string
  date: Date
  repo: string
  repoFullName: string
  message: string
  hours: number
  selected: boolean
  commit: GitCommit
  stats: GitCommitStats
}

const props = defineProps<{
  microsoftUserId: string
  accounts: GitAccount[]
  mappings: GitRepoMapping[]
  plans: Array<{ id: string; title: string }>
  buckets: Array<{ id: string; name: string; planId: string }>
}>()

const emit = defineEmits<{
  import: [entries: Array<{ projectId: string; bucketId: string; description: string; hours: number[]; date: Date }>]
  close: []
}>()

// State
const loading = ref(false)
const error = ref('')
const sinceDate = ref(format(new Date(), 'yyyy-MM-dd'))
const commits = ref<GitCommit[]>([])
const draftEntries = ref<DraftEntry[]>([])
const showPassphrasePrompt = ref(false)

// Process commits - create one draft entry per commit
async function processCommits(commitsList: GitCommit[], mapping: GitRepoMapping) {
  const entries: DraftEntry[] = []
  const account = props.accounts.find(a => a.id === mapping.git_account_id)
  
  for (const commit of commitsList) {
    const date = startOfDay(commit.committer_date || commit.author_date)
    
    // Fetch commit stats if auto-calculate is enabled
    let stats: GitCommitStats | null = null
    // TODO: Add auto-calculate option to mapping
    const autoCalculate = false
    
    if (autoCalculate && account) {
      // This would need a method to fetch individual commit stats
      // For now, we'll skip detailed stats
      stats = null
    }
    
    // Use fetched stats or default
    const finalStats: GitCommitStats = stats || {
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      totalLines: 0
    }
    
    // Default hours (could be configurable per mapping)
    const hours = 1
    
    entries.push({
      id: `${commit.sha}_${format(date, 'yyyy-MM-dd')}`,
      date,
      repo: mapping.repo_full_name,
      repoFullName: mapping.repo_full_name,
      message: commit.message.split('\n')[0] || '',
      hours,
      selected: true,
      commit: commit,
      stats: finalStats
    })
  }
  
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
}

async function fetchCommitsWithPassphrase(passphrase?: string) {
  const effectivePassphrase = passphrase || encryptionService.getStoredPassphrase()
  
  if (!effectivePassphrase) {
    showPassphrasePrompt.value = true
    return
  }
  
  loading.value = true
  error.value = ''
  commits.value = []
  draftEntries.value = []
  
  console.log('[DEBUG] Fetching commits for user:', props.microsoftUserId)
  
  try {
    const since = sinceDate.value ? startOfDay(parseISO(sinceDate.value)) : undefined
    
    // Use the new function that:
    // 1. Gets Microsoft user ID
    // 2. Finds all git_accounts for that user
    // 3. Finds all git_repo_mappings for those accounts
    // 4. Fetches commits from each mapped repository
    const results = await gitService.fetchCommitsForUser(
      props.microsoftUserId,
      effectivePassphrase,
      { since }
    )
    
    console.log('[DEBUG] Fetched commits from', results.length, 'repositories')
    
    // Process all commits into draft entries
    const allDraftEntries: DraftEntry[] = []
    
    for (const result of results) {
      if (result.commits.length > 0) {
        const entries = await processCommits(result.commits, result.mapping)
        allDraftEntries.push(...entries)
      }
    }
    
    draftEntries.value = allDraftEntries
    
    console.log('[DEBUG] Total entries:', allDraftEntries.length)
    
    if (allDraftEntries.length === 0 && results.length > 0) {
      error.value = 'No commits found. Try adjusting the date range or check your repository permissions.'
    }
    
    // Smart review: if any day > 8h, show warning
    const dailyTotals = new Map<string, number>()
    for (const entry of draftEntries.value) {
      if (entry.selected) {
        const dateKey = format(entry.date, 'yyyy-MM-dd')
        dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + entry.hours)
      }
    }
    
    const highDays = Array.from(dailyTotals.entries())
      .filter(([_, hours]) => hours > 8)
      .map(([date]) => date)
    
    if (highDays.length > 0) {
      error.value = `⚠️ High hours detected on: ${highDays.join(', ')}. Please review.`
    }
    
    // Store passphrase if it worked
    if (passphrase) {
      encryptionService.storePassphrase(passphrase)
    }
    
  } catch (err: any) {
    console.error('[DEBUG] Fetch error:', err)
    
    // Check if it's a decryption error
    if (err.message?.includes('decrypt') || err.message?.includes('password') || err.message?.includes('passphrase')) {
      error.value = 'Failed to decrypt Git token. Please check your passphrase.'
      encryptionService.clearStoredPassphrase()
      showPassphrasePrompt.value = true
    } else {
      error.value = `Failed to fetch commits: ${err.message}`
    }
  } finally {
    loading.value = false
  }
}

async function fetchCommits() {
  await fetchCommitsWithPassphrase()
}

function handlePassphraseSubmit(passphrase: string) {
  showPassphrasePrompt.value = false
  fetchCommitsWithPassphrase(passphrase)
}

function handlePassphraseCancel() {
  showPassphrasePrompt.value = false
  loading.value = false
}

function toggleAllInDay(date: Date, selected: boolean) {
  for (const entry of draftEntries.value) {
    if (isSameDay(entry.date, date)) {
      entry.selected = selected
    }
  }
}

function adjustHours(entry: DraftEntry, delta: number) {
  const newHours = entry.hours + delta
  if (newHours >= 0.5 && newHours <= 8) {
    entry.hours = newHours
  }
}

// Convert single hour number to array (for multi-category support)
function hoursToArray(hours: number): number[] {
  // Break down into available chunks: 4, 3, 2, 1, 0.5
  const result: number[] = []
  let remaining = hours
  
  const chunks = [8, 7, 6, 5, 4, 3, 2, 1, 0.5]
  for (const chunk of chunks) {
    while (remaining >= chunk) {
      result.push(chunk)
      remaining -= chunk
    }
  }
  
  return result.length > 0 ? result : [hours]
}

function handleImport() {
  const selected = draftEntries.value.filter(e => e.selected)
  
  const entries = selected.map(entry => {
    // Find the mapping for this repo to get plan/bucket
    const mapping = props.mappings.find(m => m.repo_full_name === entry.repoFullName)
    
    return {
      projectId: mapping?.plan_id || '',
      bucketId: mapping?.bucket_id || '',
      description: entry.message,
      hours: hoursToArray(entry.hours),
      date: entry.date
    }
  }).filter(e => e.projectId && e.bucketId)
  
  emit('import', entries)
}

// Group by date for display
const entriesByDate = computed(() => {
  const grouped = new Map<string, { date: Date; entries: DraftEntry[]; totalHours: number }>()
  
  for (const entry of draftEntries.value) {
    const dateKey = format(entry.date, 'yyyy-MM-dd')
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { date: entry.date, entries: [], totalHours: 0 })
    }
    const group = grouped.get(dateKey)!
    group.entries.push(entry)
    group.totalHours += entry.selected ? entry.hours : 0
  }
  
  return Array.from(grouped.values()).sort((a, b) => b.date.getTime() - a.date.getTime())
})

const totalSelectedHours = computed(() => 
  draftEntries.value
    .filter(e => e.selected)
    .reduce((sum, e) => sum + e.hours, 0)
)

const totalEntries = computed(() => draftEntries.value.length)
const selectedCount = computed(() => draftEntries.value.filter(e => e.selected).length)

const hasPassphrase = computed(() => encryptionService.hasValidPassphrase())

onMounted(() => {
  // Auto-fetch if we have mappings and passphrase
  if (props.mappings.length > 0 && hasPassphrase.value) {
    fetchCommits()
  }
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content git-import">
      <header class="modal-header">
        <h2>Import from Git</h2>
        <button class="btn-close" @click="emit('close')">&times;</button>
      </header>
      
      <!-- Date Range -->
      <div class="date-range">
        <label>Since:</label>
        <input type="date" v-model="sinceDate" />
        <button class="btn-fetch" @click="fetchCommits" :disabled="loading">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? 'Fetching...' : 'Fetch Commits' }}
        </button>
      </div>
      
      <!-- Error/Warning -->
      <div v-if="error" class="alert" :class="{ warning: error.includes('⚠️') }">
        {{ error }}
      </div>
      
      <!-- No accounts configured -->
      <div v-if="accounts.length === 0" class="empty-state">
        <p>No Git accounts configured.</p>
        <p>Go to <strong>⚙️ Git Settings</strong> to add your Git accounts.</p>
      </div>
      
      <!-- No mappings configured -->
      <div v-else-if="mappings.length === 0" class="empty-state">
        <p>No repositories mapped to projects.</p>
        <p>Go to <strong>⚙️ Git Settings</strong> and map your repositories to Planner projects.</p>
      </div>
      
      <!-- Results -->
      <div v-else-if="draftEntries.length > 0" class="results">
        <div class="summary">
          {{ selectedCount }} of {{ totalEntries }} entries selected
          ({{ totalSelectedHours.toFixed(1) }}h total)
        </div>
        
        <div class="entries-by-day">
          <div v-for="day in entriesByDate" :key="day.date.toISOString()" class="day-group">
            <div class="day-header">
              <label class="day-checkbox">
                <input 
                  type="checkbox" 
                  :checked="day.entries.every(e => e.selected)"
                  @change="toggleAllInDay(day.date, ($event.target as HTMLInputElement).checked)"
                />
                <strong>{{ format(day.date, 'EEEE, MMMM d') }}</strong>
              </label>
              <span class="day-total" :class="{ 'over-8': day.totalHours > 8 }">
                {{ day.totalHours.toFixed(1) }}h
              </span>
            </div>
            
            <div class="day-entries">
              <div 
                v-for="entry in day.entries" 
                :key="entry.id"
                class="entry-row"
                :class="{ selected: entry.selected }"
              >
                <input 
                  type="checkbox" 
                  v-model="entry.selected"
                  class="entry-checkbox"
                />
                
                <div class="entry-info">
                  <div class="entry-repo">{{ entry.repo }}</div>
                  <div class="entry-message" :title="entry.message">
                    {{ entry.message.length > 60 ? entry.message.slice(0, 60) + '...' : entry.message }}
                  </div>
                  <div class="entry-commits">
                    <a 
                      :href="entry.commit.url" 
                      target="_blank" 
                      rel="noopener" 
                      class="commit-link"
                      @click.stop
                    >
                      {{ entry.commit.sha.substring(0, 7) }}
                    </a>
                  </div>
                </div>
                
                <div class="entry-hours-control">
                  <button 
                    class="btn-adjust" 
                    @click="adjustHours(entry, -0.5)"
                    :disabled="entry.hours <= 0.5"
                  >-</button>
                  <span class="hours-value">{{ entry.hours }}h</span>
                  <button 
                    class="btn-adjust" 
                    @click="adjustHours(entry, 0.5)"
                    :disabled="entry.hours >= 8"
                  >+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-else-if="!loading && !showPassphrasePrompt" class="empty-state">
        No commits found. Adjust the date range and try again.
      </div>
      
      <!-- Footer -->
      <footer class="modal-footer">
        <button class="btn-secondary" @click="emit('close')">Cancel</button>
        <button 
          class="btn-primary" 
          @click="handleImport"
          :disabled="selectedCount === 0"
        >
          Import {{ selectedCount }} Entries
        </button>
      </footer>
    </div>
  </div>

  <!-- Passphrase Prompt -->
  <PassphrasePrompt
    :show="showPassphrasePrompt"
    title="Enter Encryption Passphrase"
    message="Your Git token is encrypted. Enter your passphrase to decrypt it and fetch commits."
    @submit="handlePassphraseSubmit"
    @cancel="handlePassphraseCancel"
  />
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
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

/* Date Range */
.date-range {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.date-range label {
  color: #4a5568;
  font-size: 0.875rem;
}

.date-range input {
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.btn-fetch {
  margin-left: auto;
  padding: 0.5rem 1rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-fetch:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Alert */
.alert {
  padding: 0.75rem 1rem;
  background: #fed7d7;
  color: #c53030;
  font-size: 0.875rem;
}

.alert.warning {
  background: #fefcbf;
  color: #744210;
}

/* Results */
.results {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.summary {
  padding: 0.5rem 0.75rem;
  background: #f7fafc;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #4a5568;
}

/* Day Group */
.day-group {
  margin-bottom: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f7fafc;
  border-bottom: 1px solid #e2e8f0;
}

.day-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.day-checkbox input {
  cursor: pointer;
}

.day-total {
  font-weight: 700;
  color: #48bb78;
}

.day-total.over-8 {
  color: #dd6b20;
}

/* Entry Row */
.day-entries {
  padding: 0.5rem;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 6px;
  transition: background 0.2s;
}

.entry-row:hover {
  background: #f7fafc;
}

.entry-row:not(.selected) {
  opacity: 0.6;
}

.entry-checkbox {
  cursor: pointer;
}

.entry-info {
  flex: 1;
  min-width: 0;
}

.entry-repo {
  font-size: 0.75rem;
  font-weight: 600;
  color: #667eea;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.entry-message {
  font-size: 0.875rem;
  color: #2d3748;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-commits {
  font-size: 0.75rem;
  color: #718096;
  margin-top: 0.25rem;
}

.commit-link {
  color: #667eea;
  text-decoration: none;
  font-family: monospace;
  background: #edf2f7;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.commit-link:hover {
  background: #e2e8f0;
}

.entry-hours-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-adjust {
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  color: #4a5568;
}

.btn-adjust:hover:not(:disabled) {
  border-color: #667eea;
  color: #667eea;
}

.btn-adjust:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hours-value {
  font-weight: 700;
  color: #2d3748;
  min-width: 40px;
  text-align: center;
}

/* Empty State */
.empty-state {
  padding: 3rem;
  text-align: center;
  color: #718096;
}

/* Footer */
.modal-footer {
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
  font-weight: 600;
}

.btn-primary {
  padding: 0.625rem 1.25rem;
  background: #48bb78;
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

@media (max-width: 600px) {
  .modal-content {
    max-height: 100vh;
    border-radius: 0;
  }
  
  .date-range {
    flex-wrap: wrap;
  }
  
  .btn-fetch {
    margin-left: 0;
    width: 100%;
    justify-content: center;
  }
}
</style>
