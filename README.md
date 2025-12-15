# HTML Project Generator

Generate complete HTML projects using the Claude Agent SDK.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your API key:**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxx
   ```

   Get your API key from: https://console.anthropic.com/settings/keys

## Usage

Generate an HTML project by describing what you want:

```bash
npm run generate "Create a simple portfolio website"
```

### More Examples

```bash
# Landing page
npm run generate "Build a landing page for a coffee shop with hero section and menu"

# Interactive app
npm run generate "Make a todo list app with HTML, CSS, and JavaScript"

# Business website
npm run generate "Create a professional consulting company homepage"

# Creative project
npm run generate "Build an animated solar system with CSS animations"
```

## Output

All generated files will be saved in the `output/` directory.

## Project UI (Web)

- Open `public/projects.html` to pick a project, then `public/project.html?id=...` to view it.
- The project view now includes a fixed bottom navigation with:
  - Notes: Notion-like pages (Documents) tab
  - Preview: Opens/creates the live sandbox preview for the project
  - Board: Trello-like Kanban board

This bottom bar is available inside the project chat experience so you can jump between areas quickly.

## How It Works

This tool uses the Claude Agent SDK to:
1. Accept your project description
2. Send it to Claude with instructions to create HTML/CSS/JS files
3. Automatically save the generated files to disk
4. Stream the progress in real-time

The SDK handles all the complexity of:
- API communication
- File operations
- Context management
- Error handling

## Requirements

- Node.js 18 or higher
- Anthropic API key
- npm or yarn

## License

MIT
