#!/usr/bin/env node
// Mock omp RPC process that announces readiness and then exits on the first
// incoming command WITHOUT responding. Used to verify that in-flight RPC
// requests are rejected immediately when the process dies (instead of hanging
// until their own timeout).
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', () => {
  process.exit(0)
})

rl.on('close', () => process.exit(0))

process.stdout.write(JSON.stringify({ type: 'ready' }) + '\n')
