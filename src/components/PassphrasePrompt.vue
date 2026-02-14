<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { encryptionService } from '../services/encryption'

const props = defineProps<{
  show: boolean
  title?: string
  message?: string
}>()

const emit = defineEmits<{
  submit: [passphrase: string]
  cancel: []
}>()

const passphrase = ref('')
const error = ref('')
const remainingTime = ref(0)

onMounted(() => {
  updateRemainingTime()
  const timer = setInterval(updateRemainingTime, 1000)
  
  // Cleanup timer on unmount
  return () => {
    clearInterval(timer)
  }
})

function updateRemainingTime() {
  remainingTime.value = encryptionService.getPassphraseRemainingTime()
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function handleSubmit() {
  if (!passphrase.value.trim()) {
    error.value = 'Please enter your passphrase'
    return
  }
  
  error.value = ''
  emit('submit', passphrase.value)
}

function handleCancel() {
  passphrase.value = ''
  error.value = ''
  emit('cancel')
}

// Expose method to show error from parent
function showError(message: string) {
  error.value = message
}

defineExpose({ showError })
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content">
      <header class="modal-header">
        <h3>{{ title || 'Enter Passphrase' }}</h3>
      </header>
      
      <div class="modal-body">
        <p class="message">{{ message || 'Enter your encryption passphrase to decrypt Git tokens.' }}</p>
        
        <div class="form-group">
          <input
            ref="inputRef"
            v-model="passphrase"
            type="password"
            placeholder="Your passphrase"
            class="form-input"
            :class="{ error: error }"
            @keyup.enter="handleSubmit"
            autofocus
          />
          <span v-if="error" class="error-text">{{ error }}</span>
        </div>
        
        <div v-if="remainingTime > 0" class="session-info">
          Current session expires in {{ formatTime(remainingTime) }}
        </div>
      </div>
      
      <footer class="modal-footer">
        <button type="button" class="btn-secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="button" class="btn-primary" @click="handleSubmit">
          Submit
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
  z-index: 1200;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2d3748;
}

.modal-body {
  padding: 1.5rem;
}

.message {
  margin: 0 0 1rem;
  color: #4a5568;
  font-size: 0.9rem;
}

.form-group {
  margin-bottom: 0.75rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 1rem;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input.error {
  border-color: #e53e3e;
}

.error-text {
  display: block;
  font-size: 0.8rem;
  color: #e53e3e;
  margin-top: 0.375rem;
}

.session-info {
  font-size: 0.8rem;
  color: #718096;
  margin-top: 0.75rem;
}

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
  font-weight: 500;
  color: #4a5568;
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

.btn-primary:hover {
  background: #5a67d8;
}
</style>
