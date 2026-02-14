// Git Integration Types

// ============================================
// Provider Types
// ============================================

export type GitProvider = 
  | 'github'
  | 'gitlab'
  | 'gitlab_self_hosted'
  | 'github_enterprise';

export interface GitProviderConfig {
  type: GitProvider;
  name: string;
  displayName: string;
  icon: string;
  supportsSelfHosted: boolean;
  defaultApiUrl?: string;
  requiresUsername: boolean;
}

// ============================================
// Database Entities (from Supabase)
// ============================================

export interface GitAccount {
  id: string;                    // uuid
  microsoft_user_id: string;     // From MS Graph
  provider: GitProvider;
  display_name: string;
  is_self_hosted: boolean;
  base_url: string | null;
  api_url: string | null;
  username: string | null;
  token_encrypted: string;       // AES-256 encrypted
  token_iv: string | null;       // Initialization vector
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitRepoMapping {
  id: string;                    // uuid
  git_account_id: string;        // uuid reference
  repo_full_name: string;        // "owner/repo"
  repo_url: string;
  default_branch: string;
  plan_id: string;               // Planner Plan ID
  bucket_id: string;             // Planner Bucket ID
  import_since: string | null;   // ISO date
  commit_pattern: string | null; // Regex pattern
  created_at: string;
}

// ============================================
// API Types (for creating/updating)
// ============================================

export interface CreateGitAccountInput {
  provider: GitProvider;
  display_name: string;
  is_self_hosted: boolean;
  base_url?: string;
  api_url?: string;
  username?: string;
  token: string;                 // Plain token - will be encrypted
}

export interface UpdateGitAccountInput {
  display_name?: string;
  token?: string;                // New plain token if changing
  is_active?: boolean;
}

export interface CreateRepoMappingInput {
  git_account_id: string;
  repo_full_name: string;
  repo_url: string;
  default_branch?: string;
  plan_id: string;
  bucket_id: string;
  import_since?: string;         // ISO date
  commit_pattern?: string;
}

export interface UpdateRepoMappingInput {
  default_branch?: string;
  plan_id?: string;
  bucket_id?: string;
  import_since?: string;
  commit_pattern?: string;
}

// ============================================
// Git API Types (for fetching commits)
// ============================================

export interface GitCommit {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  author_date: Date;
  committer_name: string;
  committer_email: string;
  committer_date: Date;
  url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface FetchCommitsOptions {
  since?: Date;
  until?: Date;
  branch?: string;
  path?: string;
  author?: string;
  per_page?: number;
  page?: number;
}

export interface GitRepository {
  id: string | number;
  full_name: string;
  name: string;
  owner: string;
  url: string;
  default_branch: string;
  description?: string;
  is_private: boolean;
}

// ============================================
// Git Import Types
// ============================================

export interface GitImportEntry {
  projectId: string;     // Plan ID
  bucketId: string;
  description: string;
  hours: number[];
  date: Date;
}

export interface GitImportResult {
  success: boolean;
  commitsImported: number;
  tasksCreated: number;
  errors: string[];
}

// ============================================
// Encryption Types
// ============================================

export interface EncryptedData {
  encrypted: string;
  iv: string;
}

export interface EncryptionKey {
  key: CryptoKey;
  salt: Uint8Array;
}

// ============================================
// Provider Configurations
// ============================================

export const GIT_PROVIDERS: Record<GitProvider, GitProviderConfig> = {
  github: {
    type: 'github',
    name: 'github',
    displayName: 'GitHub',
    icon: 'github',
    supportsSelfHosted: false,
    defaultApiUrl: 'https://api.github.com',
    requiresUsername: false,
  },
  gitlab: {
    type: 'gitlab',
    name: 'gitlab',
    displayName: 'GitLab',
    icon: 'gitlab',
    supportsSelfHosted: false,
    defaultApiUrl: 'https://gitlab.com/api/v4',
    requiresUsername: true,
  },
  gitlab_self_hosted: {
    type: 'gitlab_self_hosted',
    name: 'gitlab',
    displayName: 'GitLab Self-Hosted',
    icon: 'gitlab',
    supportsSelfHosted: true,
    requiresUsername: true,
  },
  github_enterprise: {
    type: 'github_enterprise',
    name: 'github',
    displayName: 'GitHub Enterprise',
    icon: 'github',
    supportsSelfHosted: true,
    defaultApiUrl: '/api/v3',
    requiresUsername: false,
  },
};

// ============================================
// UI/Form Types
// ============================================

export interface GitAccountFormData {
  provider: GitProvider;
  displayName: string;
  token: string;
  passphrase: string;           // For encryption key derivation
  confirmPassphrase: string;
  isSelfHosted: boolean;
  baseUrl?: string;
  username?: string;
}

export interface RepoMappingFormData {
  gitAccountId: string;
  repoFullName: string;
  planId: string;
  bucketId: string;
  importSince?: string;
  commitPattern?: string;
}

export interface StoredPassphrase {
  passphrase: string;
  expiresAt: number;            // timestamp
}
