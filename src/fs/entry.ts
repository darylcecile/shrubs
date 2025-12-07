import type { StandardSchemaV1 } from '@standard-schema/spec';
import { readFileSync } from 'node:fs';
import { safeLoadFront } from 'yaml-front-matter';

type EntryInit<F> = {
	frontMatterSchema?: F
}

export class Entry<F extends StandardSchemaV1<unknown>> {
	readonly path: string;
	#metadata?: StandardSchemaV1.InferOutput<F>;
	#content?: string;

	#raw: string;
	#init?: EntryInit<F>;

	constructor(path: string, init?: EntryInit<F>) {
		this.path = path;
		this.#raw = readFileSync(this.path, 'utf-8');
		this.#init = init;
	}

	async load(): Promise<this> {
		if (this.#metadata && this.#content) return this;

		const { content, ...metadata } = safeLoadFront(this.#raw, {
			contentKeyName: "content",
		});

		if (this.#init?.frontMatterSchema) {
			try {
				const result = await validate(this.#init.frontMatterSchema, metadata);
				this.#metadata = result;
			} catch (e) {
				console.error(`🚨 Front matter validation error in file: ${this.path}\n   ${e}`);
			}
		}

		this.#metadata = metadata;
		this.#content = content;

		return this;
	}

	get readTime() {
		if (!this.#content) return "";

		const words = this.#content.split(" ");
		const time = Math.round(words.length / 200);
		if (time <= 1) {
			return "1 minute read";
		} else {
			return `${time} minutes`;
		}
	}

	get slug() {
		return (this.path.split('/').pop() || '').replace(/\.mdx?$/, '');
	}

	get metadata() {
		return this.#metadata as StandardSchemaV1.InferOutput<F>;
	}

	get content() {
		return this.#content || '';
	}

	toString() {
		if (!this.#content || !this.#metadata) {
			return this.#raw;
		}

		return [
			'---',
			...Object.entries(this.#metadata).map(([key, value]) => {
				return `${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : value}`;
			}),
			'---',
			'',
			this.#content
		].join('\n');
	}
}

// RIPPED from xsschema due to nextjs static import issues
const validate = async <T extends StandardSchemaV1>(schema: T, input: StandardSchemaV1.InferInput<T>): Promise<StandardSchemaV1.InferOutput<T>> => {
	let result = schema['~standard'].validate(input)
	if (result instanceof Promise)
		result = await result

	if (result.issues)
		throw new Error(JSON.stringify(result.issues, null, 2))

	return (result as StandardSchemaV1.SuccessResult<T>).value
}