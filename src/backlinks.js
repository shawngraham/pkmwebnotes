// Fixed backlinks.js for ID-hidden wikilink system

export class BacklinksManager {
    constructor(notes) {
        this.updateNotes(notes);
    }

    /**
     * Re-builds the entire backlink index.
     * @param {Object} notes - The complete collection of note objects.
     */
    updateNotes(notes) {
        this.notes = notes;
        this.backlinks = {};

        // PROBLEM: We can't just use wikilinkRegex on stored content anymore
        // because users might have BOTH formats:
        // 1. Old stable links: [[id|displayText]] 
        // 2. New simple links that get converted: [[title]]
        
        // SOLUTION: Use the conversion function to get a consistent internal format
        const wikilinkRegex = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

        for (const sourceNote of Object.values(this.notes)) {
            let match;
            
            // Ensure we're working with consistent internal format
            // In case there are any [[title]] format links that haven't been converted yet
            const internalContent = this.ensureInternalFormat(sourceNote.content);

            while ((match = wikilinkRegex.exec(internalContent)) !== null) {
                const targetId = match[1];
                const targetNote = this.notes[targetId];

                if (targetNote) {
                    const targetTitle = targetNote.title;
                    
                    if (!this.backlinks[targetTitle]) {
                        this.backlinks[targetTitle] = [];
                    }

                    this.backlinks[targetTitle].push({
                        noteId: sourceNote.id,
                        noteTitle: sourceNote.title,
                        context: this._getContext(internalContent, match)
                    });
                }
            }
        }
    }

    /**
     * Convert any remaining [[title]] format links to [[id|title]] format
     * This handles edge cases where content might have mixed formats
     */
    ensureInternalFormat(content) {
        // Build title-to-id mapping
        const titleToIdMap = Object.values(this.notes).reduce((acc, note) => {
            acc[note.title.toLowerCase()] = note.id;
            return acc;
        }, {});

        // Convert any [[title]] format to [[id|title]]
        return content.replace(/\[\[([^\]|]+)\]\]/g, (match, title) => {
            const trimmedTitle = title.trim();
            const noteId = titleToIdMap[trimmedTitle.toLowerCase()];
            
            if (noteId) {
                return `[[${noteId}|${trimmedTitle}]]`;
            }
            // Leave broken links as-is
            return match;
        });
    }

    /**
     * Gets the pre-calculated backlinks for a given note title.
     * @param {string} noteTitle - The title of the note to get backlinks for.
     * @returns {Array} An array of backlink objects.
     */
    getBacklinks(noteTitle) {
        return this.backlinks[noteTitle] || [];
    }

    /**
     * A private helper to sanitize strings before inserting them as HTML.
     * @param {string} str - The string to sanitize.
     * @returns {string} A safe-for-HTML string.
     */
    _sanitize(str) {
        const textNode = document.createTextNode(str);
        return textNode.nodeValue;
    }

    /**
     * A private helper method to extract the context snippet around a link.
     * This version extracts 3 words before and after the link.
     * @param {string} content - The full content of the source note.
     * @param {RegExpExecArray} match - The regex match object from finding the link.
     * @returns {string} A formatted HTML string of the context.
     */
    _getContext(content, match) {
        const matchIndex = match.index;
        const linkText = match[0];      // The full "[[id|displayText]]"
        const displayText = match[2];   // The "displayText" part

        // Isolate the text before and after the link
        const textBeforeLink = content.substring(0, matchIndex);
        const textAfterLink = content.substring(matchIndex + linkText.length);

        // Process the text BEFORE the link
        const wordsBefore = textBeforeLink.trim().split(/\s+/);
        const contextBefore = wordsBefore.slice(-3).join(' '); // Get last 3 words
        const leadingEllipsis = wordsBefore.length > 3 ? '... ' : '';

        // Process the text AFTER the link
        const wordsAfter = textAfterLink.trim().split(/\s+/);
        const contextAfter = wordsAfter.slice(0, 3).join(' '); // Get first 3 words
        const trailingEllipsis = wordsAfter.length > 3 ? ' ...' : '';

        // Sanitize all parts before assembling the final HTML
        const safeContextBefore = this._sanitize(contextBefore);
        const safeDisplayText = `<strong>${this._sanitize(displayText)}</strong>`;
        const safeContextAfter = this._sanitize(contextAfter);
        
        // Assemble the final context string
        return `${leadingEllipsis}${safeContextBefore} ${safeDisplayText} ${safeContextAfter}${trailingEllipsis}`;
    }
}