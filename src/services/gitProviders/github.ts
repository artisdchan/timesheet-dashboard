/**
 * GitHub API Client
 * Supports both GitHub.com and GitHub Enterprise
 */

import { BaseGitProvider } from './base';
import type { GitCommit, FetchCommitsOptions, GitRepository } from '../../types/git';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
  };
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
  html_url: string;
  default_branch: string;
  description: string | null;
  private: boolean;
}

export class GitHubClient extends BaseGitProvider {
  constructor(token: string, baseUrl: string = 'https://api.github.com') {
    super(token, baseUrl);
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Timesheet-Dashboard',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `GitHub API error: ${response.status} ${errorData.message || response.statusText}`
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
      login: string;
      email: string | null;
      id: number;
    }>('/user');

    return {
      username: user.login,
      email: user.email || undefined,
      id: user.id,
    };
  }

  async listRepositories(): Promise<GitRepository[]> {
    // Fetch all accessible repos (user repos + org repos)
    const repos = await this.fetch<GitHubRepo[]>('/user/repos?per_page=100&sort=updated');

    return repos.map(repo => ({
      id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      url: repo.html_url,
      default_branch: repo.default_branch,
      description: repo.description || undefined,
      is_private: repo.private,
    }));
  }

  async getRepository(fullName: string): Promise<GitRepository> {
    const repo = await this.fetch<GitHubRepo>(`/repos/${fullName}`);

    return {
      id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      url: repo.html_url,
      default_branch: repo.default_branch,
      description: repo.description || undefined,
      is_private: repo.private,
    };
  }

  async listBranches(repoFullName: string): Promise<string[]> {
    const branches = await this.fetch<{ name: string }[]>(
      `/repos/${repoFullName}/branches?per_page=100`
    );
    return branches.map(b => b.name);
  }

  async fetchCommits(
    repoFullName: string,
    options: FetchCommitsOptions = {}
  ): Promise<GitCommit[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(options.per_page || 30));
    
    if (options.page) {
      params.set('page', String(options.page));
    }
    
    if (options.branch) {
      params.set('sha', options.branch);
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

    const commits = await this.fetch<GitHubCommit[]>(
      `/repos/${repoFullName}/commits?${params.toString()}`
    );

    return commits.map(commit => this.transformCommit(commit));
  }

  async getCommit(repoFullName: string, sha: string): Promise<GitCommit> {
    // Fetch commit with stats
    const commit = await this.fetch<GitHubCommit & { stats?: { additions: number; deletions: number; total: number } }>(
      `/repos/${repoFullName}/commits/${sha}`
    );

    return this.transformCommit(commit);
  }

  private transformCommit(commit: GitHubCommit): GitCommit {
    return {
      sha: commit.sha,
      message: commit.commit.message,
      author_name: commit.commit.author.name,
      author_email: commit.commit.author.email,
      author_date: this.parseDate(commit.commit.author.date),
      committer_name: commit.commit.committer.name,
      committer_email: commit.commit.committer.email,
      committer_date: this.parseDate(commit.commit.committer.date),
      url: commit.html_url,
      stats: commit.stats,
    };
  }
}

/**
 * Create GitHub client (handles both cloud and Enterprise)
 */
export function createGitHubClient(
  token: string,
  isEnterprise: boolean = false,
  baseUrl?: string
): GitHubClient {
  if (isEnterprise && baseUrl) {
    // GitHub Enterprise API URL format: https://github.company.com/api/v3
    const apiUrl = baseUrl.endsWith('/api/v3') 
      ? baseUrl 
      : `${baseUrl.replace(/\/$/, '')}/api/v3`;
    return new GitHubClient(token, apiUrl);
  }
  
  return new GitHubClient(token);
}
