import type { StandardSchemaV1 } from "@standard-schema/spec";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Entry, validate } from './entry';
import type { StudioConfig, IStudioConfig } from "..";
import type { IAdapter } from "../adapters/base";

type CollectionSchema<A, B> = {
	metadata: StandardSchemaV1<A, B>;
}

export type CollectionInit<N extends string, A, B> = {
	readonly name: N;
	path: string;
	schema?: CollectionSchema<A, B>;
	// defaults to './public' if not provided
	assetsPath?: string;
	skip?: boolean;
	// defaults to 'fs' if not provided
	source?: 'fs' | 'remote'; 
	adapter?: IAdapter;
}

type CollectionMetadata<A, B> = StandardSchemaV1.InferOutput<StandardSchemaV1<A, B>>;

export class Collection<N extends string, A, B> {
	#init: CollectionInit<N, A, B>;
	#slugToPathMap: Map<string, string> = new Map();
	#adapterSlugMap: Map<string, string> | null = null;

	protected constructor(init: CollectionInit<N, A, B>) {
		if (init.source === 'remote' && !init.adapter) {
			throw new Error(`🚨 Collection "${init.name}" has source "remote" but no adapter was provided. Please provide an adapter via the "adapter" option.`);
		}
		this.#init = init;
	}

	static define<const N extends string, A, B>(init: CollectionInit<N, A, B>) {
		return new Collection<N, A, B>(init);
	}

