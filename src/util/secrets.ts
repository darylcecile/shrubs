
export interface Secret<V> extends Object {};

const secretPointers = new WeakMap<Secret<any>, any>();

const base = {
	envBacking: undefined as (string | undefined),
	toString() {
		return "[object Secret]";
	},
	toJSON() {
		return "<redacted>"
	},
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return "<redacted>";
	},
	valueOf() {
		return "<redacted>";
	},
	[Symbol.toPrimitive]() {
		return "<redacted>";
	},
	[Symbol.dispose](this: Secret<unknown>) {
		secretPointers.delete(this);
	}
};

export const Secret = {
	from<V>(value: V): Secret<V> {
		const secret = Object.create(base) as Secret<V>;
		secretPointers.set(secret, value);
		return secret;
	},
	fromEnv<V = string>(envVar: string): Secret<V> {
		const value = process.env[envVar];
		if (value === undefined) {
			throw new Error(`Environment variable "${envVar}" is not defined`);
		}
		const secret = Object.create(base) ;
		secretPointers.set(secret, value);
		secret.envBacking = envVar;
		return secret as Secret<V>
	},
	reveal<V>(secret: Secret<V>): V {
		if (secretPointers.has(secret) === false) {
			return secret as unknown as V;
		}

		// If the secret is backed by an environment variable, retrieve the value from the environment variable.
		if ("envBacking" in secret && secret.envBacking) {
			const envValue = process.env[secret.envBacking as string];
			if (envValue === undefined) {
				throw new Error(`Environment variable "${secret.envBacking}" is not defined`);
			}
			return envValue as unknown as V;
		}

		const value = secretPointers.get(secret);
		if (value === undefined) {
			throw new Error("Invalid secret");
		}
		return value;
	}
} as const;