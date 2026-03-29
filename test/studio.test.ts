import type { StandardSchemaV1 } from "@standard-schema/spec";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { inspect } from "node:util";
import { Collection, defineStudioConfig } from "../src/index";
import { RemoteAdapter } from "../src/adapters/remote";
import { Secret } from "../src/util";

const tempParentDir = join(process.cwd(), ".tmp-tests");
const originalFetch = globalThis.fetch;

let tempRootDir = "";

const metadataSchema: StandardSchemaV1<
	Record<string, unknown>,
	{ title: string; tags: string[]; featured: boolean }
> = {
	"~standard": {
		version: 1,
		vendor: "test",
		types: {
			input: {} as Record<string, unknown>,
			output: {} as { title: string; tags: string[]; featured: boolean },
		},
		validate(value: unknown) {
			const input = value as Record<string, unknown>;

			return {
				value: {
					title: String(input.title ?? ""),
					tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag)) : [],
					featured: Boolean(input.featured),
				},
			};
		},
	},
};

function writeTempFile(path: string, content: string) {
	const fullPath = join(tempRootDir, path);
	mkdirSync(dirname(fullPath), { recursive: true });
	writeFileSync(fullPath, content, "utf-8");
	return fullPath;
}

describe("Collection", () => {
	beforeEach(() => {
		mkdirSync(tempParentDir, { recursive: true });
		tempRootDir = mkdtempSync(join(tempParentDir, "studio-"));
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		rmSync(tempRootDir, { recursive: true, force: true });
		tempRootDir = "";
	});

	test("loads entries from the local filesystem by default", async () => {
		const postsDir = join(tempRootDir, "content", "posts");
		writeTempFile(
			"content/posts/hello-world.md",
			[
				"---",
				"title: Hello World",
				"tags: [intro, welcome]",
				"---",
				"",
				"Hello from shrubs studio.",
			].join("\n"),
		);

		const collection = Collection.define({
			name: "posts",
			path: relative(process.cwd(), postsDir),
		});

		const entries = await collection.getEntries();

		expect(entries).toHaveLength(1);
		expect(entries[0]?.slug).toBe("hello-world");
		expect(entries[0]?.metadata).toEqual({
			title: "Hello World",
			tags: ["intro", "welcome"],
		});
		expect(entries[0]?.content.trim()).toBe("Hello from shrubs studio.");
		expect((await collection.getEntry("hello-world")).slug).toBe("hello-world");
	});

	test("returns collection metadata with schema output types", async () => {
		const postsDir = join(tempRootDir, "content", "posts");
		writeTempFile(
			"content/posts/hello-world.md",
			[
				"---",
				"title: Hello World",
				"tags: [intro, welcome]",
				"featured: true",
				"---",
				"",
				"Hello from shrubs studio.",
			].join("\n"),
		);

		const collection = Collection.define({
			name: "posts",
			path: relative(process.cwd(), postsDir),
			schema: {
				metadata: metadataSchema,
			},
		});

		const allMetadata = await collection.getEntriesMetadata();
		const singleMetadata = await collection.getEntryMetadata("hello-world");

		expect(allMetadata).toEqual([
			{
				title: "Hello World",
				tags: ["intro", "welcome"],
				featured: true,
			},
		]);
		expect(singleMetadata).toEqual({
			title: "Hello World",
			tags: ["intro", "welcome"],
			featured: true,
		});
	});

	test("rejects duplicate slugs from the local filesystem", async () => {
		const postsDir = join(tempRootDir, "content", "posts");
		writeTempFile("content/posts/hello-world.md", "---\ntitle: Hello World\n---\n");
		writeTempFile("content/posts/hello-world.mdx", "---\ntitle: Hello Again\n---\n");

		const collection = Collection.define({
			name: "posts",
			path: relative(process.cwd(), postsDir),
		});

		await expect(collection.getEntries()).rejects.toThrow('Duplicate slug "hello-world"');
	});

	test("uses the configured adapter for listing and reading entries", async () => {
		const readFileCalls: string[] = [];
		const getMetadataCalls: string[] = [];
		let listItemMetadataCalls = 0;
		let readDirCalls = 0;

		const adapter = new RemoteAdapter({
			async listItemKeys(path: string) {
				readDirCalls += 1;
				expect(path).toBe("/blog/posts");
				return ["hello-world", "getting-started"];
			},
			async getItem(slug: string) {
				readFileCalls.push(slug);
				if (slug === "hello-world") {
					return "---\ntitle: Hello World\n---\n\nWelcome.";
				}

				return "---\ntitle: Getting Started\n---\n\nDocs.";
			},
			async getMetadata(slug: string) {
				getMetadataCalls.push(slug);
				if (slug === "hello-world") {
					return {
						title: "Hello World",
					};
				}

				return {
					title: "Getting Started",
				};
			},
			async listItemMetadata(path: string) {
				listItemMetadataCalls += 1;
				expect(path).toBe("/blog/posts");
				return [
					{
						title: "Hello World",
					},
					{
						title: "Getting Started",
					},
				];
			},
		});

		const collection = Collection.define({
			name: "posts",
			path: "/blog/posts",
			source: "remote",
			adapter,
		});
		const studio = defineStudioConfig({
			collections: [collection],
		});

		const entries = await studio.getCollection("posts").getEntries();
		const single = await collection.getEntry("hello-world");
		const metadataList = await collection.getEntriesMetadata();
		const singleMetadata = await collection.getEntryMetadata("hello-world");

		expect(() => collection.getSlugMap()).toThrow("adapter-backed collections");
		expect(readDirCalls).toBe(1);
		expect(listItemMetadataCalls).toBe(1);
		expect(getMetadataCalls).toEqual([
			"hello-world",
		]);
		expect(readFileCalls).toEqual([
			"hello-world",
			"getting-started",
			"hello-world",
		]);
		expect(entries.map((entry) => entry.slug)).toEqual([
			"hello-world",
			"getting-started",
		]);
		expect(single.metadata).toEqual({
			title: "Hello World",
		});
		expect(metadataList).toEqual([
			{
				title: "Hello World",
			},
			{
				title: "Getting Started",
			},
		]);
		expect(singleMetadata).toEqual({
			title: "Hello World",
		});
	});

	test("rejects duplicate slugs from adapter-backed collections after key normalization", async () => {
		const collection = Collection.define({
			name: "posts",
			path: "/blog/posts",
			source: "remote",
			adapter: {
				async readDir() {
					return [
						"/blog/posts/hello-world",
						"/blog/posts/hello-world",
					];
				},
				async readFile() {
					return "";
				},
			},
		});

		await expect(collection.getEntries()).rejects.toThrow('Duplicate slug "/blog/posts/hello-world"');
	});

	test("requires an adapter when source is remote", () => {
		expect(() =>
			Collection.define({
				name: "posts",
				path: "/blog/posts",
				source: "remote",
			}),
		).toThrow('has source "remote" but no adapter was provided');
	});
});

