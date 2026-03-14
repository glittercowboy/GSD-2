import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestContext } from './test-helpers.ts';

const { assertTrue, report } = createTestContext();
const promptPath = join(process.cwd(), 'src/resources/extensions/gsd/prompts/discuss.md');
const discussPrompt = readFileSync(promptPath, 'utf-8');

console.log('\n=== discuss prompt: resilient vision framing ===');
{
  const hardenedPattern = /Say exactly:\s*"What's the vision\?"/;
  assertTrue(!hardenedPattern.test(discussPrompt), 'prompt no longer uses exact-verbosity lock');
  assertTrue(
    discussPrompt.includes('Ask: "What\'s the vision?" once'),
    'prompt asks for vision exactly once',
  );
  assertTrue(
    discussPrompt.includes('Special handling'),
    'prompt documents special handling for non-vision user messages',
  );
  assertTrue(
    discussPrompt.includes('instead of repeating "What\'s the vision?"'),
    'prompt forbids repeating the vision question',
  );
}

report();
