<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { format, startOfWeek, endOfWeek, addWeeks } from 'date-fns'
import type { TimeEntry, PlannerPlan, PlannerBucket } from '../types/planner'

const props = defineProps<{
  entries: TimeEntry[]
  plans: PlannerPlan[]
  buckets: PlannerBucket[]
  allTasks: TimeEntry[]
  selectedPlanId: string | null
  selectedBucketId: string | null
  loading: boolean
}>()

const emit = defineEmits<{
  'update:selectedPlanId': [planId: string | null]
  'update:selectedBucketId': [bucketId: string | null]
  'refresh': []
  'logout': []
  'createTask': []
}>()

// Current week view state - stores the week start date being viewed
const currentViewWeekStart = ref<Date | null>(null)

// Initialize current week when entries change
watch(() => props.entries, (entries) => {
  console.log('Entries changed:', entries.length)
  if (entries.length > 0 && !currentViewWeekStart.value) {
    // Default to most recent task's week
    const mostRecentDate = entries[0]?.date
    if (mostRecentDate) {
      currentViewWeekStart.value = startOfWeek(mostRecentDate, { weekStartsOn: 1 })
      console.log('Set current week to:', currentViewWeekStart.value)
    }
  }
}, { immediate: true })

// Watch for plan change - reset week view
watch(() => props.selectedPlanId, () => {
  currentViewWeekStart.value = null
})

const selectedPlan = computed(() => 
  props.plans.find(p => p.id === props.selectedPlanId)
)

const selectedBucket = computed(() => 
  props.buckets.find(b => b.id === props.selectedBucketId)
)

// Get current week being viewed
const currentWeekStart = computed(() => {
  if (currentViewWeekStart.value) {
    return currentViewWeekStart.value
  }
  // Default to current real week
  return startOfWeek(new Date(), { weekStartsOn: 1 })
})

const currentWeekEnd = computed(() => {
  return endOfWeek(currentWeekStart.value, { weekStartsOn: 1 })
})

const weekLabel = computed(() => {
  return `${format(currentWeekStart.value, 'MMM dd')} - ${format(currentWeekEnd.value, 'MMM dd, yyyy')}`
})

// Filter entries for current week
const weekEntries = computed(() => {
  const start = currentWeekStart.value
  const end = currentWeekEnd.value
  
  console.log('Filtering entries for week:', format(start, 'yyyy-MM-dd'), 'to', format(end, 'yyyy-MM-dd'))
  console.log('Total entries to filter:', props.entries.length)
  
  const filtered = props.entries.filter(entry => {
    const entryDate = entry.date
    return entryDate >= start && entryDate <= end
  })
  
  console.log('Filtered entries:', filtered.length)
  return filtered
})

