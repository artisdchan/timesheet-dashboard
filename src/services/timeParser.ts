import type { PlannerTask, TimeEntry, DailyTimesheet, WeeklyTimesheet } from '../types/planner'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, addHours } from 'date-fns'

// Planner category/label to hours mapping
// These are the internal category names Planner uses
const CATEGORY_HOURS_MAP: Record<string, number> = {
  'category1': 0.5,   // 30 minutes
  'category2': 1,     // 1 hour
  'category3': 2,   // 2 hours
  'category4': 3,     // 3 hours
  'category5': 4,     // 4 hours
  'category6': 5,     // 5 hours
  'category7': 6,     // 6 hours
  'category8': 7,     // 7 hours
  'category9': 8,     // 8 hours
}

// Also support direct hour labels as fallback
const DIRECT_HOURS_MAP: Record<string, number> = {
  '0.5h': 0.5, '0.5 h': 0.5, '0.5H': 0.5, '0.5 H': 0.5,
  '1h': 1, '1 h': 1, '1H': 1, '1 H': 1,
  '1.5h': 1.5, '1.5 h': 1.5, '1.5H': 1.5, '1.5 H': 1.5,
  '2h': 2, '2 h': 2, '2H': 2, '2 H': 2,
  '2.5h': 2.5, '2.5 h': 2.5, '2.5H': 2.5, '2.5 H': 2.5,
  '3h': 3, '3 h': 3, '3H': 3, '3 H': 3,
  '3.5h': 3.5, '3.5 h': 3.5, '3.5H': 3.5, '3.5 H': 3.5,
  '4h': 4, '4 h': 4, '4H': 4, '4 H': 4,
  '4.5h': 4.5, '4.5 h': 4.5, '4.5H': 4.5, '4.5 H': 4.5,
  '5h': 5, '5 h': 5, '5H': 5, '5 H': 5,
  '5.5h': 5.5, '5.5 h': 5.5, '5.5H': 5.5, '5.5 H': 5.5,
  '6h': 6, '6 h': 6, '6H': 6, '6 H': 6,
  '6.5h': 6.5, '6.5 h': 6.5, '6.5H': 6.5, '6.5 H': 6.5,
  '7h': 7, '7 h': 7, '7H': 7, '7 H': 7,
  '7.5h': 7.5, '7.5 h': 7.5, '7.5H': 7.5, '7.5 H': 7.5,
  '8h': 8, '8 h': 8, '8H': 8, '8 H': 8,
  '9h': 9, '9 h': 9, '9H': 9, '9 H': 9,
  '10h': 10, '10 h': 10, '10H': 10, '10 H': 10,
  '12h': 12, '12 h': 12, '12H': 12, '12 H': 12,
  '30m': 0.5, '30 m': 0.5, '30min': 0.5, '30 min': 0.5,
  '15m': 0.25, '15 m': 0.25, '15min': 0.25, '15 min': 0.25,
  '45m': 0.75, '45 m': 0.75, '45min': 0.75, '45 min': 0.75,
}

// Get display label for category
function getCategoryDisplayLabel(category: string): string {
  const hours = CATEGORY_HOURS_MAP[category]
  if (hours === undefined) return category

  if (hours < 1) {
    return `${Math.round(hours * 60)}m`
  }
  return `${hours}h`
}

// Parse hours from categories (labels)
export function parseHoursFromCategories(categories: Record<string, boolean>): { hours: number; categoryName: string; displayLabel: string } | null {
  // First try category numbers (category1, category2, etc.)
  for (const [category, isApplied] of Object.entries(categories)) {
    if (isApplied && CATEGORY_HOURS_MAP[category] !== undefined) {
      return {
        hours: CATEGORY_HOURS_MAP[category],
        categoryName: category,
        displayLabel: getCategoryDisplayLabel(category)
      }
    }
  }

  // Fallback: try direct hour labels (2h, 4h, etc.)
  for (const [category, isApplied] of Object.entries(categories)) {
    if (isApplied && DIRECT_HOURS_MAP[category] !== undefined) {
      return {
        hours: DIRECT_HOURS_MAP[category],
        categoryName: category,
        displayLabel: category
      }
    }
  }

  return null
}

