export interface IAdapter {
	context?: unknown;

	// Connect to the backend service if setup is required.
	connect?(): Promise<this>;
	// Disconnect from the backend service if teardown is required.
	disconnect?(): Promise<boolean>;

	// Read collection entries using adapter-specific keys.
	readFile(path: string): Promise<string>;
	readDir(path: string): Promise<string[]>;
	getMetadata?(path: string): Promise<unknown>;
	listItemMetadata?(path: string): Promise<unknown[]>;
	writeFile?(path: string, content: string): Promise<boolean>;
	remove?(path: string): Promise<boolean>;

	// Transaction helpers for writable adapters.
	commit?(message: string): Promise<boolean>;
	hasPendingChanges?(): Promise<boolean>;
}

export class Contextable<Ctx = any> {
	constructor(public readonly context: Ctx) { }
}
