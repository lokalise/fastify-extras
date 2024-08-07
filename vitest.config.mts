import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		watch: false,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		pool: 'threads',
		environment: "node",
		reporters: ["verbose"],
		coverage: {
			provider: "v8",
			include: ["lib/**/*.ts"],
			exclude: [
				"lib/**/*.spec.ts",
				"lib/types.ts",
				"lib/index.ts",
				"lib/errors/publicErrors.ts",
			],
			reporter: ["text"],
			all: true,
			thresholds: {
				lines: 65,
				functions: 80,
				branches: 85,
				statements: 65,
			},
		},
	},
});
