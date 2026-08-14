import obsidianmd from 'eslint-plugin-obsidianmd';
import jest from 'eslint-plugin-jest';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'jest.config.ts'],
					defaultProject: 'tsconfig.src.json',
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/**/*.ts', '__mocks__/**/*.ts', 'jest.setup.ts'],
		plugins: {
			jest,
		},
		languageOptions: {
			globals: {
				...globals.node,
				...jest.environments.globals.globals,
			},
		},
		rules: {
			...jest.configs['flat/recommended'].rules,
			// obsidianmd rules enforce plugin API/UI conventions that don't apply
			// to test fixtures and mocks, which build throwaway DOM/objects directly.
			...Object.fromEntries(
				Object.keys(obsidianmd.rules).map((rule) => [`obsidianmd/${rule}`, 'off']),
			),
			'no-unsanitized/property': 'off',
			'@microsoft/sdl/no-inner-html': 'off',
			// Partial fixtures and jest.fn() mocks are routinely cast to strict
			// production types, which these rules can't distinguish from bugs.
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
		},
	},
);