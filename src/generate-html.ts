#!/usr/bin/env node

import { query } from '@anthropic-ai/claude-agent-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

// Load environment variables
dotenv.config();

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateHTMLProject(projectDescription: string) {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not found in environment variables');
    console.error('Please create a .env file with your API key');
    process.exit(1);
  }

  // Create output directory
  const outputDir = join(process.cwd(), 'output');
  await mkdir(outputDir, { recursive: true });

  console.log('🚀 Starting HTML project generation...');
  console.log(`📝 Description: ${projectDescription}`);
  console.log(`📁 Output directory: ${outputDir}\n`);

  const prompt = `Create a complete HTML project based on this description: "${projectDescription}"

Please create the necessary files (HTML, CSS, and JavaScript if needed) for a fully functional project.
Save all files in the current working directory.

Requirements:
- Create clean, well-structured HTML
- Include inline or separate CSS for styling
- Add comments to explain the code
- Make it responsive and modern
- Ensure all files are properly linked

Start by creating the files now.`;

  try {
    // Query Claude with the SDK
    const result = query({
      prompt,
      options: {
        cwd: outputDir,
        permissionMode: 'acceptEdits', // Automatically accept file writes
        model: 'claude-sonnet-4-5-20250929'
      }
    });

    // Stream and display messages
    for await (const message of result) {
      // Handle assistant messages (text and tool_use)
      if (message.type === 'assistant' && message.message?.content) {
        for (const content of message.message.content) {
          const contentBlock = content as any;
          if (contentBlock.type === 'text') {
            process.stdout.write(contentBlock.text);
          } else if (contentBlock.type === 'tool_use') {
            console.log(`\n🔧 Using tool: ${contentBlock.name}`);
          }
        }
      } else if (message.type === 'user' && message.message?.content) {
        // Handle user messages (tool_result)
        for (const content of message.message.content) {
          const contentBlock = content as any;
          if (contentBlock.type === 'tool_result' && contentBlock.is_error) {
            console.error(`\n❌ Error: ${JSON.stringify(contentBlock.content)}`);
          }
        }
      }
    }

    console.log('\n\n✅ HTML project generation complete!');
    console.log(`📂 Check the output directory: ${outputDir}`);

  } catch (error) {
    console.error('\n❌ Error generating project:', error);
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('HTML Project Generator using Claude Agent SDK\n');
  console.log('Usage: npm run generate "description of your HTML project"\n');
  console.log('Examples:');
  console.log('  npm run generate "Create a simple portfolio website"');
  console.log('  npm run generate "Build a landing page for a coffee shop"');
  console.log('  npm run generate "Make a todo list app with HTML, CSS, and JavaScript"');
  process.exit(0);
}

const projectDescription = args.join(' ');
generateHTMLProject(projectDescription);
