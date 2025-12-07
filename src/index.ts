import type { IAdapter } from "./adapters/base";
import type { Collection } from "./fs";

export interface IStudioConfig {
	remote?: IAdapter;
	collections: Collection<string, unknown, unknown>[];
}

/**
 * A helper function to create a Studio configuration object.
 */
export function defineStudioConfig<const Config extends IStudioConfig>(config: Config) {
	const c = new Map<typeof config['collections'][number]['name'], typeof config['collections'][number]>();

	for (const collection of config.collections) {
		if (collection.skip) continue;
		
		if (c.has(collection.name)) {
			throw new Error(`🚨 Duplicate collection name detected: "${collection.name}". Make sure to skip unused collections or remove them altogether.`);
		}

		c.set(collection.name, collection);
	}

	type CollectionNames = typeof config['collections'][number] extends Collection<infer N, any, any> ? N : never;
	type CollectionByName<N extends CollectionNames> =
		Extract<typeof config['collections'][number], Collection<N, any, any>>;

	function getCollection<N extends CollectionNames>(name: N) {
		return c.get(name) as CollectionByName<N>;
	}

	return {
		_: config,
		__: Object.fromEntries(config.collections.map(col => [col.name, col])) as {
			[K in CollectionNames]: CollectionByName<K>
		},
		getCollection
	}
}

export type StudioConfig<C extends IStudioConfig> = ReturnType<typeof defineStudioConfig<C>>;

export * from "./fs"
