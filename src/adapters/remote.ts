import type { IAdapter } from "./base";

export type RemoteAdapterFetcher = (path: string) => Promise<string>;
export type RemoteAdapterListFetcher = (path: string) => Promise<string[]>;

export type RemoteAdapterFromConfig = {
	url: string;
	headers?: Record<string, string>;
};

export type RemoteAdapterConfig = {
	fetcher: RemoteAdapterFetcher;
} | {
	getItem: RemoteAdapterFetcher;
	listItemKeys: RemoteAdapterListFetcher;
};

export class RemoteAdapter<TContent extends string = string> implements IAdapter {
	#getItem: RemoteAdapterFetcher;
	#listItemKeys: RemoteAdapterListFetcher;

	constructor(config: RemoteAdapterConfig) {
		if ("fetcher" in config) {
			this.#getItem = config.fetcher;
			this.#listItemKeys = async (path: string) => {
				const response = await config.fetcher(path);
				const files = JSON.parse(response) as string[];
				const basePath = path.replace(/\/+$/, "");

				return files.map((fileName) => {
					const normalized = fileName.startsWith("/") ? fileName.slice(1) : fileName;
					return `${basePath}/${normalized}`;
				});
			};
			return;
		}

		this.#getItem = config.getItem;
		this.#listItemKeys = config.listItemKeys;
	}

	static from(config: RemoteAdapterFromConfig): RemoteAdapter {
		return new RemoteAdapter({
			fetcher: async (path: string) => {
				const base = config.url.replace(/\/+$/, "");
				const normalizedPath = path.startsWith("/") ? path : `/${path}`;
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

	async readFile(path: string): Promise<TContent> {
		return this.#getItem(path) as Promise<TContent>;
	}

	async readDir(path: string): Promise<string[]> {
		return this.#listItemKeys(path);
	}
}
