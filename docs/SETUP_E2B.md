# E2B Setup Guide

## What is E2B?

E2B (Execute to Build) provides secure, isolated cloud sandboxes for running AI-generated code. Your AI agents will use E2B to create, test, and execute code in a safe environment without affecting your local machine.

## Setup Steps

### Step 1: Sign Up for E2B

1. Go to: **https://e2b.dev/**
2. Click **"Sign Up"** or **"Get Started"**
3. Sign up using:
   - GitHub OAuth (recommended - fastest)
   - Or email + password

### Step 2: Get Your API Key

1. After signing up, you'll be redirected to the dashboard
2. Your API key will be displayed on the dashboard at: **https://e2b.dev/dashboard**
3. Copy your API key (it starts with `e2b_`)

### Step 3: Add API Key to .env File

1. Open the `.env` file in your project root:
   ```bash
   open .env
   ```

   Or edit it manually with your favorite text editor.

2. Add this line to your `.env` file:
   ```
   E2B_API_KEY=e2b_your_actual_api_key_here
   ```

   Replace `e2b_your_actual_api_key_here` with the actual key you copied from the dashboard.

3. Save the file

### Step 4: Verify the Setup

Run the verification script:

```bash
npm run test:e2b
```

If everything is configured correctly, you should see:

```
✓ E2B_API_KEY found in environment
✓ Sandbox created successfully!
✓ File write/read works!
✓ Code execution works!
✓ Command execution works!
✓ Sandbox closed

🎉 Success! E2B is fully configured and working!
```

## Troubleshooting

### Error: "E2B_API_KEY not found"

**Solution**: Make sure you've added `E2B_API_KEY` to your `.env` file and saved it.

### Error: "Invalid API key" or "Authentication failed"

**Solutions**:
1. Double-check your API key is correct (copy it again from https://e2b.dev/dashboard)
2. Make sure there are no extra spaces or quotes around the key in `.env`
3. Restart your terminal/editor after adding the key

### Error: "Network error" or "Connection timeout"

**Solutions**:
1. Check your internet connection
2. Make sure you're not behind a firewall blocking E2B
3. Try again in a few minutes (might be temporary)

## E2B Pricing

- **Free Tier**: 100 hours/month of sandbox usage
- **Pro**: $20/month for 500 hours
- **Enterprise**: Custom pricing

For this project in development, the free tier is more than enough!

## What Can E2B Do?

Once configured, E2B sandboxes can:

✅ Execute code in multiple languages (Python, Node.js, etc.)
✅ Install packages and dependencies
✅ Create and modify files
✅ Run shell commands
✅ Host web servers and preview apps
✅ Keep state during a session
✅ Clean up automatically when done

## Next Steps

Once E2B is working, you're ready to start **Phase 1** of building your AI-powered development platform! 🚀

The system will use E2B to:
- Create isolated sandboxes for each project
- Let AI agents write code safely
- Preview generated websites/apps
- Test code before committing to git
