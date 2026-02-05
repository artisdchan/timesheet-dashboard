<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LoginView from './components/LoginView.vue'
import DailyTimesheetView from './components/DailyTimesheetView.vue'
import authService from './services/auth'
import graphService from './services/graph'
import { taskToTimeEntry } from './services/timeParser'
import type { TimeEntry, PlannerPlan, PlannerBucket } from './types/planner'

// State
const isAuthenticated = ref(false)
const isInitializing = ref(true)
const entries = ref<TimeEntry[]>([])
const plans = ref<PlannerPlan[]>([])
const buckets = ref<PlannerBucket[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Cache for bucket lookup
const bucketMap = ref(new Map<string, PlannerBucket>())

// Initialize auth on mount
onMounted(async () => {
  try {
    await authService.initialize()
    isAuthenticated.value = authService.isAuthenticated()
    
    if (isAuthenticated.value) {
      await loadPlans()
    }
  } catch (err) {
    console.error('Initialization error:', err)
    error.value = 'Failed to initialize. Please try again.'
  } finally {
    isInitializing.value = false
  }
})

async function handleLogin() {
  error.value = null
  try {
    await authService.login()
    isAuthenticated.value = authService.isAuthenticated()
    
    if (isAuthenticated.value) {
      await loadPlans()
    }
  } catch (err) {
    console.error('Login error:', err)
    error.value = 'Login failed. Please check your Azure AD configuration.'
  }
}

async function handleLogout() {
  try {
    await authService.logout()
    isAuthenticated.value = false
    entries.value = []
    plans.value = []
    buckets.value = []
    bucketMap.value.clear()
  } catch (err) {
    console.error('Logout error:', err)
  }
}

async function loadPlans() {
  loading.value = true
  try {
    plans.value = await graphService.getPlans()
    
    // Load buckets for all plans
    for (const plan of plans.value) {
      try {
        const planBuckets = await graphService.getBuckets(plan.id)
        planBuckets.forEach(b => bucketMap.value.set(b.id, b))
        buckets.value.push(...planBuckets)
      } catch (err) {
        console.warn(`Failed to load buckets for plan ${plan.id}:`, err)
      }
    }
    
    // Load entries after plans and buckets are loaded
    await loadEntries()
  } catch (err) {
    console.error('Failed to load plans:', err)
    plans.value = []
  } finally {
    loading.value = false
  }
}

async function loadEntries() {
  loading.value = true
  try {
    // Get MY tasks from last 3 months
    const myTasks = await graphService.getMyTasks(3)
    
    // Convert to time entries
    const timeEntries = myTasks.map(task => {
      const bucket = bucketMap.value.get(task.bucketId)
      return taskToTimeEntry(task, bucket?.name)
    })
    
    // Sort by date (newest first)
    entries.value = timeEntries.sort((a, b) => b.date.getTime() - a.date.getTime())
    
    console.log('Loaded entries:', entries.value.length)
  } catch (err) {
    console.error('Failed to load entries:', err)
    error.value = 'Failed to load tasks. Please try again.'
  } finally {
    loading.value = false
  }
}

// Handle adding a new time entry - creates a Planner task
async function handleAddEntry(entryData: { projectId: string; bucketId: string; description: string; hours: number[]; date?: Date }) {
  loading.value = true
  error.value = null
  
  try {
    // Verify the bucket belongs to this project
    const bucket = buckets.value.find(b => b.id === entryData.bucketId && b.planId === entryData.projectId)
    if (!bucket) {
      throw new Error('Invalid bucket selected')
    }
    
    // Get current user
    const me = await graphService.getMe()
    
    // Map hours to categories (support multiple)
    // category1=0.5h, category2=1h, category3=2h, category4=3h, category5=4h
    // category6=5h, category7=6h, category8=7h, category9=8h
    const hoursCategoryMap: Record<number, string> = {
      0.5: 'category1',  // 30m
      1: 'category2',    // 1h
      2: 'category3',    // 2h
      3: 'category4',    // 3h
      4: 'category5',    // 4h
      5: 'category6',    // 5h
      6: 'category7',    // 6h
      7: 'category8',    // 7h
      8: 'category9',    // 8h
    }
    
    // Build appliedCategories from selected hours (can have multiple)
    const appliedCategories: Record<string, boolean> = {}
    for (const hour of entryData.hours) {
      const category = hoursCategoryMap[hour]
      if (category) {
        appliedCategories[category] = true
      }
    }
    
    // Set due date (default to today if not provided)
    const dueDate = entryData.date || new Date()
    dueDate.setHours(0, 0, 0, 0)
    
    // Format date as dd/mm/yyyy
    const day = dueDate.getDate().toString().padStart(2, '0')
    const month = (dueDate.getMonth() + 1).toString().padStart(2, '0')
    const year = dueDate.getFullYear()
    const formattedDate = `${day}/${month}/${year}`
    
    // Build title: BUCKET_NAME || [User name] dd/mm/yyyy What have done
    const title = `${bucket.name} || [${me.displayName}] ${formattedDate} ${entryData.description}`
    
    // Create task in Planner
    await graphService.createTask({
      planId: entryData.projectId,
      bucketId: entryData.bucketId,
      title: title,
      dueDateTime: dueDate.toISOString(),
      priority: 5, // Medium
      percentComplete: 100, // Mark as complete since it's logged time
      assignments: {
        [me.id]: {
          '@odata.type': '#microsoft.graph.plannerAssignment',
          orderHint: ' !'
        }
      },
      appliedCategories: appliedCategories
    })
    
    // Refresh entries
    await loadEntries()
    
  } catch (err) {
    console.error('Failed to create entry:', err)
    error.value = 'Failed to add time entry. Please try again.'
  } finally {
    loading.value = false
  }
}

// Handle editing an existing time entry
async function handleEditEntry(entryData: { 
  taskId: string
  etag: string
  projectId: string
  bucketId: string
  description: string
  hours: number[]
  date: Date
}) {
  loading.value = true
  error.value = null
  
  try {
    // Verify the bucket belongs to this project
    const bucket = buckets.value.find(b => b.id === entryData.bucketId && b.planId === entryData.projectId)
    if (!bucket) {
      throw new Error('Invalid bucket selected')
    }
    
    // Get current user
    const me = await graphService.getMe()
    
    // Map hours to categories (support multiple)
    const hoursCategoryMap: Record<number, string> = {
      0.5: 'category1', 1: 'category2', 2: 'category3', 3: 'category4', 4: 'category5',
      5: 'category6', 6: 'category7', 7: 'category8', 8: 'category9'
    }
    
    // Build appliedCategories - must explicitly clear old categories by setting to false
    // Planner API merges categories, so we need to set all to false first, then set new ones to true
    const appliedCategories: Record<string, boolean> = {
      category1: false, category2: false, category3: false, 
      category4: false, category5: false, category6: false,
      category7: false, category8: false, category9: false
    }
    
    // Set selected hours to true
    for (const hour of entryData.hours) {
      const category = hoursCategoryMap[hour]
      if (category) {
        appliedCategories[category] = true
      }
    }
    
    // Set due date
    const dueDate = entryData.date
    dueDate.setHours(0, 0, 0, 0)
    
    // Format date as dd/mm/yyyy
    const day = dueDate.getDate().toString().padStart(2, '0')
    const month = (dueDate.getMonth() + 1).toString().padStart(2, '0')
    const year = dueDate.getFullYear()
    const formattedDate = `${day}/${month}/${year}`
    
    // Build title: BUCKET_NAME || [User name] dd/mm/yyyy What have done
    const title = `${bucket.name} || [${me.displayName}] ${formattedDate} ${entryData.description}`
    
    // Update task in Planner
    await graphService.updateTask(
      entryData.taskId,
      {
        planId: entryData.projectId,
        bucketId: entryData.bucketId,
        title: title,
        dueDateTime: dueDate.toISOString(),
        appliedCategories: appliedCategories
      },
      entryData.etag
    )
    
    // Refresh entries
    await loadEntries()
    
  } catch (err) {
    console.error('Failed to update entry:', err)
    error.value = 'Failed to update time entry. Please try again.'
  } finally {
    loading.value = false
  }
}

// Handle deleting a time entry
async function handleDeleteEntry(taskId: string, etag: string) {
  loading.value = true
  error.value = null
  
  try {
    await graphService.deleteTask(taskId, etag)
    
    // Refresh entries
    await loadEntries()
    
  } catch (err) {
    console.error('Failed to delete entry:', err)
    error.value = 'Failed to delete time entry. Please try again.'
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  await loadEntries()
}
</script>

<template>
  <div class="app">
    <!-- Initialization Loading -->
    <div v-if="isInitializing" class="init-loading">
      <div class="spinner"></div>
      <p>Initializing...</p>
    </div>

    <!-- Error Message -->
    <div v-else-if="error" class="error-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{{ error }}</span>
      <button @click="error = null">Dismiss</button>
    </div>

    <!-- Login View -->
    <LoginView 
      v-else-if="!isAuthenticated" 
      :is-authenticated="isAuthenticated"
      @login="handleLogin"
    />

    <!-- Daily Timesheet View -->
    <DailyTimesheetView
      v-else
      :entries="entries"
      :plans="plans"
      :buckets="buckets"
      :loading="loading"
      @add-entry="handleAddEntry"
      @edit-entry="handleEditEntry"
      @delete-entry="handleDeleteEntry"
      @refresh="handleRefresh"
      @logout="handleLogout"
    />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app {
  min-height: 100vh;
}

/* Initialization Loading */
.init-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.init-loading .spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Error Banner */
.error-banner {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: #fed7d7;
  border: 1px solid #fc8181;
  color: #c53030;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.error-banner svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.error-banner button {
  margin-left: 1rem;
  padding: 0.4rem 0.75rem;
  background: white;
  border: 1px solid #fc8181;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #c53030;
}

.error-banner button:hover {
  background: #fff5f5;
}
</style>
