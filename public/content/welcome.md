---
title: Welcome to PKM WebNotes
created: 2025-08-05T12:57:24.739Z
tags: [welcome, getting-started]
---

# 👋 Welcome to PKM WebNotes

This is your personal knowledge management system in the browser.

## Key Features

- **Markdown Editor**: Write notes using simple markdown syntax.
- **Wikilinks**: Connect your ideas by creating links between notes using square brackets and the note name
- **Backlinks**: See which notes link to your current note in the right sidebar.
- **Graph View**: Visualize the connections between your notes.
- **Python Execution**: Run Python code directly within your notes! See the [[Python in Notes]] note for details.

## Getting Started

1.  **Create a new note**: Click the "+ New Note" button.
2.  **Start writing**: Use the editor in the central pane.
3.  **Create a link**: Type ```[[``` and start typing a note title. An autocomplete will appear.


## A few more details

            
### Note Management
                
+ Create and edit notes with markdown support
+ Notes automatically save as you type
+ Real-time preview with syntax highlighting
+ Search through all notes by title or content
+ Notes are sorted by most recently modified
                
### Linking System


+ Autocomplete suggestions when typing links
+ Backlinks panel shows which notes link to the current note
+ Broken links are highlighted differently from valid links
+ If you rename a note, wikilinks will update (as well as note names in the note list, and in the backlinks panel. There might be a delay but you can always force a refresh with ctrl+r)
+ You can alias a wikilink with 
```
[[note title/display text]]
```

+ Links in the editor can be clicked on; red links mean the target note hasn't been created yet. Click on it and a new note with that name is created.

> If you're familiar with markdown in note making apps like this, you'll wonder why the forward-slash and not the pipe character. This is because of the way the app keeps track of note name changes; every note has a unique id under-the-hood using unique-id|note title. So the alias in the user interface uses the codemirror library's ability to apply 'decorators' to the link so that we can make our links as we want and display them as we not while not losing track!
                
### Multi-Pane Interface
               
+ Open multiple notes simultaneously in separate panes
+ Split view modes: Edit only, Preview only, or Split (edit and preview side-by-side)
+ Drag the handles between panes to resize them.
+ Double-click resize handles to auto-size panes equally.
+ <strong>NEW:</strong> Click the 🗖 button to maximize any pane to full width
+ <strong>NEW:</strong> Use Ctrl/Cmd + M to toggle maximize for the focused pane
            
### Python Code Execution
                
+ Write Python code in markdown blocks (<code>\`\`\`python</code>) and execute it directly in your notes.
+ Click the "▶ Run" button on a code block in the preview pane to run it.
+ Standard output (from <code>print()</code>) and the final result are displayed below the code.
  + Load external data (e.g., a CSV file) by adding a special directive to the top of a code block: <code>#data_url: *your_url_here*</code>. The raw text content from the URL will be automatically loaded into a variable named <code>fetched_data</code> for you to use in your script, eg <code>df = pd.read_csv(StringIO(fetched_data))</code>.
+ <b>NB:</b> The first time you run Python code, it may take a few seconds to initialize the environment, during which the app might seem frozen.

### Import and Export
                
+ Import markdown (.md) and text (.txt) files
+ Export options: JSON, individual markdown files, or a single combined file.
                            
### Wikilink Connection Graph Export
    
+ Export as nodes and edges CSV describing the interconnections in your notes
+ Reveals topic clusters and important conceptual bridges in your knowledge base (by calculating modularity and betweeness scores)
+ Identifies isolated notes without connections
                
