// Microsoft Planner Types

export interface PlannerAssignment {
  '@odata.type': '#microsoft.graph.plannerAssignment'
  assignedBy: {
    user: {
      id: string
    }
  }
  assignedDateTime: string
  orderHint: string
}

export interface PlannerTask {
  id: string
  title: string
  planId: string
  bucketId: string
  createdBy: {
    user: {
      id: string
      displayName?: string
    }
  }
  createdDateTime: string
  assignedToTaskBoardFormat?: unknown
  bucketTaskBoardFormat?: unknown
  progressTaskBoardFormat?: unknown
  assignedBy?: {
    user: {
      id: string
    }
  }
  assignments: Record<string, PlannerAssignment>
  orderHint: string
  assigneePriority: string
  completedBy?: {
    user: {
      id: string
    }
  }
  completedDateTime?: string
  conversationThreadId?: string
  dueDateTime?: string
  hasDescription: boolean
  percentComplete: number
  previewType: string
  referenceCount: number
  startDateTime?: string
  activeChecklistItemCount: number
  checklistItemCount: number
  appliedCategories: Record<string, boolean>
  priority: number
}

export interface PlannerChecklistItem {
  '@odata.type': 'microsoft.graph.plannerChecklistItem'
  title: string
  isChecked: boolean
  lastModifiedBy?: {
    user: {
      id: string
    }
  }
  lastModifiedDateTime?: string
  orderHint?: string
}

export interface PlannerTaskDetails {
  id: string
  description?: string
  previewType: string
  checklist: Record<string, PlannerChecklistItem>
  references: Record<string, unknown>
}

export interface PlannerPlan {
  id: string
  title: string
  owner: string
  createdBy?: {
    user: {
      id: string
      displayName?: string
    }
  }
  createdDateTime: string
  container?: {
    containerId: string
    type: string
    url: string
  }
}

export interface PlannerBucket {
  id: string
  name: string
  planId: string
  orderHint: string
}

// Timesheet-specific types
export interface TimeEntry {
  id: string
  date: Date
  title: string
  description: string
  hours: number
  project?: string
  workType?: string      // e.g., Coding, Design, POC (from title or bucket)
  bucketName?: string    // Bucket name (e.g., Develop, Design, POC)
  categoryLabel?: string // The tag/label used for hours (e.g., "2h", "4h")
  isCompleted: boolean
  completedDate?: Date
  dueDate?: Date
  priority: number
  percentComplete: number
  checklistItems: Array<{
    title: string
    isChecked: boolean
    hours?: number
  }>
  rawTask: PlannerTask
}

export interface DailyTimesheet {
  date: Date
  dateStr: string
  dayName: string
  entries: TimeEntry[]
  totalHours: number
}

export interface WeeklyTimesheet {
  weekStart: Date
  weekEnd: Date
  weekLabel: string
  days: DailyTimesheet[]
  totalHours: number
}

// Task creation form data
export interface TaskFormData {
  planId: string
  bucketId: string
  title: string        // Format: "Type || [Project] DD/MM/YYYY Description"
  dueDateTime: string  // ISO date string
  hoursTag: string     // The tag/label indicating hours
  priority: number     // Default: 5 (medium)
  percentComplete: number // 0 or 100
}