// Convert PlannerTask to TimeEntry - using data from /me/planner/tasks only
export function taskToTimeEntry(
  task: PlannerTask,
  bucketName?: string
): TimeEntry {
  // Get hours from tags/categories
  const categoryHours = parseHoursFromCategories(task.appliedCategories)

  // Use due date first, then start date, then created date
  let entryDate: Date
  if (task.dueDateTime) {
    entryDate = parseISO(task.dueDateTime)
  } else if (task.startDateTime) {
    entryDate = parseISO(task.startDateTime)
  } else {
    entryDate = parseISO(task.createdDateTime)
  }

  return {
    id: task.id,
    date: entryDate,
    title: task.title, // RAW TITLE
    description: '', // No description (would need details API)
    hours: categoryHours?.hours || 0,
    project: undefined,
    workType: bucketName,
    bucketName,
    categoryLabel: categoryHours?.displayLabel,
    isCompleted: task.percentComplete === 100,
    completedDate: task.completedDateTime ? parseISO(task.completedDateTime) : undefined,
    dueDate: task.dueDateTime ? parseISO(task.dueDateTime) : undefined,
    priority: task.priority,
    percentComplete: task.percentComplete,
    checklistItems: [], // No checklist (would need details API)
    rawTask: task,
  }
}

// Group time entries by day
export function groupByDay(entries: TimeEntry[]): DailyTimesheet[] {
  const dayMap = new Map<string, TimeEntry[]>()

  for (const entry of entries) {
    const dateKey = format(entry.date, 'yyyy-MM-dd')
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, [])
    }
    dayMap.get(dateKey)!.push(entry)
  }

  const sortedKeys = Array.from(dayMap.keys()).sort()

  return sortedKeys.map(dateKey => {
    const dayEntries = dayMap.get(dateKey)!
    const date = parseISO(dateKey)

    return {
      date,
      dateStr: format(date, 'MMM dd, yyyy'),
      dayName: format(date, 'EEEE'),
      entries: dayEntries.sort((a, b) => a.date.getTime() - b.date.getTime()),
      totalHours: dayEntries.reduce((sum, e) => sum + e.hours, 0),
    }
  })
}

// Group time entries by week
export function groupByWeek(entries: TimeEntry[]): WeeklyTimesheet[] {
  const weekMap = new Map<string, TimeEntry[]>()

  for (const entry of entries) {
    const weekStart = startOfWeek(entry.date, { weekStartsOn: 1 })
    const weekKey = format(weekStart, 'yyyy-MM-dd')

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, [])
    }
    weekMap.get(weekKey)!.push(entry)
  }

  const sortedKeys = Array.from(weekMap.keys()).sort()

  return sortedKeys.map(weekKey => {
    const weekEntries = weekMap.get(weekKey)!
    const weekStart = parseISO(weekKey)
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

    const days = groupByDay(weekEntries)

    const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
    const daysWithEntries = days.reduce((map, d) => {
      map.set(format(d.date, 'yyyy-MM-dd'), d)
      return map
    }, new Map<string, DailyTimesheet>())

    const completeDays = allDays.map(date => {
      const dateKey = format(date, 'yyyy-MM-dd')
      return daysWithEntries.get(dateKey) || {
        date,
        dateStr: format(date, 'MMM dd, yyyy'),
        dayName: format(date, 'EEEE'),
        entries: [],
        totalHours: 0,
      }
    })

    return {
      weekStart,
      weekEnd,
      weekLabel: `${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`,
      days: completeDays,
      totalHours: weekEntries.reduce((sum, e) => sum + e.hours, 0),
    }
  })
}

// Filter entries by date range
export function filterByDateRange(
  entries: TimeEntry[],
  startDate: Date,
  endDate: Date
): TimeEntry[] {
  return entries.filter(entry => {
    const entryDate = entry.date
    return entryDate >= startDate && entryDate <= addHours(endDate, 23)
  })
}
