/**
 * GitLab API Client
 * Supports both GitLab.com and self-hosted GitLab instances
 */

import { BaseGitProvider } from './base';
import type { GitCommit, FetchCommitsOptions, GitRepository } from '../../types/git';

interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  web_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  name: string;
  namespace: {
    full_path: string;
  };
  web_url: string;
  default_branch: string;
  description: string | null;
  visibility: string;
}

export class GitLabClient extends BaseGitProvider {
  constructor(token: string, baseUrl: string = 'https://gitlab.com/api/v4') {
    super(token, baseUrl);
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `GitLab API error: ${response.status} ${errorData.message || response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async testCredentials(): Promise<boolean> {
    try {
      await this.fetch('/user');
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentUser(): Promise<{ username: string; email?: string; id: string | number }> {
    const user = await this.fetch<{
      username: string;
      email: string;
      id: number;
    }>('/user');

    return {
      username: user.username,
      email: user.email,
      id: user.id,
    };
  }

  async listRepositories(): Promise<GitRepository[]> {
    // Get projects the user has access to
    const projects = await this.fetch<GitLabProject[]>('/projects?membership=true&per_page=100&order_by=last_activity_at');

    return projects.map(project => ({
      id: project.id,
      full_name: project.path_with_namespace,
      name: project.name,
      owner: project.namespace.full_path,
      url: project.web_url,
      default_branch: project.default_branch,
      description: project.description || undefined,
      is_private: project.visibility === 'private',
    }));
  }

  async getRepository(fullName: string): Promise<GitRepository> {
    // URL encode the full name for the API
    const encodedPath = encodeURIComponent(fullName);
    const project = await this.fetch<GitLabProject>(`/projects/${encodedPath}`);

    return {
      id: project.id,
      full_name: project.path_with_namespace,
      name: project.name,
      owner: project.namespace.full_path,
      url: project.web_url,
      default_branch: project.default_branch,
      description: project.description || undefined,
      is_private: project.visibility === 'private',
    };
  }

  async listBranches(repoFullName: string): Promise<string[]> {
    const encodedPath = encodeURIComponent(repoFullName);
    const branches = await this.fetch<{ name: string }[]>(
      `/projects/${encodedPath}/repository/branches?per_page=100`
    );
    return branches.map(b => b.name);
  }

  async fetchCommits(
    repoFullName: string,
    options: FetchCommitsOptions = {}
  ): Promise<GitCommit[]> {
    const encodedPath = encodeURIComponent(repoFullName);
    const params = new URLSearchParams();
    params.set('per_page', String(options.per_page || 30));
    
    if (options.page) {
      params.set('page', String(options.page));
    }
    
    if (options.branch) {
      params.set('ref_name', options.branch);
    }
    
    if (options.path) {
      params.set('path', options.path);
    }
    
    if (options.author) {
      params.set('author', options.author);
    }
    
    if (options.since) {
      params.set('since', options.since.toISOString());
    }
    
    if (options.until) {
      params.set('until', options.until.toISOString());
    }

    const commits = await this.fetch<GitLabCommit[]>(
      `/projects/${encodedPath}/repository/commits?${params.toString()}`
    );

    return commits.map(commit => this.transformCommit(commit));
  }

  async getCommit(repoFullName: string, sha: string): Promise<GitCommit> {
    const encodedPath = encodeURIComponent(repoFullName);
    const commit = await this.fetch<GitLabCommit>(
      `/projects/${encodedPath}/repository/commits/${sha}`
    );

    return this.transformCommit(commit);
  }

  private transformCommit(commit: GitLabCommit): GitCommit {
    return {
      sha: commit.id,
      message: commit.message,
      author_name: commit.author_name,
      author_email: commit.author_email,
      author_date: this.parseDate(commit.authored_date),
      committer_name: commit.committer_name,
      committer_email: commit.committer_email,
      committer_date: this.parseDate(commit.committed_date),
      url: commit.web_url,
      stats: commit.stats,
    };
  }
}

/**
 * Create GitLab client (handles both cloud and self-hosted)
 */
export function createGitLabClient(
  token: string,
  isSelfHosted: boolean = false,
  baseUrl?: string
): GitLabClient {
  if (isSelfHosted && baseUrl) {
    // Ensure API path is included
    const apiUrl = baseUrl.endsWith('/api/v4')
      ? baseUrl
      : `${baseUrl.replace(/\/$/, '')}/api/v4`;
    return new GitLabClient(token, apiUrl);
  }
  
  return new GitLabClient(token);
}
