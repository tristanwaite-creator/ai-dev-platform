#!/usr/bin/env node

import { Sandbox } from '@e2b/code-interpreter';

const sandboxId = 'i3zxo8jswsujgpsuh0dqp';

async function reconnectAndTest() {
  console.log(`🔄 Attempting to reconnect to sandbox: ${sandboxId}\n`);

  try {
    // Try to reconnect to existing sandbox
    const sandbox = await Sandbox.reconnect(sandboxId);
    console.log('✅ Successfully reconnected to sandbox!\n');

    // List files
    console.log('📁 Files in /home/user:');
    const files = await sandbox.files.list('/home/user');
    if (files.length === 0) {
      console.log('   ❌ EMPTY - No files found!\n');
    } else {
      files.forEach((file: string) => {
        console.log(`   ✅ ${file}`);
      });
      console.log('');
    }

    // Check running processes
    console.log('🔧 Checking for Python HTTP server:');
    const psResult = await sandbox.commands.run('ps aux | grep -E "python3.*http.server" | grep -v grep || echo "NOT RUNNING"');
    console.log('   Result:', psResult.stdout.trim() || 'No processes found');

    // Start server if not running
    if (!psResult.stdout.includes('http.server')) {
      console.log('\n🚀 Starting web server...');
      await sandbox.commands.run('cd /home/user && python3 -m http.server 8000 > /tmp/server.log 2>&1 &', {
        timeoutMs: 2000
      }).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test localhost
      console.log('🌐 Testing local connection...');
      const curlResult = await sandbox.commands.run('curl -s http://localhost:8000 | head -5');
      if (curlResult.stdout.trim()) {
        console.log('   ✅ Server is responding!');
        console.log('   ' + curlResult.stdout.substring(0, 150));
      } else {
        console.log('   ❌ Server not responding');
      }
    }

    console.log(`\n🔗 URL: https://${sandboxId}.e2b.dev:8000`);
    console.log('\nTry accessing this URL in your browser now!\n');

    await sandbox.close();

  } catch (error: any) {
    console.error('❌ Failed to reconnect:', error.message);
    console.log('\nThis sandbox may have expired or been deleted.\n');
  }
}

reconnectAndTest();
