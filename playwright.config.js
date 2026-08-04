// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the built _site/ (npm run build), served statically.
 * Video carousels need real scroll/wheel/drag physics — no mocking.
 */
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	reporter: [['list']],
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'python3 -m http.server 4173 --directory _site',
		url: 'http://127.0.0.1:4173/',
		reuseExistingServer: !process.env.CI,
		timeout: 20_000,
	},
	projects: [
		{
			name: 'Desktop Chrome',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'Mobile Chrome',
			use: { ...devices['Pixel 7'] },
		},
	],
});
