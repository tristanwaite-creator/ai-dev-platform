#!/usr/bin/env node

import { e2bService } from './src/lib/e2b.js';

const sandboxId = 'i77m183jxcesn47tzx3ax';

async function checkSandbox() {
  console.log(`🔍 Checking sandbox: ${sandboxId}\n`);

  try {
    // List files in /home/user
    console.log('📁 Files in /home/user:');
    const files = await e2bService.listFiles(sandboxId, '/home/user');

    if (files.length === 0) {
      console.log('   ❌ No files found! The directory is empty.\n');
      console.log('This explains why the page isn\'t loading.\n');
    } else {
      files.forEach((file: string) => {
        console.log(`   ✅ ${file}`);
      });
      console.log('');
    }

    // Check if web server is running
    console.log('🌐 Testing web server...');
    const testUrl = `https://${sandboxId}.e2b.dev:8000`;
    console.log(`   URL: ${testUrl}\n`);

    // Try to list processes to see if Python server is running
    console.log('🔧 Checking if Python HTTP server is running...');
    const result = await e2bService.getSandbox(sandboxId)?.sandbox.commands.run('ps aux | grep python3');
    console.log(result?.stdout || 'No output');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkSandbox();
