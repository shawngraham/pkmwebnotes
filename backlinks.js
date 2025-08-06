// Backlinks manager
export class BacklinksManager {
    constructor(notes) {
        this.notes = notes;
    }

    // Add the missing updateNotes method
    updateNotes(notes) {
        this.notes = notes;
    }

    getBacklinks(noteTitle) {
    const backlinks = [];
    const lowerNoteTitle = noteTitle.toLowerCase();
    
    // This regex finds all wikilinks and captures their target (before the '|')
    const linkFindingRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

    Object.values(this.notes).forEach(note => {
        // A note should not be its own backlink
        if (note.title.toLowerCase() === lowerNoteTitle) {
            return;
        }

        // Find all wikilinks within the note's content
        const matches = [...note.content.matchAll(linkFindingRegex)];

        matches.forEach(match => {
            const linkTarget = match[1].trim(); // This is the part before '|' or ']]'
            
            // Check if the link target matches the note we're looking for
            if (linkTarget.toLowerCase() === lowerNoteTitle) {
                const fullMatchText = match[0];
                const matchIndex = match.index;

                // Extract the context around the found link
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(note.content.length, matchIndex + fullMatchText.length + 50);
                const context = note.content.substring(start, end).trim();
                
                backlinks.push({
                    noteId: note.id,
                    noteTitle: note.title,
                    context: context
                });
            }
        });
    });
    
    return backlinks;
}
}