// Group by day
const weekDays = computed(() => {
  const days = []
  const start = currentWeekStart.value
  
  for (let i = 0; i < 7; i++) {
    const date = addWeeks(start, 0)
    date.setDate(start.getDate() + i)
    
    const dayEntries = weekEntries.value.filter(e => 
      format(e.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    )
    
    days.push({
      date,
      dateStr: format(date, 'yyyy-MM-dd'),
      dayName: format(date, 'EEEE'),
      entries: dayEntries,
      totalHours: dayEntries.reduce((sum, e) => sum + e.hours, 0)
    })
  }
  
  return days
})

const totalHoursThisWeek = computed(() => {
  return weekEntries.value.reduce((sum, e) => sum + e.hours, 0)
})

const totalHoursAll = computed(() => {
  return props.entries.reduce((sum, e) => sum + e.hours, 0)
})

// Bucket stats
const bucketStats = computed(() => {
  const stats = new Map<string, { count: number; hours: number }>()
  
  for (const task of props.allTasks) {
    const bucketName = task.bucketName || 'Unknown'
    const current = stats.get(bucketName) || { count: 0, hours: 0 }
    stats.set(bucketName, {
      count: current.count + 1,
      hours: current.hours + task.hours
    })
  }
  
  return Array.from(stats.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.hours - a.hours)
})

function formatHours(hours: number): string {
  if (hours === 0) return '0h'
  const whole = Math.floor(hours)
  const decimal = hours % 1
  if (decimal === 0) return `${whole}h`
  const minutes = Math.round(decimal * 60)
  return `${whole}h ${minutes}m`
}

function formatDate(date: Date): string {
  return format(date, 'dd/MM/yyyy')
}

function getPriorityLabel(priority: number): string {
  if (priority <= 1) return 'Urgent'
  if (priority <= 4) return 'Important'
  if (priority <= 7) return 'Medium'
  return 'Low'
}

function getPriorityClass(priority: number): string {
  if (priority <= 1) return 'priority-urgent'
  if (priority <= 4) return 'priority-important'
  if (priority <= 7) return 'priority-medium'
  return 'priority-low'
}

function navigateWeek(direction: 'prev' | 'next') {
  if (!currentViewWeekStart.value) {
    currentViewWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
  }
  
  const newWeek = addWeeks(currentViewWeekStart.value, direction === 'prev' ? -1 : 1)
  currentViewWeekStart.value = newWeek
  
  console.log('Navigated to week:', format(newWeek, 'yyyy-MM-dd'))
}

function goToCurrentWeek() {
  currentViewWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
  console.log('Reset to current week')
}

function isCurrentWeek(): boolean {
  const now = new Date()
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 })
  return currentWeekStart.value ? format(currentWeekStart.value, 'yyyy-MM-dd') === format(thisWeekStart, 'yyyy-MM-dd') : false
}

function onPlanChange(planId: string) {
  emit('update:selectedPlanId', planId || null)
}

function onBucketChange(bucketId: string) {
  emit('update:selectedBucketId', bucketId || null)
}

function selectBucketByName(bucketName: string) {
  const bucket = props.buckets.find(b => b.name === bucketName)
  if (bucket) {
    emit('update:selectedBucketId', bucket.id)
  }
}
</script>

