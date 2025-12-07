import type { StandardSchemaV1 } from "@standard-schema/spec";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Entry } from './entry';
import type { StudioConfig, IStudioConfig } from "..";

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
}

export class Collection<N extends string, A, B> {
	#init: CollectionInit<N, A, B>;
	#slugToPathMap: Map<string, string> = new Map();

	protected constructor(init: CollectionInit<N, A, B>) {
		this.#init = init;
	}

	static define<const N extends string, A, B>(init: CollectionInit<N, A, B>) {
		return new Collection<N, A, B>(init);
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

	getSlugMap() {
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
		return Promise.all(
			this.getSlugMap().values().toArray().map(path => {
				const entry = new Entry<StandardSchemaV1<A, B>>(path, {
					frontMatterSchema: this.#init.schema?.metadata
				});
				return entry.load();
			})
		);
	}

	async getEntry(slug: string) {
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
}

export type ExtractEntryMetadataType<
	S extends StudioConfig<IStudioConfig>,
	N extends keyof S['__']
> = StandardSchemaV1.InferOutput<NotUndefined<S['__'][N]['_metadataSchema']>>;

type NotUndefined<T> = T extends undefined ? never : T;