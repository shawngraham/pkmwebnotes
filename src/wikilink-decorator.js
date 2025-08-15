// src/wikilink-decorator.js
import { ViewPlugin, Decoration, MatchDecorator } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

class WikilinkWidget extends WidgetType {
    constructor(displayText, noteTitle, noteId, openNoteCallback, createNoteCallback, isAlias = false) {
        super();
        this.displayText = displayText;
        this.noteTitle = noteTitle;
        this.noteId = noteId;
        this.openNoteCallback = openNoteCallback;
        this.createNoteCallback = createNoteCallback;
        this.isAlias = isAlias;
    }

    toDOM() {
        const span = document.createElement("span");
        // Display the alias if it exists, otherwise the note title
        span.textContent = `[[${this.displayText}]]`; 
        span.style.cursor = "pointer";

        if (this.noteId) {
            // This is a valid, existing link
            span.className = "cm-wikilink";
            if (this.isAlias) {
                span.classList.add("cm-wikilink-alias");
                span.title = `"${this.displayText}" → ${this.noteTitle}`;
            } else {
                span.title = `Link to: ${this.noteTitle}`;
            }
            span.addEventListener("click", (e) => {
                e.preventDefault();
                this.openNoteCallback(this.noteId);
            });
        } else {
            // This is a broken link
            span.className = "cm-wikilink cm-wikilink-broken";
            if (this.isAlias) {
                span.title = `Create note: "${this.noteTitle}" (alias: "${this.displayText}")`;
            } else {
                span.title = `Create note: "${this.noteTitle}"`;
            }
            span.addEventListener("click", (e) => {
                e.preventDefault();
                this.createNoteCallback(this.noteTitle);
            });
        }
        return span;
    }

    ignoreEvent() {
        return false;
    }
}

export function wikilinkPlugin(notes, openNoteCallback, createNoteCallback) {
    const titleToIdMap = Object.values(notes).reduce((acc, note) => {
        acc[note.title.toLowerCase()] = note.id;
        return acc;
    }, {});

    const decorator = new MatchDecorator({
        // Enhanced regex to support multiple wikilink formats:
        // 1. [[note.id|title]] - internal format (existing)
        // 2. [[title]] - simple format (existing) 
        // 3. [[target note/alias]] - new alias format
        regexp: /\[\[([^|\]\/]+)(?:\|([^\]]+)|\/([^\]]+))?\]\]/g,
        decoration: (match, view, pos) => {
    // Don't decorate if cursor is within the wikilink being edited
    const cursor = view.state.selection.main.head;
    if (cursor >= pos && cursor <= pos + match[0].length) {
        return null; // Don't decorate if cursor is inside
    }
    
    // Rest of your existing decoration logic...
    const firstPart = match[1].trim();
    const pipePart = match[2] ? match[2].trim() : null;
    const slashPart = match[3] ? match[3].trim() : null;
    
            
            let noteTitle, displayText, noteId, isAlias = false;
            
            if (pipePart) {
                // Format: [[note.id|title]] - internal format
                noteId = firstPart;
                noteTitle = pipePart;
                displayText = pipePart;
                // Verify the note actually exists
                if (!notes[noteId]) {
                    noteId = null;
                }
            } else if (slashPart) {
                // Format: [[target note/alias]] - new alias format
                noteTitle = firstPart;
                displayText = slashPart;
                noteId = titleToIdMap[noteTitle.toLowerCase()];
                isAlias = true;
            } else {
                // Format: [[title]] - simple format
                noteTitle = firstPart;
                displayText = firstPart;
                noteId = titleToIdMap[noteTitle.toLowerCase()];
            }

            return Decoration.replace({
                widget: new WikilinkWidget(
                    displayText, 
                    noteTitle, 
                    noteId, 
                    openNoteCallback, 
                    createNoteCallback,
                    isAlias
                ),
            });
        },
    });

    return ViewPlugin.define(
        (view) => ({
            decorations: decorator.createDeco(view),
            update(update) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = decorator.updateDeco(update, this.decorations);
                }
            },
        }),
        {
            decorations: (v) => v.decorations,
        }
    );
}