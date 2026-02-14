/**
 * Git Service
 * 
 * Combines Supabase database operations with encryption and Git provider APIs.
 * This is the main interface for UI components to interact with Git integration.
 */

import { supabaseService, setRLSUserId } from './supabase';
import { encryptionService } from './encryption';
import { createGitProvider, validateGitToken, getProviderApiUrl } from './gitProviders';
import type { 
  GitAccount, 
  GitRepoMapping,
  CreateGitAccountInput,
  CreateRepoMappingInput,
  GitCommit,
  FetchCommitsOptions,
  GitRepository,
  GitImportEntry,
} from '../types/git';

// ============================================
// Account Management
// ============================================

/**
 * Add a new Git account with encrypted token
 * 
 * Flow:
 * 1. Validate the token with the Git provider
 * 2. Encrypt the token with the passphrase
 * 3. Store in Supabase
 */
export async function addGitAccount(
  microsoftUserId: string,
  input: CreateGitAccountInput,
  passphrase: string
): Promise<GitAccount> {
  // Set RLS context
  await setRLSUserId(microsoftUserId);

  // Validate token first
  const validation = await validateGitToken(input.provider, input.token, {
    isSelfHosted: input.is_self_hosted,
    baseUrl: input.base_url,
  });

  if (!validation.valid) {
    throw new Error(`Invalid token: ${validation.error}`);
  }

  // Determine API URL
  const apiUrl = input.is_self_hosted 
    ? getProviderApiUrl(input.provider, input.base_url)
    : getProviderApiUrl(input.provider);

  // Encrypt the token
  const encrypted = await encryptionService.encryptToken(input.token, passphrase);

  // Store in database
  return supabaseService.accounts.createAccount(microsoftUserId, {
    ...input,
    api_url: apiUrl,
    token_encrypted: encrypted.encrypted,
    token_iv: encrypted.iv,
  });
}

/**
 * Get all Git accounts for the current Microsoft user
 */
export async function getGitAccounts(microsoftUserId: string): Promise<GitAccount[]> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.accounts.getAccounts(microsoftUserId);
}

/**
 * Get a single Git account by ID
 */
export async function getGitAccount(
  microsoftUserId: string,
  accountId: string
): Promise<GitAccount | null> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.accounts.getAccount(accountId, microsoftUserId);
}

/**
 * Update a Git account
 * Optionally updates the token (requires passphrase for re-encryption)
 */
export async function updateGitAccount(
  microsoftUserId: string,
  accountId: string,
  updates: {
    displayName?: string;
    token?: string;
    isActive?: boolean;
  },
  passphrase?: string
): Promise<GitAccount> {
  await setRLSUserId(microsoftUserId);

  const updateData: Parameters<typeof supabaseService.accounts.updateAccount>[1] = {};

  if (updates.displayName !== undefined) {
    updateData.display_name = updates.displayName;
  }

  if (updates.isActive !== undefined) {
    updateData.is_active = updates.isActive;
  }

  // If updating token, re-encrypt it
  if (updates.token && passphrase) {
    const encrypted = await encryptionService.encryptToken(updates.token, passphrase);
    updateData.token_encrypted = encrypted.encrypted;
    updateData.token_iv = encrypted.iv;
  }

  return supabaseService.accounts.updateAccount(accountId, updateData);
}

/**
 * Delete a Git account and all its mappings
 */
export async function deleteGitAccount(
  microsoftUserId: string,
  accountId: string
): Promise<void> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.accounts.deleteAccount(accountId);
}

// ============================================
// Repository Mapping Management
// ============================================

/**
 * Create a new repository mapping
 */
export async function createRepoMapping(
  microsoftUserId: string,
  input: CreateRepoMappingInput
): Promise<GitRepoMapping> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.mappings.createMapping(input);
}

/**
 * Get all repository mappings for the user
 */
export async function getRepoMappings(microsoftUserId: string): Promise<GitRepoMapping[]> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.mappings.getMappings(microsoftUserId);
}

/**
 * Get mappings for a specific Git account
 */
export async function getRepoMappingsForAccount(
  microsoftUserId: string,
  accountId: string
): Promise<GitRepoMapping[]> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.mappings.getMappingsForAccount(accountId, microsoftUserId);
}

/**
 * Update a repository mapping
 */