describe("RemoteAdapter", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("builds request URLs and preserves headers when created from a base URL", async () => {
		const requests: Array<{ url: string; headers?: Record<string, string> | undefined }> = [];

		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;

			requests.push({ url, headers: init?.headers as Record<string, string> | undefined });

			if (url.endsWith("/blog/posts")) {
				return new Response(JSON.stringify(["hello-world.md", "getting-started.mdx"]), {
					status: 200,
				});
			}

			if (url.endsWith("/blog/posts/hello-world.md")) {
				return new Response("---\ntitle: Hello World\n---\n\nWelcome.", {
					status: 200,
				});
			}

			return new Response("Not found", { status: 404, statusText: "Not Found" });
		}) as typeof fetch;

		const adapter = RemoteAdapter.from({
			url: "https://api.example.com/content/",
			headers: {
				Authorization: "Bearer secret",
			},
		});

		const listing = await adapter.readDir("/blog/posts");
		const raw = await adapter.readFile("/blog/posts/hello-world.md");

		expect(listing).toEqual([
			"/blog/posts/hello-world.md",
			"/blog/posts/getting-started.mdx",
		]);
		expect(raw).toContain("title: Hello World");
		expect(requests).toEqual([
			{
				url: "https://api.example.com/content/blog/posts",
				headers: {
					Authorization: "Bearer secret",
				},
			},
			{
				url: "https://api.example.com/content/blog/posts/hello-world.md",
				headers: {
					Authorization: "Bearer secret",
				},
			},
		]);
	});

	test("exposes optional metadata handlers when provided", async () => {
		const adapter = new RemoteAdapter({
			async getItem(slug: string) {
				return `content for ${slug}`;
			},
			async listItemKeys() {
				return ["hello-world"];
			},
			async getMetadata(slug: string) {
				return {
					slug,
					title: "Hello World",
				};
			},
			async listItemMetadata() {
				return [
					{
						slug: "hello-world",
						title: "Hello World",
					},
				];
			},
		});

		await expect(adapter.getMetadata?.("hello-world")).resolves.toEqual({
			slug: "hello-world",
			title: "Hello World",
		});
		await expect(adapter.listItemMetadata?.("/blog/posts")).resolves.toEqual([
			{
				slug: "hello-world",
				title: "Hello World",
			},
		]);
	});
});

