
export type RemoteCollectionFetcher = (path: string) => Promise<string>;

export type RemoteCollectionAdapterFromConfig = {
	url: string;
	headers?: Record<string, string>;
}

export type RemoteCollectionAdapterConfig = {
	fetcher: RemoteCollectionFetcher;
}

export class RemoteCollectionAdapter {
	#fetcher: RemoteCollectionFetcher;

	constructor(config: RemoteCollectionAdapterConfig) {
		this.#fetcher = config.fetcher;
	}

	/**
	 * Create a RemoteCollectionAdapter from a base URL and optional headers.
	 * The adapter will use `fetch` to retrieve content, appending paths to the base URL.
	 * 
	 * @example
	 * ```ts
	 * const adapter = RemoteCollectionAdapter.from({
	 *   url: 'https://api.example.com/content',
	 *   headers: { 'Authorization': 'Bearer token' }
	 * });
	 * ```
	 */
	static from(config: RemoteCollectionAdapterFromConfig): RemoteCollectionAdapter {
		return new RemoteCollectionAdapter({
			fetcher: async (path: string) => {
				const base = config.url.replace(/\/+$/, '');
				const normalizedPath = path.startsWith('/') ? path : '/' + path;
				const url = base + normalizedPath;

				const response = await fetch(url, {
					headers: config.headers,
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch remote content from "${url}": ${response.status} ${response.statusText}`);
				}

				return response.text();
			}
		});
	}

	async fetch(path: string): Promise<string> {
		return this.#fetcher(path);
	}
}
