/**
 * Base Git provider interface
 * All Git provider implementations must implement this interface
 */

import type { GitCommit, FetchCommitsOptions, GitRepository } from '../../types/git';

export interface GitProviderClient {
  /**
   * Test if the provided credentials are valid
   */
  testCredentials(): Promise<boolean>;

  /**
   * Get the authenticated user's information
   */
  getCurrentUser(): Promise<{ username: string; email?: string; id: string | number }>;

  /**
   * List repositories accessible to the user
   */
  listRepositories(): Promise<GitRepository[]>;

  /**
   * Get a specific repository
   */
  getRepository(fullName: string): Promise<GitRepository>;

  /**
   * List branches in a repository
   */
  listBranches(repoFullName: string): Promise<string[]>;

  /**
   * Fetch commits from a repository
   */
  fetchCommits(repoFullName: string, options?: FetchCommitsOptions): Promise<GitCommit[]>;

  /**
   * Get a single commit
   */
  getCommit(repoFullName: string, sha: string): Promise<GitCommit>;
}

/**
 * Base class for Git provider clients with common functionality
 */
export abstract class BaseGitProvider implements GitProviderClient {
  protected token: string;
  protected baseUrl: string;

  constructor(token: string, baseUrl: string) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  abstract testCredentials(): Promise<boolean>;
  abstract getCurrentUser(): Promise<{ username: string; email?: string; id: string | number }>;
  abstract listRepositories(): Promise<GitRepository[]>;
  abstract getRepository(fullName: string): Promise<GitRepository>;
  abstract listBranches(repoFullName: string): Promise<string[]>;
  abstract fetchCommits(repoFullName: string, options?: FetchCommitsOptions): Promise<GitCommit[]>;
  abstract getCommit(repoFullName: string, sha: string): Promise<GitCommit>;

  /**
   * Helper method to parse dates from various formats
   */
  protected parseDate(dateString: string | Date): Date {
    if (dateString instanceof Date) return dateString;
    return new Date(dateString);
  }

  /**
   * Helper to handle API errors
   */
  protected handleError(error: unknown, context: string): never {
    if (error instanceof Error) {
      throw new Error(`${context}: ${error.message}`);
    }
    throw new Error(`${context}: Unknown error`);
  }
}
