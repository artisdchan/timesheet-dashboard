<script setup lang="ts">
import { ref } from 'vue'
import GitAccountManager from './GitAccountManager.vue'
import RepoMappingManager from './RepoMappingManager.vue'
import type { GitAccount, GitRepoMapping } from '../types/git'

const props = defineProps<{
  microsoftUserId: string
  plans: Array<{ id: string; title: string }>
  buckets: Array<{ id: string; name: string; planId: string }>
}>()

const emit = defineEmits<{
  close: []
  error: [message: string]
}>()

// State
const accounts = ref<GitAccount[]>([])
const mappings = ref<GitRepoMapping[]>([])
const errorMessage = ref('')

function handleAccountsChanged(newAccounts: GitAccount[]) {
  accounts.value = newAccounts
}

function handleMappingsChanged(newMappings: GitRepoMapping[]) {
  mappings.value = newMappings
}

function handleError(message: string) {
  errorMessage.value = message
  // Clear after 5 seconds
  setTimeout(() => {
    errorMessage.value = ''
  }, 5000)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content git-settings">
      <header class="modal-header">
        <h2>Git Integration</h2>
        <button class="btn-close" @click="emit('close')">&times;</button>
      </header>
      
      <div class="modal-body">
        <!-- Error Message -->
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
          <button class="btn-dismiss" @click="errorMessage = ''">&times;</button>
        </div>
        
        <!-- Security Notice -->
        <div class="security-notice">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
          <div class="notice-content">
            <strong>End-to-End Encryption</strong>
            <p>Your Git tokens are encrypted with AES-256-GCM using a passphrase you provide. 
            The passphrase is stored in your browser session only. We never store unencrypted tokens.</p>
          </div>
        </div>
        
        <!-- Git Accounts Section -->
        <section class="settings-section">
          <GitAccountManager
            :microsoft-user-id="microsoftUserId"
            @accounts-changed="handleAccountsChanged"
            @error="handleError"
          />
        </section>
        
        <!-- Repository Mappings Section -->
        <section class="settings-section">
          <RepoMappingManager
            :microsoft-user-id="microsoftUserId"
            :accounts="accounts"
            :plans="plans"
            :buckets="buckets"
            @mappings-changed="handleMappingsChanged"
            @error="handleError"
          />
        </section>
      </div>
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
  max-width: 700px;
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

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* Error Banner */
.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #fed7d7;
  border: 1px solid #fc8181;
  border-radius: 8px;
  color: #c53030;
  margin-bottom: 1rem;
}

.btn-dismiss {
  background: none;
  border: none;
  color: #c53030;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-dismiss:hover {
  color: #9b2c2c;
}

/* Security Notice */
.security-notice {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: #ebf8ff;
  border: 1px solid #90cdf4;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.security-notice .icon {
  width: 24px;
  height: 24px;
  color: #3182ce;
  flex-shrink: 0;
}

.notice-content {
  flex: 1;
}

.notice-content strong {
  display: block;
  color: #2c5282;
  margin-bottom: 0.25rem;
}

.notice-content p {
  margin: 0;
  font-size: 0.875rem;
  color: #2b6cb0;
}

/* Settings Section */
.settings-section {
  margin-bottom: 2rem;
}

.settings-section:last-child {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .modal-content {
    max-height: 100vh;
    border-radius: 0;
  }
  
  .security-notice {
    flex-direction: column;
  }
}
</style>