describe("GitHubAdapter", () => {
	test("connects, normalizes paths, and proxies file operations through Octokit", async () => {
		const calls = {
			auth: "",
			requests: [] as Array<{ route: string; params: Record<string, string> }>,
			getBranch: [] as Array<Record<string, string>>,
			createRef: [] as Array<Record<string, string>>,
			getContent: [] as Array<Record<string, string>>,
			writeFile: [] as Array<Record<string, string>>,
			deleteFile: [] as Array<Record<string, string>>,
		};

		mock.module("octokit", () => ({
			Octokit: class {
				constructor(config: { auth: string }) {
					calls.auth = config.auth;
				}

				request = async (route: string, params: Record<string, string>) => {
					calls.requests.push({ route, params });
					return {
						data: {
							default_branch: "main",
						},
					};
				};

				rest = {
					repos: {
						getBranch: async (params: Record<string, string>) => {
							calls.getBranch.push(params);

							if (params.branch === "content") {
								throw new Error("Branch not found");
							}

							return {
								data: {
									commit: {
										sha: "default-branch-sha",
									},
								},
							};
						},
						getContent: async (params: Record<string, string>) => {
							calls.getContent.push(params);

							if (params.path === "content/posts") {
								return {
									status: 200,
									data: [
										{ path: "content/posts/hello-world.md" },
										{ path: "content/posts/guide.mdx" },
									],
								};
							}

							return {
								status: 200,
								data: {
									type: "file",
									sha: "blob-sha",
									content: Buffer.from("---\ntitle: Hello World\n---\n\nWelcome.").toString("base64"),
								},
							};
						},
						createOrUpdateFileContents: async (params: Record<string, string>) => {
							calls.writeFile.push(params);
							return { status: 200 };
						},
						deleteFile: async (params: Record<string, string>) => {
							calls.deleteFile.push(params);
							return { status: 200 };
						},
					},
					git: {
						createRef: async (params: Record<string, string>) => {
							calls.createRef.push(params);
							return { status: 201 };
						},
					},
				};
			},
		}));

		const { GitHubAdapter } = await import("../src/adapters/github");
		const adapter = new GitHubAdapter({
			repo: "octocat/my-content",
			branch: "content",
			token: Secret.from("gh-token"),
		});

		await adapter.connect();
		const entries = await adapter.readDir("./content/posts");
		const raw = await adapter.readFile("./content/posts/hello-world.md");
		const writeResult = await adapter.writeFile("./content/posts/hello-world.md", "Updated content");
		const removeResult = await adapter.remove("./content/posts/hello-world.md");

		expect(calls.auth).toBe("gh-token");
		expect(calls.requests).toEqual([
			{
				route: "GET /repos/{owner}/{repo}",
				params: {
					owner: "octocat",
					repo: "my-content",
				},
			},
		]);
		expect(calls.getBranch).toEqual([
			{
				owner: "octocat",
				repo: "my-content",
				branch: "content",
			},
			{
				owner: "octocat",
				repo: "my-content",
				branch: "main",
			},
		]);
		expect(calls.createRef).toEqual([
			{
				owner: "octocat",
				repo: "my-content",
				ref: "refs/heads/content",
				sha: "default-branch-sha",
			},
		]);
		expect(entries).toEqual([
			"content/posts/hello-world.md",
			"content/posts/guide.mdx",
		]);
		expect(raw).toContain("title: Hello World");
		expect(writeResult).toBe(true);
		expect(removeResult).toBe(true);
		expect(calls.getContent).toEqual([
			{
				owner: "octocat",
				repo: "my-content",
				path: "content/posts",
				ref: "content",
			},
			{
				owner: "octocat",
				repo: "my-content",
				path: "content/posts/hello-world.md",
				ref: "content",
			},
			{
				owner: "octocat",
				repo: "my-content",
				path: "content/posts/hello-world.md",
				ref: "content",
			},
		]);
		expect(calls.writeFile[0]).toEqual({
			owner: "octocat",
			repo: "my-content",
			content: Buffer.from("Updated content", "utf-8").toString("base64"),
			message: "Update ./content/posts/hello-world.md via Studio GitHub Adapter",
			path: "content/posts/hello-world.md",
			branch: "content",
		});
		expect(calls.deleteFile[0]).toEqual({
			owner: "octocat",
			repo: "my-content",
			message: "Delete ./content/posts/hello-world.md via Studio GitHub Adapter",
			path: "content/posts/hello-world.md",
			branch: "content",
			sha: "blob-sha",
		});
		expect(await adapter.commit("ignored")).toBe(true);
		expect(await adapter.hasPendingChanges()).toBe(false);
		expect(await adapter.disconnect()).toBe(true);
	});
});

describe("Secret", () => {
	const envVarName = "SHRUBS_STUDIO_TEST_SECRET";

	afterEach(() => {
		delete process.env[envVarName];
	});

	test("reveals the original value while keeping string representations redacted", () => {
		const secret = Secret.from("super-secret-token");

		expect(Secret.reveal(secret)).toBe("super-secret-token");
		expect(secret.toString()).toBe("[object Secret]");
		expect(String(secret)).toBe("<redacted>");
		expect(`${secret as unknown as string}`).toBe("<redacted>");
		expect(JSON.stringify(secret)).toBe('"<redacted>"');
		expect(inspect(secret)).toBe("<redacted>");
	});

	test("loads secrets from the environment", () => {
		process.env[envVarName] = "env-secret";

		const secret = Secret.fromEnv(envVarName);

		expect(Secret.reveal(secret)).toBe("env-secret");
	});

	test("throws when an environment secret is missing", () => {
		delete process.env[envVarName];

		expect(() => Secret.fromEnv(envVarName)).toThrow(
			`Environment variable "${envVarName}" is not defined`,
		);
	});
});