export async function updateRepoMapping(
  microsoftUserId: string,
  mappingId: string,
  updates: Partial<Omit<CreateRepoMappingInput, 'git_account_id'>>
): Promise<GitRepoMapping> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.mappings.updateMapping(mappingId, updates);
}

/**
 * Delete a repository mapping
 */
export async function deleteRepoMapping(
  microsoftUserId: string,
  mappingId: string
): Promise<void> {
  await setRLSUserId(microsoftUserId);
  return supabaseService.mappings.deleteMapping(mappingId);
}

// ============================================
// Git Operations (require passphrase)
// ============================================

/**
 * Get a decrypted Git client for an account
 */
async function getGitClient(
  account: GitAccount,
  passphrase: string
) {
  // Decrypt the token
  const decryptedToken = await encryptionService.decryptToken(
    account.token_encrypted,
    account.token_iv || '',
    passphrase
  );

  // Create the provider client
  return createGitProvider(account.provider, decryptedToken, {
    isSelfHosted: account.is_self_hosted,
    baseUrl: account.base_url || undefined,
  });
}

/**
 * List repositories from a Git account (decrypted operation)
 */
export async function listGitRepositories(
  microsoftUserId: string,
  accountId: string,
  passphrase: string
): Promise<GitRepository[]> {
  await setRLSUserId(microsoftUserId);

  const account = await supabaseService.accounts.getAccount(accountId, microsoftUserId);
  if (!account) {
    throw new Error('Git account not found');
  }

  const client = await getGitClient(account, passphrase);
  return client.listRepositories();
}

/**
 * List branches in a repository
 */
export async function listGitBranches(
  microsoftUserId: string,
  accountId: string,
  repoFullName: string,
  passphrase: string
): Promise<string[]> {
  await setRLSUserId(microsoftUserId);

  const account = await supabaseService.accounts.getAccount(accountId, microsoftUserId);
  if (!account) {
    throw new Error('Git account not found');
  }

  const client = await getGitClient(account, passphrase);
  return client.listBranches(repoFullName);
}

/**
 * Fetch commits from a repository
 */
export async function fetchGitCommits(
  microsoftUserId: string,
  accountId: string,
  repoFullName: string,
  passphrase: string,
  options?: FetchCommitsOptions
): Promise<GitCommit[]> {
  await setRLSUserId(microsoftUserId);

  const account = await supabaseService.accounts.getAccount(accountId, microsoftUserId);
  if (!account) {
    throw new Error('Git account not found');
  }

  const client = await getGitClient(account, passphrase);
  return client.fetchCommits(repoFullName, options);
}

/**
 * Fetch commits for a specific mapping (uses mapping configuration)
 * Fetches commits only from the default_branch stored in Supabase
 */
export async function fetchCommitsForMapping(
  microsoftUserId: string,
  mappingId: string,
  passphrase: string,
  options?: {
    since?: Date;
    until?: Date;
  }
): Promise<GitCommit[]> {
  // Ensure RLS context is set
  await setRLSUserId(microsoftUserId);
  
  console.log('[DEBUG] Fetching commits for mapping:', mappingId, 'user:', microsoftUserId);

  const mapping = await supabaseService.mappings.getMapping(mappingId, microsoftUserId);
  if (!mapping) {
    console.error('[DEBUG] Mapping not found:', mappingId);
    throw new Error(`Repository mapping not found: ${mappingId}. It may have been deleted or you don't have access.`);
  }
  
  console.log('[DEBUG] Found mapping:', mapping.repo_full_name, 'branch:', mapping.default_branch, 'account:', mapping.git_account_id);

  const account = await supabaseService.accounts.getAccount(mapping.git_account_id, microsoftUserId);
  if (!account) {
    throw new Error('Git account not found');
  }

  const client = await getGitClient(account, passphrase);

  // Build fetch options with the default_branch from Supabase
  const fetchOptions: FetchCommitsOptions = {
    branch: mapping.default_branch,
    per_page: 100,
    ...options,
  };

  // Apply import_since from mapping if not overridden
  if (!fetchOptions.since && mapping.import_since) {
    fetchOptions.since = new Date(mapping.import_since);
  }

  // Fetch commits only from the configured default_branch
  const commits = await client.fetchCommits(mapping.repo_full_name, fetchOptions);

  // Apply commit pattern filter if configured
  if (mapping.commit_pattern) {
    const pattern = new RegExp(mapping.commit_pattern);
    return commits.filter(commit => pattern.test(commit.message));
  }

  return commits;
}

