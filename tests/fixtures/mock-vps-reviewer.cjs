const readline = require('readline');
const process = require('node:process');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const frame = JSON.parse(line);
  process.stdout.write(JSON.stringify({ type: 'response', id: frame.id, success: true, data: {} }) + '\n');
  if (frame.type !== 'prompt' || process.env.VPS_REVIEW_TEST_HANG === '1') return;
  const text = process.env.DEVLAUNCHER_VPS_TOKEN ? '{"approved":false,"reason":"Token leaked"}' : process.env.VPS_REVIEW_TEST_ANSWER;
  process.stdout.write(JSON.stringify({ type: 'agent_end', messages: [{ role: 'assistant', content: text }] }) + '\n');
});
process.stdout.write('{"type":"ready"}\n');
