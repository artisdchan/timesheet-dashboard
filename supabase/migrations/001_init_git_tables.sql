-- Migration: Initialize Git integration tables
-- Created: 2026-02-14

-- ============================================
-- Table: git_accounts
-- Stores multiple Git accounts per Microsoft user
-- Tokens are client-side encrypted before storage
-- ============================================
create table git_accounts (
  id uuid default gen_random_uuid() primary key,
  microsoft_user_id text not null,
  
  -- Provider configuration
  provider text not null check (provider in (
    'github',
    'gitlab',
    'gitlab_self_hosted',
    'github_enterprise'
  )),
  display_name text not null,
  
  -- Self-hosted support
  is_self_hosted boolean default false,
  base_url text,                             -- e.g., https://git.company.com
  api_url text,                              -- API endpoint
  
  -- Credentials (client-side encrypted)
  username text,
  token_encrypted text not null,             -- AES-256 encrypted
  token_iv text,                             -- Initialization vector
  
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Unique index to prevent duplicate accounts per user + provider + base_url + username
create unique index idx_git_accounts_unique 
  on git_accounts (microsoft_user_id, provider, coalesce(base_url, ''), coalesce(username, ''));

-- Indexes
comment on table git_accounts is 'Git provider accounts linked to Microsoft users';
comment on column git_accounts.token_encrypted is 'AES-256 encrypted token, encrypted client-side before storage';
comment on column git_accounts.token_iv is 'Initialization vector for AES decryption';

-- ============================================
-- Table: git_repo_mappings
-- Maps repositories to Planner destinations
-- ============================================
create table git_repo_mappings (
  id uuid default gen_random_uuid() primary key,
  git_account_id uuid not null references git_accounts(id) on delete cascade,
  
  -- Repository info
  repo_full_name text not null,              -- "owner/repo" or "group/project"
  repo_url text not null,                    -- Full repository URL
  default_branch text default 'main',
  
  -- Planner destination
  plan_id text not null,                     -- Planner Plan ID
  bucket_id text not null,                   -- Planner Bucket ID
  
  -- Import configuration
  import_since date,                         -- Only import commits from this date
  commit_pattern text,                       -- Optional regex filter
  
  created_at timestamp with time zone default now(),
  
  -- One mapping per account + repo + plan + bucket
  unique(git_account_id, repo_full_name, plan_id, bucket_id)
);

-- Indexes
comment on table git_repo_mappings is 'Mapping between Git repositories and Planner projects/buckets';

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================
alter table git_accounts enable row level security;
alter table git_repo_mappings enable row level security;

-- ============================================
-- RLS Policies for git_accounts
-- ============================================

-- Policy: Users can only see their own accounts
-- Uses session variable 'app.current_ms_user_id' set by the application
create policy "Users can only access their own git accounts"
  on git_accounts for select
  using (microsoft_user_id = current_setting('app.current_ms_user_id', true));

create policy "Users can only insert their own git accounts"
  on git_accounts for insert
  with check (microsoft_user_id = current_setting('app.current_ms_user_id', true));

create policy "Users can only update their own git accounts"
  on git_accounts for update
  using (microsoft_user_id = current_setting('app.current_ms_user_id', true))
  with check (microsoft_user_id = current_setting('app.current_ms_user_id', true));

create policy "Users can only delete their own git accounts"
  on git_accounts for delete
  using (microsoft_user_id = current_setting('app.current_ms_user_id', true));

-- ============================================
-- RLS Policies for git_repo_mappings
-- ============================================

-- Policy: Users can only access mappings for their accounts
create policy "Users can only access their own repo mappings"
  on git_repo_mappings for select
  using (
    git_account_id in (
      select id from git_accounts 
      where microsoft_user_id = current_setting('app.current_ms_user_id', true)
    )
  );

create policy "Users can only insert mappings for their accounts"
  on git_repo_mappings for insert
  with check (
    git_account_id in (
      select id from git_accounts 
      where microsoft_user_id = current_setting('app.current_ms_user_id', true)
    )
  );

create policy "Users can only update their own repo mappings"
  on git_repo_mappings for update
  using (
    git_account_id in (
      select id from git_accounts 
      where microsoft_user_id = current_setting('app.current_ms_user_id', true)
    )
  )
  with check (
    git_account_id in (
      select id from git_accounts 
      where microsoft_user_id = current_setting('app.current_ms_user_id', true)
    )
  );

create policy "Users can only delete their own repo mappings"
  on git_repo_mappings for delete
  using (
    git_account_id in (
      select id from git_accounts 
      where microsoft_user_id = current_setting('app.current_ms_user_id', true)
    )
  );

-- ============================================
-- Indexes for performance
-- ============================================
create index idx_git_accounts_ms_user on git_accounts(microsoft_user_id);
create index idx_git_accounts_provider on git_accounts(provider);
create index idx_repo_mappings_account on git_repo_mappings(git_account_id);
create index idx_repo_mappings_plan on git_repo_mappings(plan_id);

-- ============================================
-- RPC Function: Set config for RLS
-- ============================================
create or replace function set_config(key text, value text)
returns void as $$
begin
  perform pg_catalog.set_config(key, value, false);
end;
$$ language plpgsql security definer;

-- ============================================
-- Function to auto-update updated_at
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_git_accounts_updated_at
  before update on git_accounts
  for each row
  execute function update_updated_at_column();
