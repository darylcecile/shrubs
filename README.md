# @shrubs/studio

A typed content-collection library for structured markdown/MDX content — with support for both local filesystem and remote sources.

## Installation

```bash
bun add @shrubs/studio
```

## Defining Collections

### Filesystem (default)

By default, collections read `.md` / `.mdx` files from a local directory:

```ts
import { Collection } from '@shrubs/studio';

const posts = Collection.define({
  name: 'posts',
  path: './content/posts',
});

// Get all entries
const entries = await posts.getEntries();

// Get a single entry by slug (filename without extension)
const entry = await posts.getEntry('hello-world');

console.log(entry.slug);     // 'hello-world'
console.log(entry.metadata); // parsed front-matter
console.log(entry.content);  // markdown body
console.log(entry.readTime); // e.g. '3 minutes'
```

### Remote Sources

When your content lives behind an API or in a database, use `source: 'remote'` together with a `RemoteCollectionAdapter`.

The adapter tells the collection *how* to fetch content. There are two ways to create one:

#### `RemoteCollectionAdapter.from()` — URL + headers

The quickest way to connect to a REST API. Provide a base URL and optional headers (e.g. for auth). The adapter uses the native `fetch` API under the hood.

```ts
import { Collection, RemoteCollectionAdapter } from '@shrubs/studio';

const adapter = RemoteCollectionAdapter.from({
  url: 'https://api.example.com/content',
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
  },
});

const posts = Collection.define({
  name: 'posts',
  path: '/blog/posts',
  source: 'remote',
  adapter,
});

const entries = await posts.getEntries();
```

> **How it works:** When the collection loads, the adapter fetches the listing path
> (e.g. `GET https://api.example.com/content/blog/posts`) and expects a JSON array
> of filenames back (e.g. `["hello-world.md", "getting-started.mdx"]`).
> It then fetches each file individually to retrieve its raw markdown content.

#### `new RemoteCollectionAdapter()` — custom fetcher

For full control — custom auth flows, non-HTTP sources, databases — pass a `fetcher`
function. The fetcher receives the requested path and must return the raw content as a string.

##### Example: Fetching from a remote API with custom auth

```ts
import { Collection, RemoteCollectionAdapter } from '@shrubs/studio';

const adapter = new RemoteCollectionAdapter({
  fetcher: async (path) => {
    const token = await getAccessToken(); // your auth logic

    const res = await fetch(`https://cms.example.com${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`CMS request failed: ${res.status}`);
    }

    return res.text();
  },
});

const posts = Collection.define({
  name: 'posts',
  path: '/articles',
  source: 'remote',
  adapter,
});
```

##### Example: Loading content from a SQL database with Drizzle ORM

You can use the custom fetcher to bridge any data source — including a SQL database.
The fetcher for the *listing* path should return a JSON array of filenames, and the
fetcher for an individual file path should return the raw markdown string.

```ts
import { Collection, RemoteCollectionAdapter } from '@shrubs/studio';
import { db } from './db';           // your Drizzle instance
import { posts } from './db/schema'; // your Drizzle table
import { eq } from 'drizzle-orm';

const adapter = new RemoteCollectionAdapter({
  fetcher: async (path) => {
    // Listing request — return JSON array of "filenames"
    if (path === '/blog/posts') {
      const rows = await db.select({ slug: posts.slug }).from(posts);
      return JSON.stringify(rows.map((r) => `${r.slug}.md`));
    }

    // Individual entry request — return raw markdown with front-matter
    const slug = path.split('/').pop()?.replace(/\.mdx?$/, '');
    if (!slug) throw new Error(`Invalid path: ${path}`);

    const [row] = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .limit(1);

    if (!row) throw new Error(`Post not found: ${slug}`);

    // Reconstruct markdown with YAML front-matter
    const frontMatter = [
      '---',
      `title: ${row.title}`,
      `date: ${row.date}`,
      `tags: [${row.tags.join(', ')}]`,
      '---',
    ].join('\n');

    return `${frontMatter}\n\n${row.content}`;
  },
});

const blogPosts = Collection.define({
  name: 'posts',
  path: '/blog/posts',
  source: 'remote',
  adapter,
});

// Works exactly the same as a filesystem collection
const allPosts = await blogPosts.getEntries();
const single = await blogPosts.getEntry('my-first-post');
```

## Studio Config

Use `defineStudioConfig` to group collections (and an optional remote adapter) into a single typed config object:

```ts
import { defineStudioConfig, Collection } from '@shrubs/studio';
import { GitHubAdapter } from '@shrubs/studio/adapters/github';

const studio = defineStudioConfig({
  remote: new GitHubAdapter({
    repo: 'octocat/my-content',
    branch: 'main',
  }),
  collections: [
    Collection.define({ name: 'posts', path: './content/posts' }),
    Collection.define({ name: 'docs',  path: './content/docs'  }),
  ],
});

// Fully typed — autocompletes collection names
const postsCollection = studio.getCollection('posts');
```
