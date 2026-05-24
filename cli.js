#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`
  📚 OpenBooks CLI

  Usage:
    openbooks              Start the web server and open browser
    openbooks serve        Start the web server (no auto-open)
    openbooks crawl        Run the resource crawler
    openbooks help         Show this help message

  Options:
    --port <n>             Set server port (default: 8080)
  `);
}

const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env.PORT = args[portIdx + 1];
}

switch (cmd) {
  case 'serve':
    require('./server.js');
    break;
  case 'crawl':
    require('./crawl.js');
    break;
  case 'help':
  case '--help':
  case '-h':
    usage();
    break;
  default:
    process.argv.push('--open');
    require('./server.js');
    break;
}
