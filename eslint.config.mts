import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = fileURLToPath(new URL(".", import.meta.url));
type TsEslintConfigParam = Parameters<typeof tseslint.config>[number];
const obsidianRecommendedConfigs = Array.from(
	(obsidianmd.configs?.recommended as unknown as Iterable<TsEslintConfigParam> | undefined) ?? [],
);

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'eslint.config.mts',
						'manifest.json'
					]
				},
				tsconfigRootDir,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianRecommendedConfigs,
	globalIgnores([
		"node_modules",
		"dist",
		"release",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
