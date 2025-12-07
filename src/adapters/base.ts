import type { Collection } from "../fs";

export interface IAdapter {
	context?: any;

	// Connect to the backend service
	connect(): Promise<boolean>;
	// Disonnect from the backend service
	disconnect(): Promise<boolean>;

	// manage files
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<boolean>;
	remove(path: string): Promise<boolean>;

	// transaction
	commit?(message: string): Promise<boolean>;
	hasPendingChanges(): Promise<boolean>;

}

export class Contextable<Ctx = any> {
	constructor(public readonly context: Ctx) { }
}