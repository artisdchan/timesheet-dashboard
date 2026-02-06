<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { format, parseISO, startOfDay, isSameDay } from 'date-fns'

interface GitCommit {
  sha: string
  message: string
  date: string
  repo: string
  repoFullName: string
  author: string
  url: string
}

interface DraftEntry {
  id: string
  date: Date
  repo: string
  repoFullName: string
  message: string
  hours: number
  selected: boolean
  commits: GitCommit[]
}

const props = defineProps<{
  repos: Array<{
    id: string
    name: string
    fullName: string
    provider: string
    token: string
    gitlabUrl?: string
    commitAuthor?: string // To filter commits
    mappedPlanId?: string
    mappedBucketId?: string
    autoCalculate: boolean
    defaultHours: number
  }>
  plans: Array<{ id: string; title: string }>
  buckets: Array<{ id: string; name: string; planId: string }>
}>()

const emit = defineEmits<{
  import: [entries: Array<{ projectId: string; bucketId: string; description: string; hours: number[]; date: Date }>]
  close: []
}>()

const loading = ref(false)
const error = ref('')
const sinceDate = ref(format(new Date(), 'yyyy-MM-dd'))
const commits = ref<GitCommit[]>([])
const draftEntries = ref<DraftEntry[]>([])

// Group commits by date and repo, calculate hours
function processCommits(commitsList: GitCommit[]) {
  const grouped = new Map<string, GitCommit[]>()
  
  // Group by date + repo
  for (const commit of commitsList) {
    const date = startOfDay(parseISO(commit.date))
    const key = `${format(date, 'yyyy-MM-dd')}_${commit.repo}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(commit)
  }
  
  // Create draft entries
  const entries: DraftEntry[] = []
  for (const [key, repoCommits] of grouped) {
    const [dateStr, repo] = key.split('_')
    const date = parseISO(dateStr!)
    const repoConfig = props.repos.find(r => r.name === repo)
    
    const hours = repoConfig?.autoCalculate 
      ? calculateHours(repoCommits)
      : repoConfig?.defaultHours || 2
    
    entries.push({
      id: key,
      date,
      repo: repo!,
      repoFullName: repoCommits[0]!.repoFullName,
      message: repoCommits.map(c => c.message.split('\n')[0]).join(', '),
      hours,
      selected: true,
      commits: repoCommits
    })
  }
  
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
}

function calculateHours(commits: GitCommit[]): number {
  if (commits.length === 0) return 0
  if (commits.length === 1) return 2
  
  // Sort by time
  const sorted = [...commits].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  
  let totalMinutes = 0
  const MAX_MINUTES = 4 * 60 // Cap at 4 hours per gap
  const MIN_MINUTES = 15     // Minimum 15 min per commit
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = new Date(sorted[i]!.date).getTime()
    const next = new Date(sorted[i + 1]!.date).getTime()
    const diffMinutes = (next - current) / (1000 * 60)
    
    // Cap at 4 hours, minimum 15 minutes
    const minutes = Math.min(Math.max(diffMinutes, MIN_MINUTES), MAX_MINUTES)
    totalMinutes += minutes
  }
  
  // Add 30 min for last commit
  totalMinutes += 30
  
  // Round to nearest 0.5 hour, cap at 8 hours
  return Math.min(Math.round(totalMinutes / 30) * 0.5, 8)
}

async function fetchCommits() {
  loading.value = true
  error.value = ''
  commits.value = []
  
  console.log('[DEBUG] Fetching commits for repos:', props.repos.length)
  
  // Only fetch from mapped repos (have mappedPlanId)
  const mappedRepos = props.repos.filter(r => r.mappedPlanId && r.token)
  console.log('[DEBUG] Mapped repos with tokens:', mappedRepos.length)
  console.log('[DEBUG] Repos:', mappedRepos.map(r => ({ 
    name: r.name, 
    mappedPlanId: r.mappedPlanId,
    commitAuthor: r.commitAuthor 
  })))
  
  try {
    const allCommits: GitCommit[] = []
    
    for (const repo of mappedRepos) {
      console.log('[DEBUG] Fetching from repo:', repo.name, 'author filter:', repo.commitAuthor)
      
      if (repo.provider === 'github') {
        const since = new Date(sinceDate.value).toISOString()
        // Fetch all commits, filter by author client-side
        const res = await fetch(
          `https://api.github.com/repos/${repo.fullName}/commits?since=${since}&per_page=100`,
          { headers: { Authorization: `token ${repo.token}` } }
        )
        
        if (!res.ok) {
          console.warn(`Failed to fetch ${repo.fullName}:`, res.statusText)
          continue
        }
        
        const data = await res.json()
        console.log(`[DEBUG] GitHub ${repo.name}: fetched ${data.length} commits`)
        if (data.length > 0) {
          console.log(`[DEBUG] Sample commit authors:`, data.slice(0, 3).map((c: any) => c.commit?.author?.name))
          console.log(`[DEBUG] Filtering for author: "${repo.commitAuthor}"`)
        }
        
        // Filter by commit author name client-side
        const filtered = data.filter((c: any) => {
          const authorName = c.commit?.author?.name || ''
          const shouldInclude = !repo.commitAuthor || 
            authorName.toLowerCase().includes(repo.commitAuthor.toLowerCase())
          if (!shouldInclude) {
            console.log(`[DEBUG] Filtering out: author="${authorName}" !== "${repo.commitAuthor}"`)
          }
          return shouldInclude
        })
        console.log(`[DEBUG] After filtering: ${filtered.length} commits`)
        
        allCommits.push(...filtered.map((c: any) => ({
          sha: c.sha,
          message: c.commit.message,
          date: c.commit.author.date,
          repo: repo.name,
          repoFullName: repo.fullName,
          author: c.commit.author.name,
          url: c.html_url
        })))
      } else if (repo.provider === 'gitlab') {
        const since = new Date(sinceDate.value).toISOString()
        const baseUrl = repo.gitlabUrl || 'https://gitlab.com'
        
        // Fetch all commits from all branches, filter by author client-side
        const projectPath = encodeURIComponent(repo.fullName)
        const url = `${baseUrl}/api/v4/projects/${projectPath}/repository/commits?since=${since}&per_page=100&all=true`
        console.log(`[DEBUG] Fetching from URL:`, url)
        
        const res = await fetch(url, { headers: { 'PRIVATE-TOKEN': repo.token } })
        
        console.log(`[DEBUG] Response status:`, res.status, res.statusText)
        
        if (!res.ok) {
          const errorText = await res.text()
          console.error(`[DEBUG] Failed to fetch ${repo.fullName}:`, res.status, errorText)
          continue
        }
        
        const data = await res.json()
        console.log(`[DEBUG] GitLab ${repo.name}: response type:`, Array.isArray(data) ? 'array' : typeof data)
        console.log(`[DEBUG] GitLab ${repo.name}: fetched ${data.length || 0} commits`)
        if (data.length > 0) {
          console.log(`[DEBUG] Sample commit authors:`, data.slice(0, 3).map((c: any) => c.author_name))
          console.log(`[DEBUG] Filtering for author: "${repo.commitAuthor}"`)
        }
        
        // Filter by commit author name client-side
        const filtered = data.filter((c: any) => {
          const authorName = c.author_name || ''
          const shouldInclude = !repo.commitAuthor || 
            authorName.toLowerCase().includes(repo.commitAuthor.toLowerCase())
          if (!shouldInclude) {
            console.log(`[DEBUG] Filtering out: author="${authorName}" !== "${repo.commitAuthor}"`)
          }
          return shouldInclude
        })
        console.log(`[DEBUG] After filtering: ${filtered.length} commits`)
        
        allCommits.push(...filtered.map((c: any) => ({
          sha: c.id,
          message: c.message,
          date: c.committed_date,
          repo: repo.name,
          repoFullName: repo.fullName,
          author: c.author_name,
          url: c.web_url
        })))
      }
    }
    
    commits.value = allCommits
    draftEntries.value = processCommits(allCommits)
    
    console.log('[DEBUG] Total commits fetched:', allCommits.length)
    
    if (allCommits.length === 0 && mappedRepos.length > 0) {
      console.log(`[DEBUG] No commits matched. Check console above for available authors.`)
      error.value = `No commits found for author "${mappedRepos[0]?.commitAuthor || 'unknown'}". Check browser console (F12) to see available authors, then update your author name in ⚙️ Git Settings.`
    }
    
    // Smart review: if any day > 8h, show warning
    const dailyTotals = new Map<string, number>()
    for (const entry of draftEntries.value) {
      const dateKey = format(entry.date, 'yyyy-MM-dd')
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + entry.hours)
    }
    
    const highDays = Array.from(dailyTotals.entries())
      .filter(([_, hours]) => hours > 8)
      .map(([date]) => date)
    
    if (highDays.length > 0) {
      error.value = `⚠️ High hours detected on: ${highDays.join(', ')}. Please review.`
    }
    
  } catch (err: any) {
    console.error('[DEBUG] Fetch error:', err)
    error.value = `Failed to fetch commits: ${err.message}`
    console.error(err)
  } finally {
    loading.value = false
  }
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
    const repo = props.repos.find(r => r.name === entry.repo)
    const projectId = repo?.mappedPlanId || ''
    const bucketId = repo?.mappedBucketId || ''
    
    return {
      projectId,
      bucketId,
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

onMounted(() => {
  if (props.repos.length > 0) {
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
      
      <!-- No repos configured -->
      <div v-if="props.repos.length === 0" class="empty-state">
        <p>No Git repositories configured.</p>
        <p>Go to <strong>⚙️ Git Settings</strong> to add your GitHub or GitLab accounts.</p>
      </div>
      
      <!-- No mapped repos -->
      <div v-else-if="!props.repos.some(r => r.mappedPlanId)" class="empty-state">
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
                    {{ entry.commits.length }} commit{{ entry.commits.length > 1 ? 's' : '' }}
                  </div>
                </div>
                
                <div class="entry-hours-control">
                  <button 
                    class="btn-adjust" 
                    @click="adjustHours(entry, -0.5)"
                    :disabled="entry.hours <= 0.5"
                  >-</button>
                  <span class="hours-value" :class="{ 'auto-calc': entry.commits.length > 1 }">
                    {{ entry.hours }}h
                  </span>
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
      <div v-else-if="!loading && commits.length === 0" class="empty-state">
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

.hours-value.auto-calc {
  color: #667eea;
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
