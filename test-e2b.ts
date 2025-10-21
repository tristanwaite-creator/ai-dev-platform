#!/usr/bin/env node

import { Sandbox } from '@e2b/code-interpreter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testE2BConnection() {
  console.log('🧪 Testing E2B API Connection...\n');

  // Check if API key is set
  if (!process.env.E2B_API_KEY) {
    console.error('❌ Error: E2B_API_KEY not found in environment variables');
    console.error('Please add your E2B API key to the .env file\n');
    console.error('Steps:');
    console.error('1. Sign up at https://e2b.dev/');
    console.error('2. Get your API key from https://e2b.dev/dashboard');
    console.error('3. Add E2B_API_KEY=your_key_here to your .env file');
    process.exit(1);
  }

  console.log('✓ E2B_API_KEY found in environment');
  console.log(`   Key preview: ${process.env.E2B_API_KEY.substring(0, 10)}...\n`);

  try {
    console.log('📦 Creating sandbox...');
    const sandbox = await Sandbox.create();

    console.log('✓ Sandbox created successfully!');
    console.log(`   Sandbox ID: ${sandbox.sandboxId}\n`);

    // Test file operations
    console.log('📝 Testing file operations...');
    await sandbox.files.write('test.txt', 'Hello from E2B!');
    const content = await sandbox.files.read('test.txt');
    console.log('✓ File write/read works!');
    console.log(`   Content: "${content}"\n`);

    // Test code execution
    console.log('🚀 Testing code execution...');
    const result = await sandbox.runCode('print("Hello from Python in E2B!")');
    console.log('✓ Code execution works!');
    console.log(`   Output: ${result.text}\n`);

    // Test command execution
    console.log('💻 Testing command execution...');
    const cmdResult = await sandbox.runCommand('echo "Hello from shell!"');
    console.log('✓ Command execution works!');
    console.log(`   Output: ${cmdResult.stdout}\n`);

    // Cleanup
    console.log('🧹 Cleaning up...');
    await sandbox.close();
    console.log('✓ Sandbox closed\n');

    console.log('🎉 Success! E2B is fully configured and working!');
    console.log('\nYou can now:');
    console.log('- Create sandboxes for isolated code execution');
    console.log('- Write and read files in the sandbox');
    console.log('- Execute Python code and shell commands');
    console.log('- Start building your AI-powered platform!\n');

  } catch (error) {
    console.error('\n❌ Error testing E2B connection:');

    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);

      if (error.message.includes('API key')) {
        console.error('💡 This looks like an API key issue. Please check:');
        console.error('1. Your API key is correct (get it from https://e2b.dev/dashboard)');
        console.error('2. The key is properly added to your .env file');
        console.error('3. The .env file is in the project root directory');
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

// Run the test
testE2BConnection();
