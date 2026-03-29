import type { IAdapter } from "./base";

export type RemoteAdapterGetItem = (path: string) => Promise<string>;
export type RemoteAdapterListItemKeys = (path: string) => Promise<string[]>;

export type RemoteAdapterFromConfig = {
	url: string;
	headers?: Record<string, string>;
};

export type RemoteAdapterConfig = {
	getItem: RemoteAdapterGetItem;
	listItemKeys: RemoteAdapterListItemKeys;
};

export class RemoteAdapter<TContent extends string = string> implements IAdapter {
	#getItem: RemoteAdapterGetItem;
	#listItemKeys: RemoteAdapterListItemKeys;

	constructor(config: RemoteAdapterConfig) {
		this.#getItem = config.getItem;
		this.#listItemKeys = config.listItemKeys;
	}

	static from(config: RemoteAdapterFromConfig): RemoteAdapter {
		return new RemoteAdapter({
			getItem: async (path: string) => {
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
			},
			listItemKeys: async (path: string) => {
				const base = config.url.replace(/\/+$/, "");
				const normalizedPath = path.startsWith("/") ? path : `/${path}`;
				const url = base + normalizedPath;

				const response = await fetch(url, {
					headers: config.headers,
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch remote content from "${url}": ${response.status} ${response.statusText}`);
				}

				const files = await response.json() as string[];
				const basePath = path.replace(/\/+$/, "");

				return files.map((fileName) => {
					const normalized = fileName.startsWith("/") ? fileName.slice(1) : fileName;
					return `${basePath}/${normalized}`;
				});
			},
		});
	}

	async readFile(path: string): Promise<TContent> {
		return this.#getItem(path) as Promise<TContent>;
	}

	async readDir(path: string): Promise<string[]> {
		return this.#listItemKeys(path);
	}
}