/**
 * Fetch commits for all mappings belonging to a Microsoft user
 * Process:
 * 1. Get Microsoft user ID
 * 2. Find all git_accounts for that user
 * 3. For each account, find all git_repo_mappings
 * 4. Fetch commits from each mapped repository
 */
export async function fetchCommitsForUser(
  microsoftUserId: string,
  passphrase: string,
  options?: {
    since?: Date;
    until?: Date;
  }
): Promise<Array<{
  mapping: GitRepoMapping;
  account: GitAccount;
  commits: GitCommit[];
}>> {
  // Ensure RLS context is set
  await setRLSUserId(microsoftUserId);
  
  console.log('[DEBUG] Fetching commits for user:', microsoftUserId);

  // Step 1 & 2: Get all git accounts for this Microsoft user
  const accounts = await supabaseService.accounts.getAccounts(microsoftUserId);
  console.log('[DEBUG] Found', accounts.length, 'Git accounts');
  
  if (accounts.length === 0) {
    return [];
  }

  const results: Array<{
    mapping: GitRepoMapping;
    account: GitAccount;
    commits: GitCommit[];
  }> = [];

  // Step 3: For each account, get all mappings
  for (const account of accounts) {
    const mappings = await supabaseService.mappings.getMappingsForAccount(account.id, microsoftUserId);
    console.log('[DEBUG] Account', account.display_name, 'has', mappings.length, 'mappings');
    
    if (mappings.length === 0) continue;

    // Step 4: Fetch commits from each mapping
    const client = await getGitClient(account, passphrase);

    for (const mapping of mappings) {
      try {
        const fetchOptions: FetchCommitsOptions = {
          branch: mapping.default_branch,
          per_page: 100,
          ...options,
        };

        // Apply import_since from mapping if not overridden
        if (!fetchOptions.since && mapping.import_since) {
          fetchOptions.since = new Date(mapping.import_since);
        }

        console.log('[DEBUG] Fetching from:', mapping.repo_full_name, 'branch:', mapping.default_branch);
        
        let commits = await client.fetchCommits(mapping.repo_full_name, fetchOptions);

        // Apply commit pattern filter if configured
        if (mapping.commit_pattern) {
          const pattern = new RegExp(mapping.commit_pattern);
          commits = commits.filter(commit => pattern.test(commit.message));
        }

        console.log('[DEBUG] Fetched', commits.length, 'commits from', mapping.repo_full_name);

        results.push({
          mapping,
          account,
          commits,
        });
      } catch (err) {
        console.warn(`Failed to fetch commits from ${mapping.repo_full_name}:`, err);
        // Continue with other mappings
      }
    }
  }

  return results;
}

/**
 * Convert Git commits to import entries for timesheet
 */
export function convertCommitsToImportEntries(
  commits: GitCommit[],
  planId: string,
  bucketId: string,
  hoursPerCommit: number = 1
): GitImportEntry[] {
  return commits.map(commit => {
    // Use committer date or author date
    const date = commit.committer_date || commit.author_date;
    
    // Clean up commit message (first line only, truncate if needed)
    const fullMessage = commit.message || '';
    const message = fullMessage.split('\n')[0]?.substring(0, 200) || '';
    
    return {
      projectId: planId,
      bucketId: bucketId,
      description: `[${commit.sha?.substring(0, 7) ?? 'unknown'}] ${message}`,
      hours: [hoursPerCommit],
      date: date,
    };
  });
}

// ============================================
// Service Export
// ============================================

export const gitService = {
  // Account management
  addGitAccount,
  getGitAccounts,
  getGitAccount,
  updateGitAccount,
  deleteGitAccount,

  // Mapping management
  createRepoMapping,
  getRepoMappings,
  getRepoMappingsForAccount,
  updateRepoMapping,
  deleteRepoMapping,

  // Git operations
  listGitRepositories,
  listGitBranches,
  fetchGitCommits,
  fetchCommitsForMapping,
  fetchCommitsForUser,
  convertCommitsToImportEntries,

  // Passphrase management (re-export from encryption)
  passphrase: {
    store: encryptionService.storePassphrase,
    get: encryptionService.getStoredPassphrase,
    clear: encryptionService.clearStoredPassphrase,
    hasValid: encryptionService.hasValidPassphrase,
    getRemainingTime: encryptionService.getPassphraseRemainingTime,
  },
};

export default gitService;
