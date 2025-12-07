import { type IAdapter, Contextable } from './base';
import { Secret } from '../util/secrets';

type GitHubAdapterContext = {
	// defaults to GITHUB_TOKEN env var if not provided
	token?: Secret<string>;
	// format: owner/repo, e.g. octocat/Hello-World
	repo: `${string}/${string}`;
	// defaults to 'main' if not provided
	branch?: string;
}

export class GitHubAdapter extends Contextable<GitHubAdapterContext> implements IAdapter {

	constructor(context: GitHubAdapterContext) {
		super({
			...context,
			token: context.token ?? Secret.fromEnv('GITHUB_TOKEN'),
			branch: context.branch ?? 'main',
		});
	}

	connect(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	disconnect(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	read(path: string): Promise<string> {
		throw new Error('Method not implemented.');
	}

	write(path: string, content: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	remove(path: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

	commit(message: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	
	hasPendingChanges(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}

}