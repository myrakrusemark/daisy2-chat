# Frontend Architecture Documentation

## Overview

This is a clean, maintainable Tailwind CSS + Eleventy setup with a comprehensive design system. The architecture emphasizes:

- **Design tokens** for consistent styling
- **Reusable utility classes** via custom Tailwind plugin
- **No inline styles** in HTML
- **Template partials** for component reusability
- **CSS variables** for easy theming

## Tech Stack

- **Eleventy 2.0** - Static site generator
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **DaisyUI 4.12** - Component library
- **Nunjucks** - Templating engine
- **ES6 Modules** - JavaScript architecture

---

## Design Token System

### Location
`src/css/input.css` - All design tokens are defined as CSS custom properties in `:root`

### Token Categories

#### Glass/Translucency Tokens
```css
--glass-opacity-light: 0.15      /* Secondary elements */
--glass-opacity-medium: 0.2      /* Primary elements */
--glass-opacity-strong: 0.3      /* Hover states */
--glass-opacity-stronger: 0.4    /* Active states */
--glass-opacity-dark: 0.85       /* Overlays/sidebars */
```

#### Blur Tokens
```css
--blur-glass: 8px                /* Consistent backdrop blur */
```

#### Border Tokens
```css
--border-glass-light: 1px        /* Subtle borders */
--border-glass-medium: 2px       /* Standard borders */
--border-glass-strong: 3px       /* Prominent borders */
```

#### Border Opacity Tokens
```css
--border-opacity-light: 0.2
--border-opacity-medium: 0.3
--border-opacity-strong: 0.5
--border-opacity-stronger: 0.6
--border-opacity-strongest: 0.9
```

#### State Color Tokens
```css
--state-idle: #1e293b           /* slate-800 */
--state-listening: #059669       /* emerald-600 */
--state-processing: #7c3aed      /* violet-600 */
--state-speaking: #2563eb        /* blue-600 */
--state-connecting: #d97706      /* amber-600 */
--state-error: #dc2626           /* red-600 */
```

#### Timing Tokens
```css
--transition-state: 0.5s ease          /* Body state transitions */
--transition-interaction: 0.2s ease    /* Button/UI interactions */
```

---

## Glassmorphism Utility Plugin

### Location
`tailwind.config.js` - Custom Tailwind plugin

### Available Utilities

#### Base Glass Effects
```html
<div class="glass-blur">          <!-- Just backdrop blur -->
<div class="glass-light">         <!-- Light translucent -->
<div class="glass-medium">        <!-- Medium translucent -->
<div class="glass-strong">        <!-- Strong translucent (hover) -->
<div class="glass-stronger">      <!-- Stronger (active) -->
<div class="glass-dark">          <!-- Dark overlay -->
```

#### Component Utilities
```html
<div class="glass-card">          <!-- Pre-styled card with glass effect -->
<button class="glass-button">     <!-- Button with hover/active states -->
<div class="glass-tool-display">  <!-- Tool use display styling -->
```

### Usage Example
**Before (inline styles):**
```html
<button style="background: rgba(255, 255, 255, 0.2);
               backdrop-filter: blur(8px);
               border: 2px solid rgba(255, 255, 255, 0.3);">
```

**After (utility class):**
```html
<button class="glass-button">
```

---

## Eleventy Template Structure

### Directory Layout
```
src/
├── _includes/
│   ├── layout.njk                    # Base HTML layout
│   └── components/
│       ├── chat-message.njk          # User/assistant messages
│       ├── tool-display.njk          # Tool use display
│       ├── control-button.njk        # Control buttons
│       └── settings-field.njk        # Form field components
├── index.html                        # Main page (uses layout)
├── css/
│   └── input.css                     # Tailwind + custom CSS
└── js/
    ├── demo.js                       # UI interactions
    └── state-themes.js               # State management
```

### Base Layout

**File:** `src/_includes/layout.njk`

Wraps all pages with common HTML structure:
- `<head>` with meta tags and CSS
- Body wrapper
- JavaScript includes
- Drawer state management script

**Usage in pages:**
```html
---
layout: layout.njk
title: Claude Assistant
---
<div>Your page content</div>
```

### Component Partials

#### Chat Message Component
**File:** `src/_includes/components/chat-message.njk`

**Macros available:**
- `user(text, time)` - User message bubble
- `assistant(text, time, toolUses)` - Assistant message with optional tools
- `liveTranscription(text, time)` - Live transcription bubble

**Example usage (in Nunjucks templates):**
```njk
{% from "components/chat-message.njk" import user, assistant %}
{{ user("Hello!", "12:34 PM") }}
{{ assistant("Hi there!", "12:35 PM") }}
```

#### Tool Display Component
**File:** `src/_includes/components/tool-display.njk`

Displays tool usage (Bash, Read, Download, etc.)

