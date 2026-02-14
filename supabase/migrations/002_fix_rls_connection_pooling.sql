-- Migration: Fix RLS issue with connection pooling
-- Created: 2026-02-14
-- 
-- Problem: set_config sets session variable on one connection, but subsequent
-- queries may use different connections from the pool, causing RLS to fail.
--
-- Solution: Create functions that set RLS context and query in one call.

-- ============================================
-- Function: Get Git Accounts with RLS
-- Sets the session variable and returns accounts in one call
-- ============================================
create or replace function get_git_accounts_for_user(p_microsoft_user_id text)
returns setof git_accounts as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Return accounts for this user
  return query
  select * from git_accounts
  where microsoft_user_id = p_microsoft_user_id
  order by created_at desc;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Get Git Repo Mappings with RLS
-- Sets the session variable and returns mappings in one call
-- ============================================
create or replace function get_git_repo_mappings_for_user(p_microsoft_user_id text)
returns setof git_repo_mappings as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Return mappings for accounts belonging to this user
  return query
  select m.* 
  from git_repo_mappings m
  inner join git_accounts a on m.git_account_id = a.id
  where a.microsoft_user_id = p_microsoft_user_id
  order by m.created_at desc;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Get Single Git Account with RLS
-- ============================================
create or replace function get_git_account_by_id(p_account_id uuid, p_microsoft_user_id text)
returns setof git_accounts as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Return the account
  return query
  select * from git_accounts
  where id = p_account_id and microsoft_user_id = p_microsoft_user_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Get Single Mapping with RLS
-- ============================================
create or replace function get_git_repo_mapping_by_id(p_mapping_id uuid, p_microsoft_user_id text)
returns setof git_repo_mappings as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Return the mapping
  return query
  select m.* 
  from git_repo_mappings m
  inner join git_accounts a on m.git_account_id = a.id
  where m.id = p_mapping_id and a.microsoft_user_id = p_microsoft_user_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- Function: Get Mappings for Account with RLS
-- ============================================
create or replace function get_git_repo_mappings_for_account(p_account_id uuid, p_microsoft_user_id text)
returns setof git_repo_mappings as $$
begin
  -- Set the session variable for RLS
  perform pg_catalog.set_config('app.current_ms_user_id', p_microsoft_user_id, false);
  
  -- Return mappings for this account
  return query
  select m.* 
  from git_repo_mappings m
  inner join git_accounts a on m.git_account_id = a.id
  where m.git_account_id = p_account_id and a.microsoft_user_id = p_microsoft_user_id
  order by m.created_at desc;
end;
$$ language plpgsql security definer;
