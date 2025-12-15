#!/usr/bin/env node

import { e2bService } from './src/lib/e2b.js';

async function verifyFiles() {
  const sandboxId = 'ip6ac0w7aph3g0wst1tyt';

  console.log(`🔍 Checking sandbox: ${sandboxId}\n`);

  try {
    const files = await e2bService.listFiles(sandboxId, '/home/user');
    console.log('📁 Files in /home/user:');
    files.forEach((file: string) => {
      console.log(`   - ${file}`);
    });

    // Try to read one of the files
    if (files.includes('index.html') || files.some((f: any) => f.name === 'index.html')) {
      console.log('\n📄 Reading index.html:');
      const content = await e2bService.readFile(sandboxId, '/home/user/index.html');
      console.log(content.substring(0, 200) + '...');
    }

    console.log('\n✅ SUCCESS! Files are in E2B sandbox!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyFiles();
