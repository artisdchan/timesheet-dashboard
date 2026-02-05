<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns'
import type { TimeEntry, PlannerPlan, PlannerBucket } from '../types/planner'

const props = defineProps<{
  entries: TimeEntry[]
  plans: PlannerPlan[]
  buckets: PlannerBucket[]
  loading: boolean
}>()

const emit = defineEmits<{
  'addEntry': [entry: { projectId: string; bucketId: string; description: string; hours: number; date: Date }]
  'refresh': []
  'logout': []
}>()

// Current date being viewed
const currentDate = ref(new Date())

// New entry form
const showAddForm = ref(false)
const selectedProjectId = ref('')
const selectedBucketId = ref('')
const description = ref('')
const hours = ref(2)
const entryDate = ref(new Date())

// Filter buckets by selected project
const availableBuckets = computed(() => {
  if (!selectedProjectId.value) return []
  return props.buckets.filter(b => b.planId === selectedProjectId.value)
})

// Date input value (YYYY-MM-DD format for input type="date")
const dateInputValue = computed({
  get: () => format(entryDate.value, 'yyyy-MM-dd'),
  set: (value: string) => {
    entryDate.value = new Date(value + 'T00:00:00')
  }
})

// Watch when project changes - auto-select first bucket
watch(selectedProjectId, (newProjectId) => {
  if (newProjectId) {
    const projectBuckets = props.buckets.filter(b => b.planId === newProjectId)
    if (projectBuckets.length > 0) {
      selectedBucketId.value = projectBuckets[0]?.id || ''
    }
  } else {
    selectedBucketId.value = ''
  }
})

// Filter entries for current date
const dayEntries = computed(() => {
  const dateStr = format(currentDate.value, 'yyyy-MM-dd')
  return props.entries.filter(entry => 
    format(entry.date, 'yyyy-MM-dd') === dateStr
  )
})

// Total hours for the day
const totalHours = computed(() => {
  return dayEntries.value.reduce((sum, e) => sum + e.hours, 0)
})

// Hours by project
const hoursByProject = computed(() => {
  const stats = new Map<string, number>()
  for (const entry of dayEntries.value) {
    const projectId = entry.rawTask.planId
    const projectName = props.plans.find(p => p.id === projectId)?.title || 'Unknown'
    stats.set(projectName, (stats.get(projectName) || 0) + entry.hours)
  }
  return Array.from(stats.entries())
})

function navigateDay(direction: 'prev' | 'next') {
  currentDate.value = addDays(currentDate.value, direction === 'prev' ? -1 : 1)
}

function goToToday() {
  currentDate.value = new Date()
}

function isToday(): boolean {
  return format(currentDate.value, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
}

function handleAddEntry() {
  if (!selectedProjectId.value || !selectedBucketId.value || !description.value.trim()) return
  
  emit('addEntry', {
    projectId: selectedProjectId.value,
    bucketId: selectedBucketId.value,
    description: description.value.trim(),
    hours: hours.value,
    date: entryDate.value,
  })
  
  // Reset form
  description.value = ''
  hours.value = 2
  entryDate.value = new Date()
  showAddForm.value = false
}

function formatHours(h: number): string {
  if (h === 0) return '0h'
  const whole = Math.floor(h)
  const decimal = h % 1
  if (decimal === 0) return `${whole}h`
  const minutes = Math.round(decimal * 60)
  return `${whole}h ${minutes}m`
}

// Week navigation
const weekRange = computed(() => {
  const start = startOfWeek(currentDate.value, { weekStartsOn: 1 })
  const end = endOfWeek(currentDate.value, { weekStartsOn: 1 })
  return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd')}`
})

const weekDays = computed(() => {
  const days = []
  const start = startOfWeek(currentDate.value, { weekStartsOn: 1 })
  
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayHours = props.entries
      .filter(e => format(e.date, 'yyyy-MM-dd') === dateStr)
      .reduce((sum, e) => sum + e.hours, 0)
    
    days.push({
      date,
      dayName: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      hours: dayHours,
      isToday: format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
      isSelected: format(date, 'yyyy-MM-dd') === format(currentDate.value, 'yyyy-MM-dd'),
    })
  }
  
  return days
})

function selectDay(date: Date) {
  currentDate.value = date
}

