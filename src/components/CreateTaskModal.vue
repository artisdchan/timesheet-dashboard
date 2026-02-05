<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PlannerBucket } from '../types/planner'

const props = defineProps<{
  show: boolean
  buckets: PlannerBucket[]
  loading: boolean
}>()

const emit = defineEmits<{
  close: []
  create: [taskData: {
    title: string
    bucketId: string
    dueDate: string
    hoursCategory: string
    priority: number
    percentComplete: number
  }]
}>()

// Form state
const title = ref('')
const bucketId = ref('')
const dueDate = ref('')
const hoursCategory = ref('category4') // Default 2h
const priority = ref(5) // Default Medium
const percentComplete = ref(0)

// Hours options mapping
const hoursOptions = [
  { value: 'category1', label: '30m', hours: 0.5 },
  { value: 'category2', label: '1h', hours: 1 },
  { value: 'category3', label: '2h', hours: 2 },
  { value: 'category4', label: '3h', hours: 3 },
  { value: 'category5', label: '4h', hours: 4 },
  { value: 'category6', label: '5h', hours: 5 },
  { value: 'category7', label: '6h', hours: 6 },
  { value: 'category8', label: '7h', hours: 7 },
  { value: 'category9', label: '8h', hours: 8 },
]

const priorityOptions = [
  { value: 1, label: 'Urgent' },
  { value: 3, label: 'Important' },
  { value: 5, label: 'Medium' },
  { value: 9, label: 'Low' },
]

const statusOptions = [
  { value: 0, label: 'Not Started' },
  { value: 50, label: 'In Progress' },
  { value: 100, label: 'Complete' },
]

const canSubmit = computed(() => {
  return title.value.trim() && bucketId.value && dueDate.value
})

function handleSubmit() {
  if (!canSubmit.value) return

  emit('create', {
    title: title.value.trim(),
    bucketId: bucketId.value,
    dueDate: new Date(dueDate.value).toISOString(),
    hoursCategory: hoursCategory.value,
    priority: priority.value,
    percentComplete: percentComplete.value,
  })
}

function resetForm() {
  title.value = ''
  bucketId.value = props.buckets[0]?.id || ''
  const today = new Date()
  dueDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  hoursCategory.value = 'category4'
  priority.value = 5
  percentComplete.value = 0
}

// Reset form when modal opens
watch(() => props.show, (show) => {
  if (show) {
    resetForm()
  }
})

// Auto-select first bucket if available
watch(() => props.buckets, (buckets) => {
  if (buckets.length > 0 && !bucketId.value) {
    bucketId.value = buckets[0]?.id || ''
  }
}, { immediate: true })
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Create New Task</h2>
        <button class="btn-close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="modal-body">
        <!-- Title -->
        <div class="form-group">
          <label>Title *</label>
          <input
            v-model="title"
            type="text"
            placeholder="e.g., Coding || [Project] 22/01/2026 Fix login bug"
            required
          />
        </div>

        <!-- Bucket -->
        <div class="form-group">
          <label>Bucket *</label>
          <select v-model="bucketId" required>
            <option value="" disabled>Select a bucket</option>
            <option v-for="bucket in buckets" :key="bucket.id" :value="bucket.id">
              {{ bucket.name }}
            </option>
          </select>
        </div>

        <!-- Due Date -->
        <div class="form-group">
          <label>Due Date *</label>
          <input
            v-model="dueDate"
            type="date"
            required
          />
        </div>

        <!-- Hours -->
        <div class="form-group">
          <label>Hours</label>
          <div class="hours-grid">
            <button
              v-for="option in hoursOptions"
              :key="option.value"
              type="button"
              :class="['hours-btn', { active: hoursCategory === option.value }]"
              @click="hoursCategory = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- Priority -->
        <div class="form-group">
          <label>Priority</label>
          <div class="priority-options">
            <label
              v-for="option in priorityOptions"
              :key="option.value"
              :class="['priority-label', `priority-${option.label.toLowerCase()}`]"
            >
              <input
                type="radio"
                v-model="priority"
                :value="option.value"
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <!-- Status -->
        <div class="form-group">
          <label>Status</label>
          <div class="status-options">
            <label
              v-for="option in statusOptions"
              :key="option.value"
              :class="['status-label', { active: percentComplete === option.value }]"
            >
              <input
                type="radio"
                v-model="percentComplete"
                :value="option.value"
              />
              {{ option.label }}
            </label>
          </div>
        </div>

        <!-- Actions -->
        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="emit('close')">
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary"
            :disabled="!canSubmit || loading"
          >
            <span v-if="loading">Creating...</span>
            <span v-else>Create Task</span>
          </button>
        </div>
      </form>
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
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #2d3748;
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #718096;
}

.btn-close:hover {
  background: #f7fafc;
  color: #2d3748;
}

.btn-close svg {
  width: 20px;
  height: 20px;
}

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.form-group input[type="text"],
.form-group input[type="date"],
.form-group select {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.hours-grid {
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
  transition: all 0.2s;
}

.hours-btn:hover {
  border-color: #667eea;
}

.hours-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.priority-options,
.status-options {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.priority-label,
.status-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.priority-label input,
.status-label input {
  display: none;
}

.priority-urgent {
  background: #fed7d7;
  border-color: #fc8181;
  color: #c53030;
}

.priority-important {
  background: #feebc8;
  border-color: #f6ad55;
  color: #c05621;
}

.priority-medium {
  background: #e9d8fd;
  border-color: #b794f4;
  color: #6b46c1;
}

.priority-low {
  background: #e2e8f0;
  border-color: #cbd5e0;
  color: #4a5568;
}

.status-label.active {
  background: #c6f6d5;
  border-color: #9ae6b4;
  color: #276749;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #e2e8f0;
}

.btn-secondary {
  padding: 0.625rem 1rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  color: #4a5568;
}

.btn-secondary:hover {
  background: #f7fafc;
}

.btn-primary {
  padding: 0.625rem 1rem;
  border: none;
  background: #667eea;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  color: white;
  font-weight: 600;
}

.btn-primary:hover {
  background: #5a67d8;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
