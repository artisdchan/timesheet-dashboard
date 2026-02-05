<script setup lang="ts">
import authService from '../services/auth'
import { computed } from 'vue'

defineProps<{
  isAuthenticated: boolean
}>()

const emit = defineEmits<{
  login: []
}>()

const config = computed(() => authService.getConfig())
const isConfigured = computed(() => authService.isConfigured())

function handleLogin() {
  emit('login')
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <h1>Timesheet Dashboard</h1>
      </div>
      
      <p class="subtitle">
        Connect to Microsoft Planner and track your time easily
      </p>

      <!-- Not Configured State -->
      <div v-if="!isConfigured" class="config-panel">
        <div class="config-icon">⚙️</div>
        <h3>Configuration Required</h3>
        <p>
          Please configure your Azure AD settings in the <code>.env</code> file:
        </p>
        <div class="code-block">
          <code>VITE_AZURE_CLIENT_ID=your-client-id</code>
          <code>VITE_AZURE_TENANT_ID=common</code>
        </div>
        <p class="help-text">
          Get your Client ID from 
          <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank">
            Azure Portal → App Registrations
          </a>
        </p>
      </div>

      <!-- Configured State -->
      <div v-else class="login-form">
        <button class="btn-primary" @click="handleLogin">
          <svg viewBox="0 0 21 21" fill="currentColor">
            <path d="M1 1h9v9H1V1zm9 10h9v9h-9v-9zM1 11h9v9H1v-9zM10 1h9v9h-9V1z"/>
          </svg>
          Sign in with Microsoft
        </button>
        
        <div class="config-info">
          <p>Using Client ID: <code>{{ config.clientId.slice(0, 8) }}...</code></p>
        </div>
      </div>

      <div class="features">
        <div class="feature">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="10" y1="9" x2="8" y2="9"/>
          </svg>
          <span>Auto-sync with Planner tasks</span>
        </div>
        <div class="feature">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>Weekly & daily views</span>
        </div>
        <div class="feature">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Auto-parse hours from labels</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.logo svg {
  width: 48px;
  height: 48px;
  color: #667eea;
}

.logo h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.subtitle {
  text-align: center;
  color: #718096;
  margin-bottom: 2rem;
  font-size: 1rem;
}

/* Config Panel */
.config-panel {
  background: #fffaf0;
  border: 1px solid #fbd38d;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  text-align: center;
}

.config-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.config-panel h3 {
  margin: 0 0 0.75rem 0;
  color: #c05621;
  font-size: 1.1rem;
}

.config-panel p {
  margin: 0 0 1rem 0;
  color: #4a5568;
  font-size: 0.9rem;
}

.code-block {
  background: #2d3748;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  text-align: left;
}

.code-block code {
  display: block;
  color: #68d391;
  font-family: monospace;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.code-block code:last-child {
  margin-bottom: 0;
}

.help-text {
  font-size: 0.8rem;
  color: #718096;
}

.help-text a {
  color: #667eea;
}

/* Login Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: #667eea;
  color: white;
  border: none;
  padding: 0.875rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #5a67d8;
  transform: translateY(-1px);
}

.btn-primary svg {
  width: 20px;
  height: 20px;
}

.config-info {
  text-align: center;
}

.config-info p {
  margin: 0;
  font-size: 0.8rem;
  color: #718096;
}

.config-info code {
  background: #edf2f7;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-family: monospace;
}

/* Features */
.features {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #4a5568;
  font-size: 0.9rem;
}

.feature svg {
  width: 20px;
  height: 20px;
  color: #667eea;
  flex-shrink: 0;
}
</style>