function openAddForm() {
  // Initialize entry date to currently selected date
  entryDate.value = new Date(currentDate.value)
  showAddForm.value = true
}
</script>

<template>
  <div class="daily-timesheet">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>Daily Timesheet</h1>
        <span class="date-display">{{ format(currentDate, 'EEEE, MMMM d, yyyy') }}</span>
      </div>
      
      <div class="header-actions">
        <button class="btn-primary" @click="openAddForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Entry
        </button>
        
        <button class="btn-icon" @click="emit('refresh')" :disabled="loading">
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

    <!-- Week Calendar Strip -->
    <div class="week-strip">
      <div class="week-header">
        <span class="week-label">{{ weekRange }}</span>
        <button v-if="!isToday()" class="btn-today" @click="goToToday">Today</button>
      </div>
      <div class="week-days">
        <button
          v-for="day in weekDays"
          :key="day.dayNum"
          :class="['day-pill', { 
            'is-today': day.isToday, 
            'is-selected': day.isSelected,
            'has-hours': day.hours > 0 
          }]"
          @click="selectDay(day.date)"
        >
          <span class="day-name">{{ day.dayName }}</span>
          <span class="day-num">{{ day.dayNum }}</span>
          <span v-if="day.hours > 0" class="day-hours">{{ formatHours(day.hours) }}</span>
        </button>
      </div>
    </div>

    <!-- Day Navigation -->
    <div class="day-nav">
      <button @click="navigateDay('prev')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Previous
      </button>
      
      <div class="daily-total" :class="{ 'target-met': totalHours >= 8 }">
        <span class="total-label">Daily Total</span>
        <span class="total-value">{{ formatHours(totalHours) }}</span>
      </div>
      
      <button @click="navigateDay('next')">
        Next
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>

    <!-- Add Entry Form (Modal) -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <div class="modal-content">
        <h3>Log Time Entry</h3>
        
        <!-- Project Selection -->
        <div class="form-group">
          <label>Project *</label>
          <select v-model="selectedProjectId">
            <option value="">Select project...</option>
            <option v-for="plan in plans" :key="plan.id" :value="plan.id">
              {{ plan.title }}
            </option>
          </select>
        </div>
        
        <!-- Bucket Selection -->
        <div class="form-group">
          <label>Bucket *</label>
          <select v-model="selectedBucketId" :disabled="!selectedProjectId || availableBuckets.length === 0">
            <option value="">
              {{ !selectedProjectId ? 'Select project first' : availableBuckets.length === 0 ? 'No buckets' : 'Select bucket...' }}
            </option>
            <option v-for="bucket in availableBuckets" :key="bucket.id" :value="bucket.id">
              {{ bucket.name }}
            </option>
          </select>
        </div>
        
        <!-- Date -->
        <div class="form-group">
          <label>Date *</label>
          <input 
            type="date" 
            v-model="dateInputValue"
            class="date-input"
          />
        </div>
        
        <!-- Description -->
        <div class="form-group">
          <label>What did you do? *</label>
          <textarea 
            v-model="description" 
            placeholder="e.g., Fixed login bug, reviewed PRs..."
            rows="3"
          />
        </div>
        
        <!-- Hours -->
        <div class="form-group">
          <label>Hours</label>
          <div class="hours-selector">
            <button
              v-for="h in [0.5, 1, 2, 3, 4, 5, 6, 7, 8]"
              :key="h"
              :class="['hours-btn', { active: hours === h }]"
              @click="hours = h"
            >
              {{ h }}h
            </button>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn-secondary" @click="showAddForm = false">Cancel</button>
          <button 
            class="btn-primary" 
            @click="handleAddEntry"
            :disabled="!selectedProjectId || !selectedBucketId || !description.trim()"
          >
            Add Entry
          </button>
        </div>
      </div>
    </div>

    <!-- Time Entries List -->
    <div class="entries-section">
      <h3>Time Entries</h3>
      
      <div v-if="dayEntries.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>No entries for {{ format(currentDate, 'MMM d') }}</p>
        <button class="btn-link" @click="openAddForm()">Add your first entry</button>
      </div>

      <div v-else class="entries-list">
        <div 
          v-for="entry in dayEntries" 
          :key="entry.id"
          class="entry-card"
        >
          <div class="entry-project">
            {{ plans.find(p => p.id === entry.rawTask.planId)?.title || 'Unknown Project' }}
          </div>
          <div class="entry-description">{{ entry.title }}</div>
          <div class="entry-hours">{{ formatHours(entry.hours) }}</div>
        </div>
      </div>
    </div>

    <!-- Project Summary -->
    <div v-if="hoursByProject.length > 0" class="project-summary">
      <h3>Hours by Project</h3>
      <div class="project-bars">
        <div v-for="[project, hrs] in hoursByProject" :key="project" class="project-stat">
          <span class="stat-name">{{ project }}</span>
          <div class="stat-bar">
            <div class="stat-fill" :style="{ width: `${(hrs / totalHours) * 100}%` }" />
          </div>
          <span class="stat-hours">{{ formatHours(hrs) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.daily-timesheet {
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
}

.header-left h1 {
  margin: 0;
  font-size: 1.25rem;
  color: #1a202c;
}

.date-display {
  font-size: 0.875rem;
  color: #718096;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: #48bb78;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: #38a169;
}

.btn-primary svg {
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

.btn-icon.logout:hover {
  color: #e53e3e;
  border-color: #e53e3e;
}

.btn-icon svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Week Strip */
.week-strip {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1rem 1.5rem;
}

.week-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.week-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
}

.btn-today {
  padding: 0.25rem 0.75rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}

.week-days {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}

.day-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.day-pill:hover {
  border-color: #667eea;
}

.day-pill.is-selected {
  background: #667eea;
  border-color: #667eea;
  color: white;
}

.day-pill.is-today {
  border-color: #48bb78;
  border-width: 2px;
}

.day-pill.has-hours {
  background: #f0fff4;
}

.day-pill.is-selected.has-hours {
  background: #667eea;
}

.day-name {
  font-size: 0.7rem;
  text-transform: uppercase;
}

.day-num {
  font-size: 1rem;
  font-weight: 600;
}

.day-hours {
  font-size: 0.7rem;
  color: #48bb78;
}

.day-pill.is-selected .day-hours {
  color: rgba(255,255,255,0.9);
}

/* Day Navigation */
.day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #f7fafc;
  border-bottom: 1px solid #e2e8f0;
}

.day-nav button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.day-nav button:hover {
  border-color: #cbd5e0;
}

.day-nav button svg {
  width: 16px;
  height: 16px;
}

.daily-total {
  text-align: center;
}

.daily-total.target-met .total-value {
  color: #48bb78;
}

.total-label {
  display: block;
  font-size: 0.75rem;
  color: #718096;
  text-transform: uppercase;
}

.total-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #2d3748;
}

