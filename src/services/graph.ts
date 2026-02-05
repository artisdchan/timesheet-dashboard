import type { PlannerTask, PlannerPlan, PlannerBucket } from '../types/planner'
import authService from './auth'

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

class GraphError extends Error {
  statusCode: number
  response?: unknown

  constructor(message: string, statusCode: number, response?: unknown) {
    super(message)
    this.name = 'GraphError'
    this.statusCode = statusCode
    this.response = response
  }
}

// Simple cache for bucket names
const bucketCache = new Map<string, string>()

class GraphService {
  private async fetchWithAuth(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const token = await authService.getAccessToken()
    
    if (!token) {
      throw new GraphError('Not authenticated', 401)
    }

    const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE_URL}${endpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new GraphError(
        errorData.error?.message || `HTTP ${response.status}`,
        response.status,
        errorData
      )
    }

    if (response.status === 204) {
      return null
    }

    return response.json()
  }

  // Get current user's profile
  async getMe(): Promise<{ id: string; displayName: string; mail: string }> {
    return this.fetchWithAuth('/me?$select=id,displayName,mail') as Promise<{ id: string; displayName: string; mail: string }>
  }

  // Get all plans the user has access to
  async getPlans(): Promise<PlannerPlan[]> {
    try {
      const response = await this.fetchWithAuth('/me/planner/plans') as { value: PlannerPlan[] }
      return response.value
    } catch (error) {
      if (error instanceof GraphError && error.statusCode === 403) {
        console.warn('Cannot fetch plans (permission required).')
        return []
      }
      throw error
    }
  }

  // Get a specific plan
  async getPlan(planId: string): Promise<PlannerPlan> {
    return this.fetchWithAuth(`/planner/plans/${planId}`) as Promise<PlannerPlan>
  }

  // Get buckets in a plan
  async getBuckets(planId: string): Promise<PlannerBucket[]> {
    const response = await this.fetchWithAuth(`/planner/plans/${planId}/buckets`) as { value: PlannerBucket[] }
    
    // Cache bucket names
    response.value.forEach(bucket => {
      bucketCache.set(bucket.id, bucket.name)
    })
    
    return response.value
  }

  // Get tasks assigned to current user with optional date filter
  // monthsAgo: number of months to look back (default: 3)
  async getMyTasks(monthsAgo: number = 3): Promise<PlannerTask[]> {
    // Calculate date from X months ago
    const fromDate = new Date()
    fromDate.setMonth(fromDate.getMonth() - monthsAgo)
    fromDate.setHours(0, 0, 0, 0)
    const fromDateString = fromDate.toISOString()
    
    // Build query with date filter
    // Filter by dueDateTime >= fromDate OR createdDateTime >= fromDate
    const filter = `dueDateTime ge ${fromDateString} or createdDateTime ge ${fromDateString}`
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$orderby': 'dueDateTime desc',
      '$top': '100'
    })
    
    const response = await this.fetchWithAuth(`/me/planner/tasks?${queryParams.toString()}`) as { value: PlannerTask[] }
    return response.value
  }

  // Create a new task
  async createTask(task: {
    planId: string
    bucketId: string
    title: string
    assignments?: Record<string, unknown>
    dueDateTime?: string
    startDateTime?: string
    percentComplete?: number
    priority?: number
    appliedCategories?: Record<string, boolean>
  }): Promise<PlannerTask> {
    return this.fetchWithAuth('/planner/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }) as Promise<PlannerTask>
  }

  // Update a task
  async updateTask(taskId: string, updates: Partial<PlannerTask>, etag: string): Promise<PlannerTask> {
    return this.fetchWithAuth(`/planner/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'If-Match': etag,
      },
      body: JSON.stringify(updates),
    }) as Promise<PlannerTask>
  }

  // Delete a task
  async deleteTask(taskId: string, etag: string): Promise<void> {
    await this.fetchWithAuth(`/planner/tasks/${taskId}`, {
      method: 'DELETE',
      headers: {
        'If-Match': etag,
      },
    })
  }

  // Clear bucket cache
  clearBucketCache(): void {
    bucketCache.clear()
  }
}

export const graphService = new GraphService()
export default graphService
