-- Migration: Fix RLS for write operations with connection pooling
-- Created: 2026-03-16
-- 
-- Problem: set_config sets session variable on one connection, but INSERT/UPDATE/DELETE
-- queries may use different connections from the pool, causing RLS to fail with:
-- "new row violates row-level security policy for table 'git_accounts'"
--
-- Solution: Create RPC functions that set RLS context and perform writes in one call.

-- ============================================
-- Function: Create Git Account with RLS
-- Sets the session variable and inserts in one call
-- ============================================
create or replace function create_git_account(
  p_microsoft_user_id text,
  p_provider text,
  p_display_name text,
  p_token_encrypted text,
  p_token_iv text,
  p_is_self_hosted boolean default false,
  p_base_url text default null,
  p_api_url text default null,
  p_username text default null
)
returns git_accounts as $$
declare
  v_result git_accounts;
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Insert the account
  insert into git_accounts (
    microsoft_user_id,
    provider,
    display_name,
    token_encrypted,
    token_iv,
    is_self_hosted,
    base_url,
    api_url,
    username,
    is_active
  ) values (
    p_microsoft_user_id,
    p_provider,
    p_display_name,
    p_token_encrypted,
    p_token_iv,
    p_is_self_hosted,
    p_base_url,
    p_api_url,
    p_username,
    true
  )
  returning * into v_result;
  
  return v_result;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Update Git Account with RLS
-- Sets the session variable and updates in one call
-- ============================================
create or replace function update_git_account(
  p_account_id uuid,
  p_microsoft_user_id text,
  p_display_name text default null,
  p_token_encrypted text default null,
  p_token_iv text default null,
  p_is_active boolean default null
)
returns git_accounts as $$
declare
  v_result git_accounts;
  v_updates jsonb := '{}';
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Build dynamic update
  update git_accounts
  set
    display_name = coalesce(p_display_name, display_name),
    token_encrypted = coalesce(p_token_encrypted, token_encrypted),
    token_iv = coalesce(p_token_iv, token_iv),
    is_active = coalesce(p_is_active, is_active),
    updated_at = now()
  where id = p_account_id
    and microsoft_user_id = p_microsoft_user_id
  returning * into v_result;
  
  return v_result;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Delete Git Account with RLS
-- Sets the session variable and deletes in one call
-- ============================================
create or replace function delete_git_account(
  p_account_id uuid,
  p_microsoft_user_id text
)
returns void as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Delete the account (cascades to repo mappings)
  delete from git_accounts
  where id = p_account_id
    and microsoft_user_id = p_microsoft_user_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Create Git Repo Mapping with RLS
-- Sets the session variable and inserts in one call
-- ============================================
create or replace function create_git_repo_mapping(
  p_microsoft_user_id text,
  p_git_account_id uuid,
  p_repo_full_name text,
  p_repo_url text,
  p_plan_id text,
  p_bucket_id text,
  p_default_branch text default 'main',
  p_import_since date default null,
  p_commit_pattern text default null
)
returns git_repo_mappings as $$
declare
  v_result git_repo_mappings;
  v_account_exists boolean;
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Verify the account belongs to this user
  select exists(
    select 1 from git_accounts 
    where id = p_git_account_id 
    and microsoft_user_id = p_microsoft_user_id
  ) into v_account_exists;
  
  if not v_account_exists then
    raise exception 'Git account not found or access denied';
  end if;
  
  -- Insert the mapping
  insert into git_repo_mappings (
    git_account_id,
    repo_full_name,
    repo_url,
    plan_id,
    bucket_id,
    default_branch,
    import_since,
    commit_pattern
  ) values (
    p_git_account_id,
    p_repo_full_name,
    p_repo_url,
    p_plan_id,
    p_bucket_id,
    p_default_branch,
    p_import_since,
    p_commit_pattern
  )
  returning * into v_result;
  
  return v_result;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Update Git Repo Mapping with RLS
-- Sets the session variable and updates in one call
-- ============================================
create or replace function update_git_repo_mapping(
  p_mapping_id uuid,
  p_microsoft_user_id text,
  p_default_branch text default null,
  p_plan_id text default null,
  p_bucket_id text default null,
  p_import_since date default null,
  p_commit_pattern text default null
)
returns git_repo_mappings as $$
declare
  v_result git_repo_mappings;
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Update the mapping (RLS will verify ownership)
  update git_repo_mappings
  set
    default_branch = coalesce(p_default_branch, default_branch),
    plan_id = coalesce(p_plan_id, plan_id),
    bucket_id = coalesce(p_bucket_id, bucket_id),
    import_since = coalesce(p_import_since, import_since),
    commit_pattern = coalesce(p_commit_pattern, commit_pattern)
  where id = p_mapping_id
  returning * into v_result;
  
  return v_result;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Delete Git Repo Mapping with RLS
-- Sets the session variable and deletes in one call
-- ============================================
create or replace function delete_git_repo_mapping(
  p_mapping_id uuid,
  p_microsoft_user_id text
)
returns void as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Delete the mapping (RLS will verify ownership)
  delete from git_repo_mappings
  where id = p_mapping_id;
end;
$$ language plpgsql security definer;
