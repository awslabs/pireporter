/**
 * Unit tests for pireporter CLI
 * @module test/pireporter.test
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

describe('pireporter CLI - Chat Option', () => {
  test('--help includes chat option with description', () => {
    const result = execSync('node pireporter.js --help', { encoding: 'utf8' });
    expect(result).toContain('--chat');
    expect(result).toContain('-t');
    expect(result).toContain('interactive chat mode');
    expect(result).toContain('--ai-analyzes');
  });

  test('--chat flag is recognized', () => {
    try {
      execSync('node pireporter.js --create-report --chat', { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      expect(error.stderr || error.stdout).toContain('snapshot');
      expect(error.stderr || error.stdout).not.toContain('Unknown option');
    }
  });

  test('chat mode requires ai-analyzes flag', () => {
    try {
      execSync('node pireporter.js --create-report --snapshot test.json --chat', { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      expect(error.stderr || error.stdout).toContain('requires --ai-analyzes');
    }
  });

  test('pireporter.js contains chat integration code', () => {
    const content = fs.readFileSync('./pireporter.js', 'utf8');
    expect(content).toContain("name: 'chat'");
    expect(content).toContain("require('./chatSession')");
    expect(content).toContain("type: 'single_snapshot'");
    expect(content).toContain("type: 'compare'");
  });
});
