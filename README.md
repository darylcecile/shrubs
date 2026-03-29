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

When your content lives behind an API or in a database, use `source: 'remote'` together with an adapter.

The adapter tells the collection how to list entries and how to load a single entry. There are two ways to create one:

#### `RemoteAdapter.from()` — URL + headers

The quickest way to connect to a REST API. Provide a base URL and optional headers (e.g. for auth). The adapter uses the native `fetch` API under the hood.

```ts
import { Collection } from '@shrubs/studio';
import { RemoteAdapter } from '@shrubs/studio/adapters/remote';

const adapter = RemoteAdapter.from({
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

#### `new RemoteAdapter()` — custom item + listing handlers

For full control, provide:

- `getItem(path)` to return the raw markdown for one entry
- `listItemKeys(path)` to return the available entry paths for the collection

##### Example: Fetching from a remote API with custom auth

```ts
import { Collection } from '@shrubs/studio';
import { RemoteAdapter } from '@shrubs/studio/adapters/remote';

const adapter = new RemoteAdapter({
  getItem: async (path) => {
    const token = await getAccessToken(); // your auth logic

    const res = await fetch(`https://cms.example.com${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`CMS request failed: ${res.status}`);
    }

    return res.text();
  },
  listItemKeys: async (path) => {
    const token = await getAccessToken();

    const res = await fetch(`https://cms.example.com${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`CMS request failed: ${res.status}`);
    }

    const filenames = await res.json() as string[];
    return filenames.map((name) => `${path}/${name}`);
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

You can use the adapter to bridge any data source, including a SQL database.

```ts
import { Collection } from '@shrubs/studio';
import { RemoteAdapter } from '@shrubs/studio/adapters/remote';
import { db } from './db';           // your Drizzle instance
import { posts } from './db/schema'; // your Drizzle table
import { eq } from 'drizzle-orm';

const adapter = new RemoteAdapter({
  getItem: async (path) => {
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
  listItemKeys: async (path) => {
    const rows = await db.select({ slug: posts.slug }).from(posts);
    return rows.map((row) => `${path}/${row.slug}.md`);
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

Use `defineStudioConfig` to group collections into a single typed config object:

```ts
import { defineStudioConfig, Collection } from '@shrubs/studio';
import { GitHubAdapter } from '@shrubs/studio/adapters/github';
import { RemoteAdapter } from '@shrubs/studio/adapters/remote';

// this adapter will handle fetching for a collection in the config
const gitAdapter = new GitHubAdapter({
    repo: 'octocat/my-content',
    branch: 'main',
});

const dbAdapter = new RemoteAdapter({
  getItem: async (path) => {
    // custom fetch logic for a database that returns raw markdown
    return [
	  '---',
	  'title: Hello World',
	  'date: 2024-01-01',
	  'tags: [example, test]',
	  '---',
	  '',
	  '# Hello World',
	  'This is a sample post fetched from a database.',
	].join('\n');
  },
  listItemKeys: async (path) => {
    // custom logic to list all entry paths for this collection
    return [`${path}/hello-world.md`];
  },
})

const studio = defineStudioConfig({
  collections: [
    Collection.define({ name: 'posts', path: './content/posts', source: 'remote', adapter: gitAdapter }),
    Collection.define({ name: 'docs',  path: './content/docs', source: 'remote', adapter: dbAdapter  }),
  ],
});

// Fully typed — autocompletes collection names
const postsCollection = studio.getCollection('posts');

const entries = await postsCollection.getEntries(); // instead of directly calling readfilesync, the collection uses the adapter to fetch content from GitHub using it's readDir and readFile methods under the hood

const singleEntry = await postsCollection.getEntry('hello-world'); // fetches from the adapter 
```
