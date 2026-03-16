import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GitAccount, GitRepoMapping, CreateGitAccountInput, UpdateGitAccountInput, CreateRepoMappingInput, UpdateRepoMappingInput } from '../types/git';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '%c[Timesheet Dashboard] Supabase credentials not configured!\n' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file',
    'color: orange; font-weight: bold;'
  );
}

// Create Supabase client
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We use MSAL for auth, not Supabase Auth
  },
});

/**
 * Set the current Microsoft User ID for RLS policies
 * This must be called before any database operations
 */
export async function setRLSUserId(microsoftUserId: string | null): Promise<void> {
  if (!microsoftUserId) {
    // Clear the session variable
    await supabase.rpc('set_config', {
      key: 'app.current_ms_user_id',
      value: '',
    });
    return;
  }

  // Set the session variable for RLS
  await supabase.rpc('set_config', {
    key: 'app.current_ms_user_id',
    value: microsoftUserId,
  });
}

// ============================================
// Git Accounts Service
// ============================================

export const gitAccountsService = {
  /**
   * Get all Git accounts for the current Microsoft user
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async getAccounts(microsoftUserId: string): Promise<GitAccount[]> {
    const { data, error } = await supabase
      .rpc('get_git_accounts_for_user', {
        p_microsoft_user_id: microsoftUserId
      });

    if (error) {
      console.error('Error fetching Git accounts:', error);
      throw new Error(`Failed to fetch Git accounts: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Get a single Git account by ID
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async getAccount(id: string, microsoftUserId: string): Promise<GitAccount | null> {
    const { data, error } = await supabase
      .rpc('get_git_account_by_id', {
        p_account_id: id,
        p_microsoft_user_id: microsoftUserId
      });

    if (error) {
      console.error('Error fetching Git account:', error);
      throw new Error(`Failed to fetch Git account: ${error.message}`);
    }

    // RPC returns a set, so we need to get the first item
    if (!data || data.length === 0) return null;
    return data[0];
  },

  /**
   * Create a new Git account
   * Note: token should already be encrypted before calling this
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async createAccount(
    microsoftUserId: string,
    input: CreateGitAccountInput & { token_encrypted: string; token_iv: string }
  ): Promise<GitAccount> {
    const { data, error } = await supabase
      .rpc('create_git_account', {
        p_microsoft_user_id: microsoftUserId,
        p_provider: input.provider,
        p_display_name: input.display_name,
        p_token_encrypted: input.token_encrypted,
        p_token_iv: input.token_iv,
        p_is_self_hosted: input.is_self_hosted ?? false,
        p_base_url: input.base_url || null,
        p_api_url: input.api_url || null,
        p_username: input.username || null,
      });

    if (error) {
      console.error('Error creating Git account:', error);
      throw new Error(`Failed to create Git account: ${error.message}`);
    }

    return data;
  },

  /**
   * Update a Git account
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async updateAccount(
    id: string,
    microsoftUserId: string,
    input: Partial<UpdateGitAccountInput> & { token_encrypted?: string; token_iv?: string }
  ): Promise<GitAccount> {
    const { data, error } = await supabase
      .rpc('update_git_account', {
        p_account_id: id,
        p_microsoft_user_id: microsoftUserId,
        p_display_name: input.display_name ?? null,
        p_token_encrypted: input.token_encrypted ?? null,
        p_token_iv: input.token_iv ?? null,
        p_is_active: input.is_active ?? null,
      });

    if (error) {
      console.error('Error updating Git account:', error);
      throw new Error(`Failed to update Git account: ${error.message}`);
    }

    return data;
  },

  /**
   * Delete a Git account (cascades to repo mappings)
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async deleteAccount(id: string, microsoftUserId: string): Promise<void> {
    const { error } = await supabase
      .rpc('delete_git_account', {
        p_account_id: id,
        p_microsoft_user_id: microsoftUserId,
      });

    if (error) {
      console.error('Error deleting Git account:', error);
      throw new Error(`Failed to delete Git account: ${error.message}`);
    }
  },
};

// ============================================
// Git Repo Mappings Service
// ============================================

export const gitRepoMappingsService = {
  /**
   * Get all repo mappings for the current user's accounts
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async getMappings(microsoftUserId: string): Promise<GitRepoMapping[]> {
    const { data, error } = await supabase
      .rpc('get_git_repo_mappings_for_user', {
        p_microsoft_user_id: microsoftUserId
      });

    if (error) {
      console.error('Error fetching repo mappings:', error);
      throw new Error(`Failed to fetch repo mappings: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Get mappings for a specific account
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async getMappingsForAccount(accountId: string, microsoftUserId: string): Promise<GitRepoMapping[]> {
    const { data, error } = await supabase
      .rpc('get_git_repo_mappings_for_account', {
        p_account_id: accountId,
        p_microsoft_user_id: microsoftUserId
      });

    if (error) {
      console.error('Error fetching repo mappings:', error);
      throw new Error(`Failed to fetch repo mappings: ${error.message}`);
    }

    return data || [];
  },

  /**
   * Get a single mapping by ID
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async getMapping(id: string, microsoftUserId: string): Promise<GitRepoMapping | null> {
    const { data, error } = await supabase
      .rpc('get_git_repo_mapping_by_id', {
        p_mapping_id: id,
        p_microsoft_user_id: microsoftUserId
      });

    if (error) {
      console.error('Error fetching repo mapping:', error);
      throw new Error(`Failed to fetch repo mapping: ${error.message}`);
    }

    // RPC returns a set, so we need to get the first item
    if (!data || data.length === 0) return null;
    return data[0];
  },

  /**
   * Create a new repo mapping
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async createMapping(microsoftUserId: string, input: CreateRepoMappingInput): Promise<GitRepoMapping> {
    // Convert ISO date string to YYYY-MM-DD format for Postgres date type
    const importSinceDate = input.import_since 
      ? input.import_since.split('T')[0] 
      : null;

    const { data, error } = await supabase
      .rpc('create_git_repo_mapping', {
        p_microsoft_user_id: microsoftUserId,
        p_git_account_id: input.git_account_id,
        p_repo_full_name: input.repo_full_name,
        p_repo_url: input.repo_url,
        p_plan_id: input.plan_id,
        p_bucket_id: input.bucket_id,
        p_default_branch: input.default_branch || 'main',
        p_import_since: importSinceDate,
        p_commit_pattern: input.commit_pattern || null,
      });

    if (error) {
      console.error('Error creating repo mapping:', error);
      throw new Error(`Failed to create repo mapping: ${error.message}`);
    }

    return data;
  },

  /**
   * Update a repo mapping
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async updateMapping(id: string, microsoftUserId: string, input: UpdateRepoMappingInput): Promise<GitRepoMapping> {
    // Convert ISO date string to YYYY-MM-DD format for Postgres date type
    const importSinceDate = input.import_since 
      ? input.import_since.split('T')[0] 
      : null;

    const { data, error } = await supabase
      .rpc('update_git_repo_mapping', {
        p_mapping_id: id,
        p_microsoft_user_id: microsoftUserId,
        p_default_branch: input.default_branch ?? null,
        p_plan_id: input.plan_id ?? null,
        p_bucket_id: input.bucket_id ?? null,
        p_import_since: importSinceDate,
        p_commit_pattern: input.commit_pattern ?? null,
      });

    if (error) {
      console.error('Error updating repo mapping:', error);
      throw new Error(`Failed to update repo mapping: ${error.message}`);
    }

    return data;
  },

  /**
   * Delete a repo mapping
   * Uses RPC function to avoid RLS connection pooling issues
   */
  async deleteMapping(id: string, microsoftUserId: string): Promise<void> {
    const { error } = await supabase
      .rpc('delete_git_repo_mapping', {
        p_mapping_id: id,
        p_microsoft_user_id: microsoftUserId,
      });

    if (error) {
      console.error('Error deleting repo mapping:', error);
      throw new Error(`Failed to delete repo mapping: ${error.message}`);
    }
  },
};

// ============================================
// Combined Service Export
// ============================================

export const supabaseService = {
  setRLSUserId,
  accounts: gitAccountsService,
  mappings: gitRepoMappingsService,
};

export default supabaseService;
