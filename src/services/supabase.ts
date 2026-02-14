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
   */
  async createAccount(
    microsoftUserId: string,
    input: CreateGitAccountInput & { token_encrypted: string; token_iv: string }
  ): Promise<GitAccount> {
    const { data, error } = await supabase
      .from('git_accounts')
      .insert({
        microsoft_user_id: microsoftUserId,
        provider: input.provider,
        display_name: input.display_name,
        is_self_hosted: input.is_self_hosted,
        base_url: input.base_url || null,
        api_url: input.api_url || null,
        username: input.username || null,
        token_encrypted: input.token_encrypted,
        token_iv: input.token_iv,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating Git account:', error);
      throw new Error(`Failed to create Git account: ${error.message}`);
    }

    return data;
  },

  /**
   * Update a Git account
   */
  async updateAccount(
    id: string,
    input: Partial<UpdateGitAccountInput> & { token_encrypted?: string; token_iv?: string }
  ): Promise<GitAccount> {
    const updates: Record<string, unknown> = {};
    
    if (input.display_name !== undefined) updates.display_name = input.display_name;
    if (input.is_active !== undefined) updates.is_active = input.is_active;
    if (input.token_encrypted !== undefined) {
      updates.token_encrypted = input.token_encrypted;
      updates.token_iv = input.token_iv;
    }

    const { data, error } = await supabase
      .from('git_accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating Git account:', error);
      throw new Error(`Failed to update Git account: ${error.message}`);
    }

    return data;
  },

  /**
   * Delete a Git account (cascades to repo mappings)
   */
  async deleteAccount(id: string): Promise<void> {
    const { error } = await supabase
      .from('git_accounts')
      .delete()
      .eq('id', id);

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
   */
  async createMapping(input: CreateRepoMappingInput): Promise<GitRepoMapping> {
    const { data, error } = await supabase
      .from('git_repo_mappings')
      .insert({
        git_account_id: input.git_account_id,
        repo_full_name: input.repo_full_name,
        repo_url: input.repo_url,
        default_branch: input.default_branch || 'main',
        plan_id: input.plan_id,
        bucket_id: input.bucket_id,
        import_since: input.import_since || null,
        commit_pattern: input.commit_pattern || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating repo mapping:', error);
      throw new Error(`Failed to create repo mapping: ${error.message}`);
    }

    return data;
  },

  /**
   * Update a repo mapping
   */
  async updateMapping(id: string, input: UpdateRepoMappingInput): Promise<GitRepoMapping> {
    const updates: Record<string, unknown> = {};
    
    if (input.default_branch !== undefined) updates.default_branch = input.default_branch;
    if (input.plan_id !== undefined) updates.plan_id = input.plan_id;
    if (input.bucket_id !== undefined) updates.bucket_id = input.bucket_id;
    if (input.import_since !== undefined) updates.import_since = input.import_since;
    if (input.commit_pattern !== undefined) updates.commit_pattern = input.commit_pattern;

    const { data, error } = await supabase
      .from('git_repo_mappings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating repo mapping:', error);
      throw new Error(`Failed to update repo mapping: ${error.message}`);
    }

    return data;
  },

  /**
   * Delete a repo mapping
   */
  async deleteMapping(id: string): Promise<void> {
    const { error } = await supabase
      .from('git_repo_mappings')
      .delete()
      .eq('id', id);

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
