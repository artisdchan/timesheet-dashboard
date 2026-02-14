/**
 * Git Provider Factory
 * Creates the appropriate Git client based on provider type
 */

import type { GitProvider } from '../../types/git';
import { createGitHubClient } from './github';
import { createGitLabClient } from './gitlab';
import type { GitProviderClient } from './base';

export type { GitProviderClient } from './base';
export { createGitHubClient } from './github';
export { createGitLabClient } from './gitlab';

/**
 * Create a Git provider client based on the provider type
 */
export function createGitProvider(
  provider: GitProvider,
  token: string,
  options?: {
    isSelfHosted?: boolean;
    baseUrl?: string;
  }
): GitProviderClient {
  switch (provider) {
    case 'github':
      return createGitHubClient(token, false);
    
    case 'github_enterprise':
      return createGitHubClient(token, true, options?.baseUrl);
    
    case 'gitlab':
      return createGitLabClient(token, false);
    
    case 'gitlab_self_hosted':
      return createGitLabClient(token, true, options?.baseUrl);
    
    default:
      throw new Error(`Unsupported Git provider: ${provider}`);
  }
}

/**
 * Get the API URL for a provider
 */
export function getProviderApiUrl(
  provider: GitProvider,
  baseUrl?: string
): string {
  switch (provider) {
    case 'github':
      return 'https://api.github.com';
    
    case 'github_enterprise':
      if (!baseUrl) throw new Error('baseUrl required for GitHub Enterprise');
      return baseUrl.endsWith('/api/v3') 
        ? baseUrl 
        : `${baseUrl.replace(/\/$/, '')}/api/v3`;
    
    case 'gitlab':
      return 'https://gitlab.com/api/v4';
    
    case 'gitlab_self_hosted':
      if (!baseUrl) throw new Error('baseUrl required for self-hosted GitLab');
      return baseUrl.endsWith('/api/v4')
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/api/v4`;
    
    default:
      throw new Error(`Unsupported Git provider: ${provider}`);
  }
}

/**
 * Validate a Git provider token
 */
export async function validateGitToken(
  provider: GitProvider,
  token: string,
  options?: {
    isSelfHosted?: boolean;
    baseUrl?: string;
  }
): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const client = createGitProvider(provider, token, options);
    const user = await client.getCurrentUser();
    return { valid: true, username: user.username };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
