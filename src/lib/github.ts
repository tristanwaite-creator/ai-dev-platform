import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';

// Type aliases for better readability
type Repository = RestEndpointMethodTypes['repos']['get']['response']['data'];
type Branch = RestEndpointMethodTypes['repos']['getBranch']['response']['data'];
type Commit = RestEndpointMethodTypes['repos']['getCommit']['response']['data'];
type PullRequest = RestEndpointMethodTypes['pulls']['create']['response']['data'];
type GitHubUser = RestEndpointMethodTypes['users']['getAuthenticated']['response']['data'];

export interface FileChange {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface CreateRepoOptions {
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

export interface CreatePROptions {
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export class GitHubService {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  // ============================================
  // User Operations
  // ============================================

  async getCurrentUser(): Promise<GitHubUser> {
    const { data } = await this.octokit.users.getAuthenticated();
    return data;
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Repository Operations
  // ============================================

  async createRepository(name: string, options: CreateRepoOptions = {}): Promise<Repository> {
    const { data } = await this.octokit.repos.createForAuthenticatedUser({
      name,
      description: options.description,
      private: options.private ?? true,
      auto_init: options.autoInit ?? true,
    });
    return data;
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async listUserRepositories(page = 1, perPage = 30): Promise<Repository[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      page,
      per_page: perPage,
      sort: 'updated',
    });
    return data as any;
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.octokit.repos.delete({ owner, repo });
  }

  // ============================================
  // Branch Operations
  // ============================================

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromBranch: string = 'main'
  ): Promise<Branch> {
    // Get the SHA of the base branch
    const { data: baseBranch } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch: fromBranch,
    });

    // Create new branch from base SHA
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseBranch.commit.sha,
    });

    // Return the newly created branch
    const { data } = await this.octokit.repos.getBranch({ owner, repo, branch: branchName });
    return data as any;
  }

  async getBranch(owner: string, repo: string, branchName: string): Promise<Branch> {
    const { data } = await this.octokit.repos.getBranch({ owner, repo, branch: branchName });
    return data;
  }

  async listBranches(owner: string, repo: string): Promise<Branch[]> {
    const { data } = await this.octokit.repos.listBranches({ owner, repo });
    return data as any;
  }

  async deleteBranch(owner: string, repo: string, branchName: string): Promise<void> {
    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  }

  // ============================================
  // Commit Operations
  // ============================================

  async createCommit(
    owner: string,
    repo: string,
    branch: string,
    files: FileChange[],
    message: string
  ): Promise<Commit> {
    // Get current branch reference
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const currentCommitSha = ref.object.sha;

    // Get current commit to access tree
    const { data: currentCommit } = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: file.content,
          encoding: file.encoding || 'utf-8',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const, type: 'blob' as const };
      })
    );

    // Create new tree
    const { data: tree } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: currentCommit.tree.sha,
      tree: blobs,
    });

    // Create new commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [currentCommitSha],
    });

    // Update branch reference
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    // Return full commit object
    const { data: fullCommit } = await this.octokit.repos.getCommit({
      owner,
      repo,
      ref: newCommit.sha,
    });

    return fullCommit;
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<Commit> {
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
    return data;
  }

  async listCommits(owner: string, repo: string, branch: string, perPage = 10): Promise<Commit[]> {
    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: perPage,
    });
    return data;
  }

  // ============================================
  // Pull Request Operations
  // ============================================

  async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePROptions
  ): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft,
    });
    return data;
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: prNumber });
    return data;
  }

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> {
    const { data } = await this.octokit.pulls.list({ owner, repo, state });
    return data as any;
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<void> {
    await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: mergeMethod,
    });
  }

  async closePullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    await this.octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  // ============================================
  // File Operations
  // ============================================

  async readFile(owner: string, repo: string, path: string, branch: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  async writeFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    branch: string,
    message: string
  ): Promise<void> {
    // Check if file exists to get SHA
    let sha: string | undefined;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      if (!Array.isArray(data) && data.type === 'file') {
        sha = data.sha;
      }
    } catch {
      // File doesn't exist, which is fine
    }

    await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    });
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    message: string
  ): Promise<void> {
    // Get file SHA
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    await this.octokit.repos.deleteFile({
      owner,
      repo,
      path,
      message,
      sha: data.sha,
      branch,
    });
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse GitHub repo URL to extract owner and name
 * Supports: https://github.com/owner/repo or git@github.com:owner/repo.git
 */
export function parseRepoUrl(url: string): { owner: string; name: string } | null {
  // HTTPS format
  const httpsMatch = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  // SSH format
  const sshMatch = url.match(/git@github\.com:([^\/]+)\/(.+)\.git/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  return null;
}

/**
 * Create slug from text (for branch names)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