/* Modal */
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
  max-width: 400px;
  padding: 1.5rem;
}

.modal-content h3 {
  margin: 0 0 1rem 0;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.form-group select,
.form-group textarea,
.form-group input[type="date"] {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
}

.form-group input[type="date"].date-input {
  cursor: pointer;
}

.form-group select:disabled {
  background: #f7fafc;
  color: #a0aec0;
  cursor: not-allowed;
}

.form-group textarea {
  resize: vertical;
}

.hours-selector {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

.hours-btn {
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}

.hours-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

/* Entries Section */
.entries-section {
  padding: 1.5rem;
}

.entries-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #2d3748;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #718096;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  margin-bottom: 1rem;
  color: #cbd5e0;
}

.btn-link {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: underline;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.entry-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.entry-project {
  font-size: 0.75rem;
  font-weight: 600;
  color: #667eea;
  text-transform: uppercase;
  min-width: 100px;
}

.entry-description {
  flex: 1;
  color: #2d3748;
}

.entry-hours {
  font-weight: 700;
  color: #667eea;
  font-size: 1.1rem;
}

/* Project Summary */
.project-summary {
  padding: 0 1.5rem 1.5rem;
}

.project-summary h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #2d3748;
}

.project-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.project-stat {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.stat-name {
  font-size: 0.875rem;
  color: #4a5568;
  min-width: 120px;
}

.stat-bar {
  flex: 1;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.stat-fill {
  height: 100%;
  background: #667eea;
  border-radius: 4px;
}

.stat-hours {
  font-size: 0.875rem;
  font-weight: 600;
  color: #2d3748;
  min-width: 50px;
  text-align: right;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }
  
  .entry-card {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .entry-project {
    min-width: auto;
  }
}
</style>