**Expected variables:**
- `tool.name` - Tool name
- `tool.description` - Description or file path
- `tool.downloadUrl` - (optional) Download link

#### Settings Field Component
**File:** `src/_includes/components/settings-field.njk`

**Macros available:**
- `textInput(id, label, placeholder, value, helpText)`
- `checkbox(id, label, checked)`
- `toggle(id, label, checked, size)`

---

## Eleventy Shortcodes

### Location
`.eleventy.js` - Configuration file

### Available Shortcodes

#### User Message
```njk
{% userMessage "Hello!", "12:34 PM" %}
```

#### Assistant Message
```njk
{% assistantMessage "Response text", "12:35 PM" %}
```

#### Tool Use
```njk
{% toolUse "Bash", "ls -la /workspace" %}
{% toolUse "Download", "file.txt", "/path/to/file.txt" %}
```

---

## JavaScript Architecture

### State Management
**File:** `src/js/state-themes.js`

#### STATE_THEMES Object
Defines all application states with:
- `name` - Display name
- `emoji` - Visual indicator
- `status` - Status text
- `cssVariable` - CSS variable reference (e.g., `--state-idle`)
- `animation` - Animation name (or null)

**Single source of truth:** State colors are defined in CSS variables, referenced by JavaScript

#### Adding New States
1. Add CSS variable in `src/css/input.css`:
   ```css
   --state-thinking: #475569;  /* slate-600 */
   ```

2. Add body state class in `src/css/input.css`:
   ```css
   body.state-thinking {
     background-color: var(--state-thinking);
   }
   ```

3. Add state to `STATE_THEMES` in `state-themes.js`:
   ```js
   thinking: {
       name: 'Thinking',
       emoji: '💭',
       status: '💭 Thinking...',
       cssVariable: '--state-thinking',
       animation: null
   }
   ```

---

## DaisyUI Integration

### Theme Configuration
**File:** `tailwind.config.js`

Custom dark theme with blue color palette:
```js
dark: {
  "primary": "#3b82f6",        // Bright blue
  "secondary": "#1e40af",      // Deep blue
  "accent": "#60a5fa",         // Light blue
  "base-100": "#0f172a",       // Very dark blue-gray
  "base-200": "#1e293b",       // Dark blue-gray
  "base-300": "#334155",       // Medium blue-gray
  "base-content": "#e2e8f0",   // Light text
}
```

### Component Overrides
**File:** `src/css/input.css` - DaisyUI Component Overrides section

Uses design tokens for consistency:
- `.navbar` - Transparent background
- `.drawer-side .menu` - Dark glass effect
- `.chat-bubble-primary` - Glass effect with tokens
- `.chat-bubble-secondary` - Lighter glass effect
- `#btn-push-to-talk` - Prominent glass button
- `.toggle` - Translucent toggle switches

**Why override?** To integrate glassmorphism design with DaisyUI components

---

## Build Process

### Commands

```bash
npm run build        # Production build
npm run start        # Development server with watch
npm run build:css    # Build Tailwind CSS only
npm run build:eleventy  # Build Eleventy only
```

### Build Pipeline

1. **Tailwind CSS** compiles `src/css/input.css` → `_site/css/output.css`
   - Processes `@tailwind` directives
   - Generates utility classes
   - Runs custom plugin (glassmorphism utilities)
   - Processes PostCSS (autoprefixer)

2. **Eleventy** processes templates:
   - Reads `src/index.html` (Nunjucks)
   - Applies layout (`layout.njk`)
   - Processes shortcodes
   - Outputs to `_site/index.html`

3. **Static assets** copied:
   - `src/js/*` → `_site/js/*`
   - `_site/css/output.css` (already there)

4. **Dev server** runs on `http://localhost:8001`
   - Live reload on file changes
   - Watches CSS output for changes

---

## File Organization

### Source Files (`src/`)
```
src/
├── index.html              # Main page
├── _includes/              # Template partials
│   ├── layout.njk         # Base layout
│   └── components/        # Reusable components
├── css/
│   └── input.css          # Design tokens + Tailwind + custom CSS
└── js/
    ├── demo.js            # UI interactions
    └── state-themes.js    # State management
```

### Build Output (`_site/`)
```
_site/
├── index.html             # Compiled HTML
├── css/
│   └── output.css        # Compiled Tailwind CSS
└── js/
    ├── demo.js           # Copied as-is
    └── state-themes.js   # Copied as-is
```

### Configuration Files
```
.eleventy.js              # Eleventy configuration + shortcodes
tailwind.config.js        # Tailwind + glassmorphism plugin
postcss.config.js         # PostCSS configuration
package.json              # Dependencies + scripts
```

---

## Best Practices

