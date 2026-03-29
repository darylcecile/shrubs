# @shrubs/studio

A typed content collection library for Markdown and MDX content from either the local filesystem or adapter-backed remote sources.

## Installation

```bash
bun add @shrubs/studio
```

## Package Exports

```ts
import { Collection, defineStudioConfig, RemoteAdapter } from "@shrubs/studio";
import { GitHubAdapter } from "@shrubs/studio/adapters/github";
import { Secret } from "@shrubs/studio/util";
```

`GitHubAdapter` and `Secret` are not exported from the package root.

## Filesystem Collections

Collections default to `source: "fs"`, so local content only needs a name and a path.

```ts
import { Collection } from "@shrubs/studio";

const posts = Collection.define({
  name: "posts",
  path: "./content/posts",
});

const entries = await posts.getEntries();
const entry = await posts.getEntry("hello-world");
const metadata = await posts.getEntryMetadata("hello-world");
const allMetadata = await posts.getEntriesMetadata();

console.log(entries.length);
console.log(entry.slug); // "hello-world"
console.log(entry.metadata); // parsed front matter
console.log(entry.content); // markdown body
console.log(entry.readTime); // "1 minute read", "2 minutes", etc.
console.log(metadata);
console.log(allMetadata);
```

For filesystem collections, `getSlugMap()` returns the internal slug-to-path map:

```ts
const slugMap = posts.getSlugMap();
console.log(slugMap.get("hello-world"));
```

## Typed Metadata

`schema.metadata` accepts any Standard Schema-compatible validator, such as `zod` or `valibot`. Parsed front matter is validated and returned with the schema output type.

```ts
import { Collection } from "@shrubs/studio";
import { z } from "zod";

const metadataSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
});

const posts = Collection.define({
  name: "posts",
  path: "./content/posts",
  schema: {
    metadata: metadataSchema,
  },
});

const metadata = await posts.getEntryMetadata("hello-world");
metadata.featured; // boolean
```

If you prefer another validator, the only requirement is Standard Schema compatibility.

## Remote Collections

Remote collections must set `source: "remote"` and provide an adapter.

```ts
import { Collection, RemoteAdapter } from "@shrubs/studio";

const adapter = new RemoteAdapter({
  async listItemKeys(path) {
    console.log(path); // "/blog/posts"
    return ["hello-world", "getting-started"];
  },
  async getItem(slug) {
    if (slug === "hello-world") {
      return "---\ntitle: Hello World\n---\n\nWelcome.";
    }

    return "---\ntitle: Getting Started\n---\n\nDocs.";
  },
  async getMetadata(slug) {
    return { title: slug === "hello-world" ? "Hello World" : "Getting Started" };
  },
  async listItemMetadata() {
    return [
      { title: "Hello World" },
      { title: "Getting Started" },
    ];
  },
});

const posts = Collection.define({
  name: "posts",
  path: "/blog/posts",
  source: "remote",
  adapter,
});

const entries = await posts.getEntries();
const entry = await posts.getEntry("hello-world");
const metadata = await posts.getEntryMetadata("hello-world");
```

Adapter behavior:

- `listItemKeys(path)` returns the item keys for the collection.
- `getItem(path)` returns the raw Markdown or MDX for one item.
- `getMetadata(path)` is optional and lets metadata be fetched without loading the full document.
- `listItemMetadata(path)` is optional and lets collection metadata be fetched in one call.
- `getSlugMap()` is not supported for adapter-backed collections.

### `RemoteAdapter.from`

`RemoteAdapter.from()` builds a fetch-based adapter from a base URL.

```ts
import { Collection, RemoteAdapter } from "@shrubs/studio";

const adapter = RemoteAdapter.from({
  url: "https://api.example.com/content",
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
  },
});

const posts = Collection.define({
  name: "posts",
  path: "/blog/posts",
  source: "remote",
  adapter,
});

const entries = await posts.getEntries();
```

The listing request goes to `https://api.example.com/content/blog/posts` and should return a JSON array such as:

```json
["hello-world.md", "getting-started.mdx"]
```

Each returned value is joined onto the collection path, so the adapter will read:

```text
/blog/posts/hello-world.md
/blog/posts/getting-started.mdx
```

## GitHub Adapter

The GitHub adapter uses the GitHub contents API through Octokit.

```ts
import { Collection, defineStudioConfig } from "@shrubs/studio";
import { GitHubAdapter } from "@shrubs/studio/adapters/github";
import { Secret } from "@shrubs/studio/util";

const github = new GitHubAdapter({
  repo: "octocat/my-content",
  branch: "content",
  token: Secret.fromEnv("GITHUB_TOKEN"),
});

const posts = Collection.define({
  name: "posts",
  path: "./content/posts",
  source: "remote",
  adapter: github,
});

const studio = defineStudioConfig({
  collections: [posts],
});

const entries = await studio.getCollection("posts").getEntries();
```

Notes:

- `repo` must be in `owner/repo` format.
- `branch` defaults to `"main"`.
- `token` defaults to `Secret.fromEnv("GITHUB_TOKEN")`.
- `connect()` ensures the configured branch exists before reads.
- The adapter also exposes `writeFile()`, `remove()`, `commit()`, and `hasPendingChanges()` for workflows that need write access.

## Studio Config

`defineStudioConfig()` groups collections and gives you a typed `getCollection()` helper.

```ts
import { Collection, defineStudioConfig } from "@shrubs/studio";

const studio = defineStudioConfig({
  collections: [
    Collection.define({
      name: "posts",
      path: "./content/posts",
    }),
    Collection.define({
      name: "docs",
      path: "./content/docs",
    }),
  ],
});

const posts = studio.getCollection("posts");
const entries = await posts.getEntries();
```

If two non-skipped collections share the same name, `defineStudioConfig()` throws.