<template>
  <div class="timesheet-container">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>Timesheet Dashboard</h1>
        <span class="subtitle">Microsoft Planner Integration</span>
      </div>
      
      <div class="header-actions">
        <button 
          v-if="selectedPlanId"
          class="btn-create" 
          @click="emit('createTask')"
          :disabled="loading"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Task
        </button>

        <button class="btn-icon" @click="emit('refresh')" :disabled="loading || !selectedPlanId">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: loading }">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>

        <button class="btn-icon logout" @click="emit('logout')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Project & Bucket Selection -->
    <div class="selection-bar">
      <div class="select-group">
        <label>Project</label>
        <select 
          :value="selectedPlanId || ''" 
          @change="e => onPlanChange((e.target as HTMLSelectElement).value)"
          class="plan-select"
        >
          <option value="">Select a project...</option>
          <option v-for="plan in plans" :key="plan.id" :value="plan.id">
            {{ plan.title }}
          </option>
        </select>
      </div>

      <div class="select-group" v-if="selectedPlanId && buckets.length > 0">
        <label>Bucket</label>
        <select 
          :value="selectedBucketId || ''" 
          @change="e => onBucketChange((e.target as HTMLSelectElement).value)"
          class="bucket-select"
        >
          <option value="">All Buckets ({{ allTasks.length }} tasks)</option>
          <option v-for="bucket in buckets" :key="bucket.id" :value="bucket.id">
            {{ bucket.name }}
          </option>
        </select>
      </div>

      <div v-if="selectedPlanId && entries.length > 0" class="selection-summary">
        <span class="total-badge">{{ formatHours(totalHoursAll) }}</span>
        <span class="task-count">{{ entries.length }} tasks</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>

    <!-- Select Project Prompt -->
    <div v-else-if="!selectedPlanId" class="prompt-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
      <h3>Select a Project</h3>
      <p>Choose a project from the dropdown above to view its buckets.</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="entries.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <h3>No tasks found</h3>
      <p v-if="selectedBucketId">
        No tasks in bucket "{{ selectedBucket?.name }}".
      </p>
      <p v-else>
        No tasks in project "{{ selectedPlan?.title }}".
      </p>
    </div>

    <!-- Tasks View -->
    <template v-else>
      <!-- Bucket Stats -->
      <div v-if="!selectedBucketId && bucketStats.length > 0" class="bucket-stats">
        <div 
          v-for="stat in bucketStats" 
          :key="stat.name"
          class="bucket-stat-card"
          @click="selectBucketByName(stat.name)"
        >
          <span class="stat-name">{{ stat.name }}</span>
          <span class="stat-hours">{{ formatHours(stat.hours) }}</span>
          <span class="stat-count">{{ stat.count }} tasks</span>
        </div>
      </div>

      <!-- Week Navigation -->
      <div class="week-nav">
        <button @click="navigateWeek('prev')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        
        <div class="week-info">
          <h2>{{ weekLabel }}</h2>
          <span class="total-hours">{{ formatHours(totalHoursThisWeek) }}</span>
        </div>
        
        <button @click="navigateWeek('next')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <button v-if="!isCurrentWeek()" class="btn-today" @click="goToCurrentWeek">
          Today
        </button>
      </div>

      <!-- Daily View -->
      <div class="content-area">
        <div class="days-list">
          <div 
            v-for="day in weekDays" 
            :key="day.dateStr"
            class="day-section"
            :class="{ 'is-today': new Date().toDateString() === day.date.toDateString() }"
          >
            <div class="day-header-row">
              <div class="day-title">
                <span class="day-name">{{ day.dayName }}</span>
                <span class="day-date">{{ formatDate(day.date) }}</span>
              </div>
              <span v-if="day.totalHours > 0" class="day-total">{{ formatHours(day.totalHours) }}</span>
            </div>
            
            <div class="day-entries-list">
              <div 
                v-for="entry in day.entries" 
                :key="entry.id"
                class="task-card"
                :class="{ completed: entry.isCompleted }"
              >
                <div class="task-header">
                  <div class="task-badges">
                    <!-- Show bucket name when viewing all buckets -->
                    <span v-if="!selectedBucketId && entry.bucketName" class="badge bucket">
                      {{ entry.bucketName }}
                    </span>
                    <span v-if="entry.categoryLabel" class="badge hours">{{ entry.categoryLabel }}</span>
                    <span :class="['badge', 'priority', getPriorityClass(entry.priority)]">
                      {{ getPriorityLabel(entry.priority) }}
                    </span>
                    <span v-if="entry.isCompleted" class="badge status completed">Done</span>
                    <span v-else class="badge status inprogress">In Progress</span>
                  </div>
                  <span class="task-hours">{{ formatHours(entry.hours) }}</span>
                </div>
                
                <div class="task-body">
                  <p class="task-title">{{ entry.title }}</p>
                </div>
              </div>
              
              <div v-if="day.entries.length === 0" class="no-entries">
                No tasks for this day
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.timesheet-container {
  min-height: 100vh;
  background: #f5f7fa;
}

/* Header */
.header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left h1 {
  margin: 0;
  font-size: 1.25rem;
  color: #1a202c;
}

.header-left .subtitle {
  font-size: 0.8rem;
  color: #718096;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-create:hover {
  background: #38a169;
}

.btn-create:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-create svg {
  width: 16px;
  height: 16px;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  color: #4a5568;
}

.btn-icon:hover {
  background: #f7fafc;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon.logout:hover {
  color: #e53e3e;
  border-color: #e53e3e;
}

.btn-icon svg {
  width: 18px;
  height: 18px;
}

.btn-icon svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Selection Bar */
.selection-bar {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.select-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.select-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #4a5568;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.plan-select,
.bucket-select {
  padding: 0.625rem 0.875rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
  min-width: 200px;
}

.plan-select:focus,
.bucket-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.selection-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  padding: 0.5rem 0;
}

.total-badge {
  padding: 0.4rem 0.875rem;
  background: #667eea;
  color: white;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 700;
}

