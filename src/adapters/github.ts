import { type IAdapter, Contextable } from './base';
import { Secret } from '../util';
import { Octokit } from 'octokit';

type GitHubAdapterContext = {
	// defaults to GITHUB_TOKEN env var if not provided
	token?: Secret<string>;
	// format: owner/repo, e.g. octocat/Hello-World
	repo: `${string}/${string}`;
	// defaults to 'main' if not provided
	branch?: string;
}

export class GitHubAdapter extends Contextable<GitHubAdapterContext> implements IAdapter {
	#octokit: Octokit;

	constructor(context: GitHubAdapterContext) {
		const superContext = {
			...context,
			token: context.token ?? Secret.fromEnv('GITHUB_TOKEN'),
			branch: context.branch ?? 'main',
		};

		super(superContext);

		if (superContext.repo.split('/').length !== 2) {
			throw new Error(`🚨 Invalid repo format: "${superContext.repo}". Expected format is "owner/repo", e.g. "octocat/Hello-World".`);
		}

		this.#octokit = new Octokit({
			auth: Secret.reveal(superContext.token)
		});
	}

	async ensureBranch() {
		const [owner, repo] = this.context.repo.split('/');
		console.log('ℹ️ Ensuring', this.context.branch, 'branch exists in', this.context.repo);
		const { data: repoData } = await this.#octokit.request('GET /repos/{owner}/{repo}', {
			owner: owner!,
			repo: repo!,
		});
		const defaultBranch = repoData.default_branch;

		if (defaultBranch === this.context.branch) {
			return;
		}

		try {
			await this.#octokit.rest.repos.getBranch({
				owner: owner!,
				repo: repo!,
				branch: this.context.branch!,
			});
			console.log('ℹ️ Branch exists:', this.context.branch);
		} catch (e) {
			// Branch does not exist, create it from default branch
			const { data: defaultBranchData } = await this.#octokit.rest.repos.getBranch({
				owner: owner!,
				repo: repo!,
				branch: defaultBranch,
			});

			console.log('ℹ️ Branch does not exist, creating', this.context.branch, 'from', defaultBranch);

			await this.#octokit.rest.git.createRef({
				owner: owner!,
				repo: repo!,
				ref: `refs/heads/${this.context.branch!}`,
				sha: defaultBranchData.commit.sha,
			});
		}
	}

	async connect(): Promise<this> {
		await this.ensureBranch();
		return this;
	}

	disconnect(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	async readDir(path: string): Promise<string[]> {
		const [owner, repo] = this.context.repo.split('/');
		const files = await this.#octokit.rest.repos.getContent({
			owner: owner!,
			repo: repo!,
			path: path.startsWith('./') ? path.slice(2) : path,
			ref: this.context.branch,
		});

		if (files.status === 200) {
			if (Array.isArray(files.data)) {
				return files.data.map(file => file.path);
			}
		}
		return [];
	}

	async read(path: string): Promise<string> {
		const [owner, repo] = this.context.repo.split('/');
		const file = await this.#octokit.rest.repos.getContent({
			owner: owner!,
			repo: repo!,
			path: path.startsWith('./') ? path.slice(2) : path,
			ref: this.context.branch,
		});

		if (file.status === 200) {
			if (!Array.isArray(file.data) && file.data.type === 'file') {
				const content = Buffer.from(file.data.content, 'base64').toString('utf-8');
				return content;
			}
		}

		throw new Error(`File not found: ${path}`, {
			cause: file.data
		});
	}

	async write(path: string, content: string): Promise<boolean> {
		const [owner, repo] = this.context.repo.split('/');
		
		const result = await this.#octokit.rest.repos.createOrUpdateFileContents({
			owner: owner!,
			repo: repo!,
			content: Buffer.from(content, 'utf-8').toString('base64'),
			message: `Update ${path} via Studio GitHub Adapter`,
			path: path.startsWith('./') ? path.slice(2) : path,
			branch: this.context.branch,
		});

		return result.status === 201 || result.status === 200;
	}

	async remove(path: string): Promise<boolean> {
		const [owner, repo] = this.context.repo.split('/');
		
		// First, get the file to obtain its SHA
		const file = await this.#octokit.rest.repos.getContent({
			owner: owner!,
			repo: repo!,
			path: path.startsWith('./') ? path.slice(2) : path,
			ref: this.context.branch,
		});
		
		if (file.status === 200) {
			if (!Array.isArray(file.data) && file.data.type === 'file') {
				const sha = file.data.sha;
				const result = await this.#octokit.rest.repos.deleteFile({
					owner: owner!,
					repo: repo!,
					message: `Delete ${path} via Studio GitHub Adapter`,
					path: path.startsWith('./') ? path.slice(2) : path,
					branch: this.context.branch,
					sha: sha,
				});
				return result.status === 200;
			}
		}

		throw new Error(`File not found: ${path}`, {
			cause: file.data
		});
	}

	async commit(message: string): Promise<boolean> {
		const [owner, repo] = this.context.repo.split('/');
		// GitHub automatically creates commits for file changes via the API,
		// so this method can simply return true.
		console.log(`ℹ️ Commit called with message: "${message}". Note: GitHub Adapter auto-commits on file changes.`);
		return true;
	}
	
	hasPendingChanges(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

}