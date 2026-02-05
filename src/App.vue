<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import LoginView from './components/LoginView.vue'
import TimesheetView from './components/TimesheetView.vue'
import CreateTaskModal from './components/CreateTaskModal.vue'
import authService from './services/auth'
import graphService from './services/graph'
import { taskToTimeEntry } from './services/timeParser'
import type { TimeEntry, PlannerPlan, PlannerBucket } from './types/planner'

// State
const isAuthenticated = ref(false)
const isInitializing = ref(true)
const entries = ref<TimeEntry[]>([])
const allMyTasks = ref<TimeEntry[]>([])
const plans = ref<PlannerPlan[]>([])
const buckets = ref<PlannerBucket[]>([])
const selectedPlanId = ref<string | null>(null)
const selectedBucketId = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const showCreateModal = ref(false)
const creatingTask = ref(false)

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

// Watch for plan selection changes
watch(selectedPlanId, async (newPlanId) => {
  if (!newPlanId) {
    buckets.value = []
    selectedBucketId.value = null
    entries.value = []
    allMyTasks.value = []
    return
  }
  
  await loadPlanData(newPlanId)
})

// Watch for bucket selection - filter tasks client-side
watch(selectedBucketId, (newBucketId) => {
  console.log('Bucket selection changed:', newBucketId)
  if (!newBucketId) {
    entries.value = allMyTasks.value
    console.log('Showing all tasks:', entries.value.length)
  } else {
    const bucketName = buckets.value.find(b => b.id === newBucketId)?.name
    entries.value = allMyTasks.value.filter(task => task.bucketName === bucketName)
    console.log('Filtered by bucket:', bucketName, 'Tasks:', entries.value.length)
  }
})

function handleLogin() {
  error.value = null
  authService.login().catch((err) => {
    console.error('Login error:', err)
    error.value = 'Login failed. Please check your Azure AD configuration.'
  })
}

async function handleLogout() {
  try {
    await authService.logout()
    isAuthenticated.value = false
    entries.value = []
    allMyTasks.value = []
    buckets.value = []
    plans.value = []
    selectedPlanId.value = null
    selectedBucketId.value = null
  } catch (err) {
    console.error('Logout error:', err)
  }
}

async function loadPlans() {
  loading.value = true
  try {
    plans.value = await graphService.getPlans()
  } catch (err) {
    console.error('Failed to load plans:', err)
    plans.value = []
  } finally {
    loading.value = false
  }
}

async function loadPlanData(planId: string) {
  loading.value = true
  error.value = null
  
  try {
    // Load buckets for the plan
    buckets.value = await graphService.getBuckets(planId)
    console.log('Loaded buckets:', buckets.value)
    
    // Get MY tasks from last 3 months - ONE API call with date filter
    const myTasks = await graphService.getMyTasks(3)
    console.log('Loaded my tasks:', myTasks.length)
    
    // Filter tasks by selected plan
    const planTasks = myTasks.filter(t => t.planId === planId)
    console.log('Tasks for this plan:', planTasks.length)
    
    if (planTasks.length === 0) {
      allMyTasks.value = []
      entries.value = []
      selectedBucketId.value = null
      loading.value = false
      return
    }
    
    // Create bucket name lookup map
    const bucketNameMap = new Map(buckets.value.map(b => [b.id, b.name]))
    
    // Convert to time entries (no details API needed!)
    const timeEntries = planTasks.map(task => {
      const bucketName = bucketNameMap.get(task.bucketId) || 'Unknown'
      return taskToTimeEntry(task, bucketName)
    })
    
    console.log('Converted entries:', timeEntries.length)
    console.log('First entry:', timeEntries[0])
    
    // Sort by date (newest first)
    allMyTasks.value = timeEntries.sort((a, b) => b.date.getTime() - a.date.getTime())
    
    // Show all my tasks initially
    entries.value = allMyTasks.value
    selectedBucketId.value = null
    
    console.log('allMyTasks set:', allMyTasks.value.length)
    console.log('entries set:', entries.value.length)
    
  } catch (err) {
    console.error('Failed to load plan data:', err)
    if (err instanceof Error && err.message.includes('429')) {
      error.value = 'Too many requests. Please wait a moment and try again.'
    } else {
      error.value = 'Failed to load tasks. Please try again.'
    }
    entries.value = []
    allMyTasks.value = []
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  if (selectedPlanId.value) {
    await loadPlanData(selectedPlanId.value)
  }
}

async function handleCreateTask(taskData: {
  title: string
  bucketId: string
  dueDate: string
  hoursCategory: string
  priority: number
  percentComplete: number
}) {
  if (!selectedPlanId.value) return
  
  creatingTask.value = true
  error.value = null
  
  try {
    // Get current user info
    const me = await graphService.getMe()
    
    // Create task
    await graphService.createTask({
      planId: selectedPlanId.value,
      bucketId: taskData.bucketId,
      title: taskData.title,
      dueDateTime: taskData.dueDate,
      priority: taskData.priority,
      percentComplete: taskData.percentComplete,
      assignments: {
        [me.id]: {
          '@odata.type': '#microsoft.graph.plannerAssignment',
          orderHint: ' !'
        }
      },
      appliedCategories: {
        [taskData.hoursCategory]: true
      }
    })
    
    // Close modal
    showCreateModal.value = false
    
    // Refresh task list
    await loadPlanData(selectedPlanId.value)
    
  } catch (err) {
    console.error('Failed to create task:', err)
    error.value = 'Failed to create task. Please try again.'
  } finally {
    creatingTask.value = false
  }
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

    <!-- Timesheet View -->
    <TimesheetView
      v-else
      :entries="entries"
      :plans="plans"
      :buckets="buckets"
      :all-tasks="allMyTasks"
      :selected-plan-id="selectedPlanId"
      :selected-bucket-id="selectedBucketId"
      :loading="loading"
      @update:selected-plan-id="selectedPlanId = $event"
      @update:selected-bucket-id="selectedBucketId = $event"
      @refresh="handleRefresh"
      @logout="handleLogout"
      @create-task="showCreateModal = true"
    />

    <!-- Create Task Modal -->
    <CreateTaskModal
      v-if="selectedPlanId"
      :show="showCreateModal"
      :buckets="buckets"
      :loading="creatingTask"
      @close="showCreateModal = false"
      @create="handleCreateTask"
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
