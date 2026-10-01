// Real omp engine, isolated local model/MCP fixtures. No provider credentials or VPS.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { setTimeout, clearTimeout } = require('timers');

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-omp-tools-'));
  const seen = [];
  let modelCalls = 0;
  let scopedAuth = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) { res.statusCode = 405; res.end(); return; }
      const msg = JSON.parse(body);
      if (req.url === '/v1/chat/completions') {
        modelCalls++;
        const names = (msg.tools || []).map((tool) => tool.function.name);
        if (names.some((name) => name !== 'mcp__devlauncher_vps_vps_get_overview')) {
          res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'Unexpected ambient tool' } })); return;
        }
        res.setHeader('Content-Type', 'text/event-stream');
        const tool = modelCalls === 1;
        const delta = tool
          ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-call', type: 'function', function: { name: 'mcp__devlauncher_vps_vps_get_overview', arguments: '{}' } }] }
          : { role: 'assistant', content: 'Fixture VPS overview received.' };
        res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\n`);
        res.end('data: [DONE]\n\n'); return;
      }
      if (req.url === '/mcp') scopedAuth ||= req.headers.authorization === 'Bearer smoke-token';
      seen.push(msg.method);
      let result = {};
      if (msg.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'vps-smoke', version: '1' } };
      if (msg.method === 'tools/list') result = { tools: [{ name: req.url === '/other' ? 'read_local' : 'vps_get_overview', description: 'Smoke fixture tool', inputSchema: { type: 'object', properties: {} } }] };
      if (msg.method === 'tools/call') result = { content: [{ type: 'text', text: '{"hostname":"fixture-vps","available":true}' }] };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, result }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(path.join(dir, '.omp'));
  const source = fs.readFileSync(path.join(__dirname, '../electron/managers/vps/vpsScopes.ts'), 'utf8');
  const guard = /export const VPS_TOOL_GUARD = `([\s\S]*?)`/.exec(source)?.[1];
  if (!guard) throw new Error('Production VPS guard not found');
  fs.writeFileSync(path.join(dir, 'guard.mjs'), guard);
  const agentDir = path.join(dir, 'agent'); fs.mkdirSync(agentDir);
  fs.writeFileSync(path.join(agentDir, 'models.yml'), JSON.stringify({ providers: { 'vps-smoke': {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-key',
    models: [{ id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }));
  fs.writeFileSync(path.join(dir, '.omp', 'mcp.json'), JSON.stringify({ mcpServers: {
    outside: { type: 'http', url: `http://127.0.0.1:${server.address().port}/other` },
    devlauncher: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, enabled: false },
    devlauncher_vps: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, headers: { Authorization: 'Bearer ${DEVLAUNCHER_VPS_TOKEN}' } },
  } }));
  const child = spawn(process.env.OMP_BINARY || path.join(process.env.LOCALAPPDATA, 'omp', 'omp.exe'), ['--mode', 'rpc', '--model', 'vps-smoke/fixture', '--no-tools', '--no-extensions', '--extension', path.join(dir, 'guard.mjs'), '--no-skills', '--no-rules', '--no-lsp'], {
    cwd: dir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, DEVLAUNCHER_VPS_TOKEN: 'smoke-token', OMP_MCP_STARTUP_TIMEOUT_MS: '0' }, windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('omp tool inspection timed out')), 30000);
      let buffer = '';
      const toolEvents = [];
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let frame; try { frame = JSON.parse(line); } catch { continue; }
          if (frame.type === 'ready') child.stdin.write(JSON.stringify({ id: 'state', type: 'get_state' }) + '\n');
          if (frame.id === 'state') {
            const tools = (frame.data?.dumpTools || []).map((tool) => tool.name);
            if (tools.length !== 1 || tools[0] !== 'mcp__devlauncher_vps_vps_get_overview' || !scopedAuth) {
              clearTimeout(timer); reject(new Error('Scoped tool/auth isolation failed')); return;
            }
            child.stdin.write(JSON.stringify({ id: 'prompt', type: 'prompt', message: 'Read the bound VPS overview using its tool.' }) + '\n');
          }
          if (frame.type?.startsWith('tool_execution_')) toolEvents.push(frame.type);
          if (frame.type === 'agent_end') {
            if (!seen.includes('tools/call') || !toolEvents.includes('tool_execution_end') || modelCalls < 2) {
              clearTimeout(timer); reject(new Error('Real omp tool execution did not complete')); return;
            }
            console.log(JSON.stringify({ methods: seen, toolEvents, modelCalls, scopedAuth, isolatedTools: true }));
            clearTimeout(timer); resolve();
          }
        }
      });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('exit', (code) => { if (code) { clearTimeout(timer); reject(new Error(`omp exited ${code}`)); } });
    });
  } finally {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await stopped; server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