### CSS
1. **Use design tokens** - Always prefer CSS variables over hardcoded values
2. **Use utility classes** - Prefer `.glass-button` over inline styles
3. **Extend, don't override** - Add new utilities instead of overriding existing ones
4. **Keep DaisyUI overrides minimal** - Only override when necessary for glass effect

### HTML
1. **No inline styles** - Use utility classes or create new ones
2. **Use semantic classes** - `.glass-card` is clearer than `.glass-medium rounded-2xl`
3. **Use Tailwind utilities for layout** - `flex`, `grid`, spacing, etc.
4. **Use partials for repeated markup** - Especially chat messages

### JavaScript
1. **State colors in CSS** - JavaScript only references CSS variables
2. **Single source of truth** - Define values once, reference everywhere
3. **Use CSS classes for state** - Add/remove body classes like `state-listening`

### Eleventy
1. **Use layouts** - All pages should use `layout.njk`
2. **Use shortcodes for simple components** - When you don't need Nunjucks logic
3. **Use partials for complex components** - When you need macros or conditions
4. **Keep templates clean** - Move logic to shortcodes/macros

---

## Maintenance

### Adding New Glass Utilities

1. Edit `tailwind.config.js`:
   ```js
   ".glass-my-component": {
     background: "rgba(255, 255, 255, var(--glass-opacity-medium))",
     backdropFilter: "blur(var(--blur-glass))",
     // ... more properties
   }
   ```

2. Use in HTML:
   ```html
   <div class="glass-my-component">
   ```

### Modifying Design Tokens

1. Edit `src/css/input.css`:
   ```css
   :root {
     --my-new-token: value;
   }
   ```

2. Reference in plugin or CSS:
   ```css
   .my-class {
     property: var(--my-new-token);
   }
   ```

### Creating New Components

1. Create partial: `src/_includes/components/my-component.njk`
2. Add macro or include content
3. Use in templates with `{% include %}` or import macros

### Modifying State Colors

1. Edit `src/css/input.css`:
   ```css
   --state-mystate: #hexcolor;

   body.state-mystate {
     background-color: var(--state-mystate);
   }
   ```

2. Edit `src/js/state-themes.js`:
   ```js
   mystate: {
     name: 'My State',
     emoji: '🎯',
     status: 'Status text',
     cssVariable: '--state-mystate',
     animation: null
   }
   ```

---

## Benefits of This Architecture

1. **Maintainability** - Design tokens make global changes easy
2. **Consistency** - Single source of truth for colors, spacing, etc.
3. **Scalability** - Easy to add new states, components, utilities
4. **Performance** - Tailwind purges unused CSS, small bundle size
5. **Developer Experience** - Clear structure, no inline styles, reusable components
6. **Theming** - CSS variables enable easy theme switching
7. **Type Safety** - Could add TypeScript for component props in future

---

## Migration Summary

### What Changed

**Before:**
- Inline styles scattered throughout HTML
- Repeated `rgba()` and `backdrop-filter` values
- Magic numbers everywhere
- Duplicate state color definitions (CSS + JS)
- No component abstraction
- Heavy use of `!important` to override DaisyUI

**After:**
- CSS design tokens for all values
- Custom Tailwind utilities for glass effects
- Utility classes instead of inline styles
- Single source of truth for state colors (CSS variables)
- Template partials and shortcodes for components
- Minimal, token-based DaisyUI overrides

### Files Modified
- `src/css/input.css` - Added design tokens, using CSS variables
- `tailwind.config.js` - Added glassmorphism plugin
- `src/index.html` - Removed inline styles, using utilities
- `.eleventy.js` - Added shortcodes, configured Nunjucks
- `src/js/state-themes.js` - Using CSS variables for state colors

### Files Created
- `src/_includes/layout.njk` - Base layout
- `src/_includes/components/chat-message.njk` - Chat component
- `src/_includes/components/tool-display.njk` - Tool display
- `src/_includes/components/control-button.njk` - Button component
- `src/_includes/components/settings-field.njk` - Form fields
- `ARCHITECTURE.md` - This documentation

---

## Quick Reference

### Common Utility Classes
```html
<!-- Glass effects -->
<div class="glass-light">        <!-- Light glass -->
<div class="glass-medium">       <!-- Medium glass -->
<div class="glass-card">         <!-- Pre-styled card -->
<button class="glass-button">    <!-- Interactive button -->

<!-- Tailwind utilities -->
<div class="max-w-3xl">          <!-- Max width 800px -->
<div class="rounded-2xl">        <!-- Large border radius -->
<div class="backdrop-blur-glass"> <!-- Custom blur -->
```

### State Management
```js
import { applyState } from './state-themes.js';
applyState('listening');  // Changes body background, status text
```

### Building
```bash
npm run build    # Production build
npm start        # Dev server (port 8001)
```

---

**Last Updated:** 2025-10-28
**Architecture Version:** 2.0
