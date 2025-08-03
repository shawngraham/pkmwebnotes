// Backlinks manager
class BacklinksManager {
    constructor(notes) {
        this.notes = notes;
    }

    // Add the missing updateNotes method
    updateNotes(notes) {
        this.notes = notes;
    }

    getBacklinks(noteTitle) {
        const backlinks = [];
        
        Object.values(this.notes).forEach(note => {
            const outgoingLinks = note.getOutgoingLinks();
            if (outgoingLinks.some(link => link.toLowerCase() === noteTitle.toLowerCase())) {
                // Find the context around the link
                const escapedTitle = noteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const linkRegex = new RegExp(`\\[\\[${escapedTitle}\\]\\]`, 'gi');
                const matches = [...note.content.matchAll(linkRegex)];
                
                matches.forEach(match => {
                    const start = Math.max(0, match.index - 50);
                    const end = Math.min(note.content.length, match.index + match[0].length + 50);
                    const context = note.content.substring(start, end).trim();
                    
                    backlinks.push({
                        noteId: note.id,
                        noteTitle: note.title,
                        context: context
                    });
                });
            }
        });
        
        return backlinks;
    }
}