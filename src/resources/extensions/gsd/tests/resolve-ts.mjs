import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register hook to redirect imports to the dist directory
register(new URL('./dist-redirect.mjs', import.meta.url), pathToFileURL('./'));
