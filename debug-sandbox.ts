#!/usr/bin/env node

import { e2bService } from './src/lib/e2b.js';

const sandboxId = 'i3zxo8jswsujgpsuh0dqp';

async function debugSandbox() {
  console.log(`🔍 Debugging sandbox: ${sandboxId}\n`);

  const sandbox = e2bService.getSandbox(sandboxId);

  if (!sandbox) {
    console.log('❌ Sandbox not found in memory. Creating connection...');
    console.log('Note: This sandbox may have been cleaned up or is in a different process.\n');
    return;
  }

  try {
    // 1. List files
    console.log('📁 Files in /home/user:');
    const files = await sandbox.sandbox.files.list('/home/user');
    if (files.length === 0) {
      console.log('   ❌ EMPTY - No files found!\n');
    } else {
      files.forEach((file: any) => {
        console.log(`   ✅ ${file}`);
      });
      console.log('');
    }

    // 2. Check if files have content
    if (files.includes('index.html')) {
      console.log('📄 Reading index.html:');
      const content = await sandbox.sandbox.files.read('/home/user/index.html');
      console.log(content.substring(0, 200) + '...\n');
    }

    // 3. Check running processes
    console.log('🔧 Checking for Python HTTP server process:');
    const psResult = await sandbox.sandbox.commands.run('ps aux | grep -E "python3.*http.server" | grep -v grep');
    if (psResult.stdout.trim()) {
      console.log('   ✅ Server is running:');
      console.log('   ' + psResult.stdout.trim());
    } else {
      console.log('   ❌ Server NOT running!');
      console.log('\n🚀 Attempting to start server manually...');

      // Try to start the server
      await sandbox.sandbox.commands.run('cd /home/user && python3 -m http.server 8000 > /tmp/server.log 2>&1 &', {
        timeoutMs: 2000
      }).catch(() => console.log('   Server start command sent'));

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check again
      const psResult2 = await sandbox.sandbox.commands.run('ps aux | grep -E "python3.*http.server" | grep -v grep');
      if (psResult2.stdout.trim()) {
        console.log('   ✅ Server now running!');
        console.log('   ' + psResult2.stdout.trim());
      } else {
        console.log('   ❌ Server still not running. Checking logs...');
        const logs = await sandbox.sandbox.commands.run('cat /tmp/server.log 2>&1 || echo "No logs"');
        console.log('   Logs:', logs.stdout);
      }
    }

    // 4. Test local connection
    console.log('\n🌐 Testing localhost connection:');
    const curlResult = await sandbox.sandbox.commands.run('curl -s http://localhost:8000 | head -10');
    if (curlResult.stdout.trim()) {
      console.log('   ✅ Server responding locally:');
      console.log('   ' + curlResult.stdout.substring(0, 200));
    } else {
      console.log('   ❌ Server not responding on localhost:8000');
      if (curlResult.stderr) {
        console.log('   Error:', curlResult.stderr);
      }
    }

    console.log(`\n🔗 External URL: https://${sandboxId}.e2b.dev:8000`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugSandbox();
