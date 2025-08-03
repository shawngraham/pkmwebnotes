# pkmwebnotes
standalone repo for the homecooked app so I can push it to netlify

# PKM WebNotes

A personal knowledge management web application for creating, organizing, and linking notes in your browser. All data is stored locally using browser storage - no server required.

Try the version at [https://pkm-webnotes.netlify.app/](https://pkm-webnotes.netlify.app/) for a memorable url.

This is a **toy** that I intend to use with students to introduce ideas of personal knowledge management before introducing them to something more substantial.

## Features

### Note Management
- Create and edit notes with markdown support
- Notes automatically save as you type
- Real-time preview with syntax highlighting
- Search through all notes by title or content
- Notes are sorted by most recently modified

### Linking System
- Create wiki-style links between notes using `[[Note Title]]` syntax
- Autocomplete suggestions when typing links
- Backlinks panel shows which notes link to the current note
- Broken links are highlighted differently from valid links
- Create new notes directly from broken links

### Multi-Pane Interface
- Open multiple notes simultaneously in separate panes
- Split view modes: Edit only, Preview only, or Split (edit and preview side-by-side)
- Click any pane to focus it
- Close individual panes with the X button
- Right sidebar shows information for the currently focused note

### Import and Export
- Import markdown (.md) and text (.txt) files
- Export options:
  - JSON format (complete backup with metadata)
  - Individual markdown files
  - Single combined markdown file
- Preserve frontmatter and metadata during import/export

### Wikilink Connection Graph Export
- Export as nodes and edges csv describing the interconnections in your notes
- Network statistics calculated include **Betweeness Centrality** and **Community Detection**.
  - What This Reveals About Your Notes
    - High betweenness centrality notes = Your most important conceptual bridges
    - Communities = Natural topic clusters in your knowledge
    - Modularity score = How well-separated your topics are

### Themes
- Light and dark theme support
- Theme preference is saved automatically

## Getting Started

1. Open the `index.html` file in a web browser
2. Click "New Note" to create your first note
3. Start writing in markdown format
4. Use `[[Note Title]]` to link to other notes
5. Right-click on notes in the sidebar for additional options
6. You can create new notes by writing a wikilink to a non-existing note; before you get to the final ]], autocomplete will ask if you wish to create that note. Click on that modal to create!

### Block Embeds

If you want to embed blocks from one note in another, you have to give the block an id. To test this, create a note:

```
# Source Note

This is a paragraph with a block reference. ^my-block

Another paragraph here. ^another-block
```
then reference those blocks in another note:

```
# Target Note

Here's an embedded block:
![[Source Note#^my-block]]

And another:
![[Source Note#^another-block]]
```

When you preview the target note, the other blocks will embed. **Careful** this is fragile:
+ Case sensitivity: ```![[source note#^my-block]]``` won't match ```Source Note```
+ Exact title matching: Note titles must match exactly
+ Only works in preview: Embeds don't show in edit mode

## File Structure

```
pkm-webnotes/
├── index.html          # Main HTML file
├── styles.css          # All styling and themes
├── app.js             # Main application logic and state management
├── note.js            # Note class and methods
├── autocomplete.js    # Autocomplete functionality for wiki links
├── backlinks.js       # Backlink detection and management
└── utils.js           # Utility functions and local storage helpers
```

## Note Format

Notes use markdown with YAML frontmatter:

```markdown
---
title: My Note Title
created: 2025-01-01T12:00:00.000Z
tags: []
---

# My Note Title

This is the content of my note.

I can link to [[Another Note]] like this.

Code blocks are supported (with three backticks):
`javascript
console.log("Hello world");
`

```

## Keyboard Shortcuts

- **Arrow Up/Down**: Navigate autocomplete suggestions
- **Enter/Tab**: Select autocomplete suggestion
- **Escape**: Close autocomplete
- **Ctrl+Click** (or **Cmd+Click**): Open link in new pane

## Browser Compatibility

Works in modern browsers that support:
- Local Storage API
- ES6 Classes
- CSS Grid
- Flexbox

Tested in Chrome, Firefox, Safari, and Edge.

## Data Storage

All data is stored locally in your browser using localStorage. This means:
- No internet connection required after initial load
- Data persists between browser sessions
- Data is specific to the browser and domain
- Use export functionality to backup your notes

## Limitations

- No real-time collaboration
- No cloud synchronization
- Limited to browser storage capacity
- No mobile-optimized interface

## NB Note Names
Change the name by changing the `title:` yaml field. Refresh the display to update the sidebar (ctrl+r). This is still a bit glitchy.

## Development

The application is built with vanilla JavaScript, HTML, and CSS. No build process or dependencies required.

To modify:
1. Edit the relevant JavaScript files
2. Refresh the browser to see changes
3. Use browser developer tools for debugging

## License

This project is open source. Feel free to modify and distribute as needed.

## Credits

Created by S.M. Graham as a simple, self-contained personal knowledge management tool. Developed by carefully spec'ing out each element and then writing/transforming my natural language into code with Claude.

Aug 3 2025