	get #usesAdapter() {
		return this.#init.adapter !== undefined;
	}

	get name() {
		return this.#init.name;
	}

	get skip() {
		return this.#init.skip ?? false;
	}

	get _metadataSchema() {
		return this.#init.schema?.metadata;
	}

	async #getAdapterSlugMap(): Promise<Map<string, string>> {
		if (this.#adapterSlugMap) return this.#adapterSlugMap;

		const adapter = this.#init.adapter!;
		await adapter.connect?.();
		const files = await adapter.readDir(this.#init.path);

		this.#adapterSlugMap = new Map();
		for (const entryPath of files) {
			const fileName = entryPath.split('/').pop() || entryPath;
			if (fileName.endsWith('.md') || fileName.endsWith('.mdx')) {
				const slug = fileName.replace(/\.mdx?$/, '');

				if (this.#adapterSlugMap.has(slug)) {
					throw new Error(`🚨 Duplicate slug "${slug}" found in collection "${this.#init.name}". Make sure all entries have unique slugs. (E.g. dont have file.md and file.mdx in the same collection)`);
				}

				this.#adapterSlugMap.set(slug, entryPath);
			}
		}

		return this.#adapterSlugMap;
	}

	async #loadEntryMetadata(entryPath: string, raw?: string): Promise<CollectionMetadata<A, B>> {
		const entry = new Entry<StandardSchemaV1<A, B>>(entryPath, {
			frontMatterSchema: this.#init.schema?.metadata,
			raw,
		});
		await entry.load();
		return entry.metadata as CollectionMetadata<A, B>;
	}

	async #loadAdapterMetadata(entryPath: string): Promise<CollectionMetadata<A, B>> {
		const adapter = this.#init.adapter!;
		if (adapter.getMetadata) {
			const metadata = await adapter.getMetadata(entryPath);

			if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
				throw new Error(`🚨 Adapter getMetadata("${entryPath}") for collection "${this.#init.name}" must return an object.`);
			}

			const schema = this.#init.schema?.metadata;
			if (schema) {
				return await validate(schema, metadata as StandardSchemaV1.InferInput<typeof schema>);
			}

			return metadata as CollectionMetadata<A, B>;
		}

		const raw = await adapter.readFile(entryPath);
		return this.#loadEntryMetadata(entryPath, raw);
	}

	getSlugMap() {
		if (this.#usesAdapter) {
			throw new Error(`🚨 getSlugMap() is not supported for adapter-backed collections. Use getEntries() or getEntry(slug) instead.`);
		}

		if (this.#slugToPathMap.size > 0) {
			return this.#slugToPathMap;
		}

		const contentDir = join(process.cwd(), this.#init.path);
		for (const fileName of readdirSync(contentDir)) {
			if (fileName.endsWith('.md') || fileName.endsWith('.mdx')) {
				const slug = fileName.replace(/\.mdx?$/, '');
				
				if (this.#slugToPathMap.has(slug)) {
					throw new Error(`🚨 Duplicate slug "${slug}" found in collection "${this.#init.name}". Make sure all entries have unique slugs. (E.g. dont have file.md and file.mdx in the same collection)`);
				}

				const fullPath = join(contentDir, fileName);
				this.#slugToPathMap.set(slug, fullPath);
			}
		}
		return this.#slugToPathMap;
	}

	async getEntries() {
		if (this.#usesAdapter) {
			const slugMap = await this.#getAdapterSlugMap();
			const adapter = this.#init.adapter!;

			return Promise.all(
				Array.from(slugMap.values()).map(async (entryPath) => {
					const raw = await adapter.readFile(entryPath);
					const entry = new Entry<StandardSchemaV1<A, B>>(entryPath, {
						frontMatterSchema: this.#init.schema?.metadata,
						raw,
					});
					return entry.load();
				})
			);
		}

		return Promise.all(
			Array.from(this.getSlugMap().values()).map(path => {
				const entry = new Entry<StandardSchemaV1<A, B>>(path, {
					frontMatterSchema: this.#init.schema?.metadata
				});
				return entry.load();
			})
		);
	}

	async getEntriesMetadata(): Promise<CollectionMetadata<A, B>[]> {
		if (this.#usesAdapter) {
			const slugMap = await this.#getAdapterSlugMap();
			const adapter = this.#init.adapter!;
			const entryPaths = Array.from(slugMap.values());

			if (adapter.listItemMetadata) {
				const metadataList = await adapter.listItemMetadata(this.#init.path);
				return Promise.all(
					metadataList.map((metadata, index) => {
						const entryPath = entryPaths[index] ?? `${this.#init.path}[${index}]`;
						if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
							throw new Error(`🚨 Adapter listItemMetadata("${this.#init.path}") for collection "${this.#init.name}" must return an array of objects.`);
						}

						const schema = this.#init.schema?.metadata;
						if (schema) {
							return validate(schema, metadata as StandardSchemaV1.InferInput<typeof schema>) as Promise<CollectionMetadata<A, B>>;
						}

						return Promise.resolve(metadata as CollectionMetadata<A, B>);
					})
				);
			}

			return Promise.all(
				entryPaths.map((entryPath) => this.#loadAdapterMetadata(entryPath))
			);
		}

		return Promise.all(
			Array.from(this.getSlugMap().values()).map((path) => this.#loadEntryMetadata(path))
		);
	}

	async getEntry(slug: string) {
		if (this.#usesAdapter) {
			const slugMap = await this.#getAdapterSlugMap();
			const entryPath = slugMap.get(slug);

			if (!entryPath) {
				const mapJson = JSON.stringify(Object.fromEntries(slugMap), null, 2);
				throw new Error(`🚨 Entry with slug "${slug}" not found in collection "${this.#init.name}". ${mapJson}`);
			}

			const adapter = this.#init.adapter!;
			const raw = await adapter.readFile(entryPath);

			const entry = new Entry<StandardSchemaV1<A, B>>(entryPath, {
				frontMatterSchema: this.#init.schema?.metadata,
				raw,
			});
			return entry.load();
		}

		const slugMap = this.getSlugMap();
		const entryPath = slugMap.get(slug);

		if (!entryPath) {
			throw new Error(`🚨 Entry with slug "${slug}" not found in collection "${this.#init.name}".`);
		}

		const entry = new Entry<StandardSchemaV1<A, B>>(entryPath, {
			frontMatterSchema: this.#init.schema?.metadata
		});
		return entry.load();
	}

	async getEntryMetadata(slug: string): Promise<CollectionMetadata<A, B>> {
		if (this.#usesAdapter) {
			const slugMap = await this.#getAdapterSlugMap();
			const entryPath = slugMap.get(slug);

			if (!entryPath) {
				throw new Error(`🚨 Entry with slug "${slug}" not found in collection "${this.#init.name}".`);
			}

			return this.#loadAdapterMetadata(entryPath);
		}

		const slugMap = this.getSlugMap();
		const entryPath = slugMap.get(slug);

		if (!entryPath) {
			throw new Error(`🚨 Entry with slug "${slug}" not found in collection "${this.#init.name}".`);
		}

		return this.#loadEntryMetadata(entryPath);
	}
}

export type ExtractEntryMetadataType<
	S extends StudioConfig<IStudioConfig>,
	N extends keyof S['__']
> = StandardSchemaV1.InferOutput<NotUndefined<S['__'][N]['_metadataSchema']>>;

type NotUndefined<T> = T extends undefined ? never : T;
