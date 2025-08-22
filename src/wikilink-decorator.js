// src/wikilink-decorator.js

// CORRECTED: All required classes are now imported from the CDN
import { ViewPlugin, Decoration, MatchDecorator, WidgetType } from "https://esm.sh/@codemirror/view";
import { syntaxTree } from "https://esm.sh/@codemirror/language";

// This class creates the custom HTML element that replaces the wikilink text
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
        // Display the alias text if it exists, otherwise the note title
        span.textContent = this.displayText; 
        span.style.cursor = "pointer";

        if (this.noteId) {
            // This is a valid, existing link
            span.className = "cm-wikilink";
            if (this.isAlias) {
                span.classList.add("cm-wikilink-alias");
                span.title = `Alias: "${this.displayText}" → Links to: ${this.noteTitle}`;
            } else {
                span.title = `Link to: ${this.noteTitle}`;
            }
            span.addEventListener("mousedown", (e) => { // Use mousedown to feel more responsive
                e.preventDefault();
                this.openNoteCallback(this.noteId);
            });
        } else {
            // This is a broken link (the note doesn't exist)
            span.className = "cm-wikilink cm-wikilink-broken";
            if (this.isAlias) {
                span.title = `Create note: "${this.noteTitle}" (from alias: "${this.displayText}")`;
            } else {
                span.title = `Create note: "${this.noteTitle}"`;
            }
            span.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.createNoteCallback(this.noteTitle);
            });
        }
        return span;
    }

    // This ensures that clicking the widget doesn't interfere with editor selection
    ignoreEvent() {
        return true;
    }
}

export function wikilinkPlugin(notes, openNoteCallback, createNoteCallback) {
    const decorator = new MatchDecorator({
        // Regex to support: [[Title]], [[ID|Title]], [[Title/Alias]]
        regexp: /\[\[([^|\]/]+)(?:\|([^\]]+)|\/([^\]]+))?\]\]/g,
        decoration: (match, view, pos) => {
            // --- Safety Check: Do not decorate inside code blocks or comments ---
            const tree = syntaxTree(view.state);
            const node = tree.resolve(pos + 1, -1); // Check node at the start of the link content
            if (node.type.name.includes("Code") || node.type.name.includes("Comment")) {
                return null;
            }

            // --- Safety Check: Do not decorate if the cursor is inside the link ---
            const cursor = view.state.selection.main.head;
            if (cursor >= pos && cursor <= pos + match[0].length) {
                return null;
            }
            
            const titleToIdMap = Object.values(notes).reduce((acc, note) => {
                acc[note.title.toLowerCase()] = note.id;
                return acc;
            }, {});

            const firstPart = match[1].trim();
            const pipePart = match[2] ? match[2].trim() : null;
            const slashPart = match[3] ? match[3].trim() : null;
            
            let noteTitle, displayText, noteId, isAlias = false;
            
            if (pipePart) { // Format: [[note.id|title]]
                noteId = firstPart;
                noteTitle = displayText = pipePart;
                if (!notes[noteId]) noteId = null; // Mark as broken if ID is invalid
            } else if (slashPart) { // Format: [[target note/alias]]
                noteTitle = firstPart;
                displayText = slashPart;
                noteId = titleToIdMap[noteTitle.toLowerCase()];
                isAlias = true;
            } else { // Format: [[title]]
                noteTitle = displayText = firstPart;
                noteId = titleToIdMap[noteTitle.toLowerCase()];
            }

            return Decoration.replace({
                widget: new WikilinkWidget(displayText, noteTitle, noteId, openNoteCallback, createNoteCallback, isAlias),
            });
        },
    });

    return ViewPlugin.define(
        (view) => ({
            decorations: decorator.createDeco(view),
            update(update) {
                // This efficiently updates decorations when the document changes
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = decorator.updateDeco(update, this.decorations);
                }
            },
        }),
        {
            decorations: (v) => v.decorations,
        }
    );
}