.task-count {
  font-size: 0.85rem;
  color: #718096;
}

/* Bucket Stats */
.bucket-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: #f7fafc;
  border-bottom: 1px solid #e2e8f0;
}

.bucket-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.bucket-stat-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.stat-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.25rem;
}

.stat-hours {
  font-size: 1.1rem;
  font-weight: 700;
  color: #667eea;
}

.stat-count {
  font-size: 0.7rem;
  color: #718096;
}

/* Week Navigation */
.week-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.week-nav button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  color: #4a5568;
}

.week-nav button:hover {
  background: #f7fafc;
  border-color: #cbd5e0;
}

.week-nav button svg {
  width: 20px;
  height: 20px;
}

.week-info {
  text-align: center;
  min-width: 200px;
}

.week-info h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #1a202c;
}

.week-info .total-hours {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.25rem 0.75rem;
  background: #667eea;
  color: white;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.btn-today {
  padding: 0.4rem 0.75rem !important;
  width: auto !important;
  font-size: 0.8rem;
  color: #667eea !important;
}

/* Loading, Prompt, Empty States */
.loading, .prompt-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: #718096;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.prompt-state svg,
.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 1rem;
  color: #cbd5e0;
}

.prompt-state h3,
.empty-state h3 {
  margin: 0 0 0.5rem 0;
  color: #2d3748;
}

.prompt-state p,
.empty-state p {
  margin: 0;
  max-width: 400px;
  text-align: center;
}

/* Content Area */
.content-area {
  padding: 1.5rem;
}

/* Daily View */
.days-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.day-section {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.day-section.is-today {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.day-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #f7fafc;
  border-bottom: 1px solid #e2e8f0;
}

.day-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.day-name {
  font-weight: 600;
  color: #2d3748;
  font-size: 1rem;
}

.day-date {
  color: #718096;
  font-size: 0.875rem;
}

.day-total {
  padding: 0.35rem 0.75rem;
  background: #667eea;
  color: white;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
}

.day-entries-list {
  padding: 1rem;
}

/* Task Card */
.task-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1rem;
  transition: all 0.2s;
}

.task-card:last-child {
  margin-bottom: 0;
}

.task-card.completed {
  background: #f7fafc;
  opacity: 0.85;
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.task-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.badge.bucket {
  background: #ebf8ff;
  color: #2b6cb0;
}

.badge.hours {
  background: #f0fff4;
  color: #276749;
}

.badge.priority {
  background: #fefcbf;
  color: #975a16;
}

.badge.priority.priority-urgent {
  background: #fed7d7;
  color: #c53030;
}

.badge.priority.priority-important {
  background: #feebc8;
  color: #c05621;
}

.badge.priority.priority-medium {
  background: #e9d8fd;
  color: #6b46c1;
}

.badge.priority.priority-low {
  background: #e2e8f0;
  color: #4a5568;
}

.badge.status.completed {
  background: #c6f6d5;
  color: #276749;
}

.badge.status.inprogress {
  background: #bee3f8;
  color: #2c5282;
}

.task-hours {
  font-size: 1.1rem;
  font-weight: 700;
  color: #667eea;
}

.task-body {
  margin-bottom: 0.75rem;
}

.task-title {
  margin: 0;
  font-size: 0.95rem;
  color: #2d3748;
  line-height: 1.5;
  word-break: break-word;
}

.no-entries {
  text-align: center;
  padding: 2rem;
  color: #a0aec0;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
    justify-content: flex-end;
  }
  
  .selection-bar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .select-group {
    width: 100%;
  }
  
  .plan-select,
  .bucket-select {
    width: 100%;
  }
  
  .selection-summary {
    margin-left: 0;
    justify-content: space-between;
    width: 100%;
  }
  
  .bucket-stats {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding: 1rem;
  }
  
  .task-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .task-badges {
    width: 100%;
  }
  
  .task-hours {
    align-self: flex-end;
  }
}
</style>
