// Autocomplete manager
export class AutocompleteManager {
    constructor(notes, container) {
        this.notes = notes;
        this.container = container;
        this.autocompleteEl = null;
        this.selectedIndex = -1;
        this.isVisible = false;
        this.currentQuery = '';
        this.onSelect = null;
    }

    show(textarea, query, onSelect) {
        console.log('AutocompleteManager.show called with query:', query);

        this.currentQuery = query;
        this.onSelect = onSelect;
        this.selectedIndex = -1;

        const matches = this.getMatches(query);
        console.log('Matches found:', matches);

        if (matches.length === 0 && query.trim() === '') {
            const allNotes = Object.values(this.notes).slice(0, 8).map(note => ({
                title: note.title,
                type: 'existing'
            }));
            matches.push(...allNotes);
        }

        if (matches.length === 0) {
            this.hide();
            return;
        }

        // Remove existing autocomplete element
        this.hide();

        // Create new autocomplete element
        this.autocompleteEl = document.createElement('div');
        this.autocompleteEl.className = 'autocomplete';
        
        // Make sure it's visible with explicit styles
        this.autocompleteEl.style.display = 'block';
        this.autocompleteEl.style.visibility = 'visible';
        this.autocompleteEl.style.position = 'fixed';
        this.autocompleteEl.style.zIndex = '9999';
        
        // Get cursor position within textarea for more precise positioning
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPos);
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines.length - 1;
        const currentColumn = lines[lines.length - 1].length;
        
        // Get textarea's position and styling
        const rect = textarea.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        
        // Estimate cursor position (this is approximate)
        const cursorX = rect.left + paddingLeft;
        const cursorY = rect.top + paddingTop + (currentLine * lineHeight) + lineHeight;
        
        // Position the autocomplete element
        this.autocompleteEl.style.left = `${cursorX}px`;
        this.autocompleteEl.style.top = `${cursorY}px`;
        this.autocompleteEl.style.minWidth = '200px';
        this.autocompleteEl.style.maxWidth = '400px';

        // Populate with matches
        this.autocompleteEl.innerHTML = matches.map((match, index) => {
            const isCreate = match.type === 'create';
            const displayText = isCreate ? `Create "${match.title}"` : match.title;
            return `<div class="autocomplete-item ${isCreate ? 'autocomplete-create' : ''}" data-index="${index}">${displayText}</div>`;
        }).join('');

        // Add click event listeners
        this.autocompleteEl.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent textarea from losing focus
                this.selectItem(index);
            });
        });

        // Append to body
        document.body.appendChild(this.autocompleteEl);
        
        // Ensure it's within viewport bounds
        this.adjustPosition();

        this.isVisible = true;
        console.log('Autocomplete element created and positioned:', {
            left: this.autocompleteEl.style.left,
            top: this.autocompleteEl.style.top,
            display: this.autocompleteEl.style.display,
            visibility: this.autocompleteEl.style.visibility,
            zIndex: this.autocompleteEl.style.zIndex
        });
    }

    adjustPosition() {
        if (!this.autocompleteEl) return;
        
        const rect = this.autocompleteEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Adjust horizontal position if it goes off-screen
        if (rect.right > viewportWidth) {
            const currentLeft = parseFloat(this.autocompleteEl.style.left);
            this.autocompleteEl.style.left = `${currentLeft - (rect.right - viewportWidth) - 10}px`;
        }
        
        // Adjust vertical position if it goes off-screen
        if (rect.bottom > viewportHeight) {
            const currentTop = parseFloat(this.autocompleteEl.style.top);
            this.autocompleteEl.style.top = `${currentTop - rect.height - 30}px`;
        }
    }

    hide() {
        if (this.autocompleteEl && this.autocompleteEl.parentNode) {
            this.autocompleteEl.parentNode.removeChild(this.autocompleteEl);
        }
        this.autocompleteEl = null;
        this.isVisible = false;
        this.selectedIndex = -1;
    }

        getMatches(query) {
        console.log('Getting matches for query:', query);
        
        if (query === '') return [];

        const lowerQuery = query.toLowerCase();
        const exactMatches = [];
        const partialMatches = [];

        Object.values(this.notes).forEach(note => {
            const lowerTitle = note.title.toLowerCase();
            // The match object includes the stable ID!
            const matchData = { title: note.title, id: note.id, type: 'existing' };
            
            if (lowerTitle === lowerQuery) {
                exactMatches.push(matchData);
            } else if (lowerTitle.includes(lowerQuery)) {
                partialMatches.push(matchData);
            }
        });

        const results = [...exactMatches, ...partialMatches].slice(0, 8);
        
        if (!exactMatches.length && query.trim()) {
            // "Create" option doesn't have an ID yet.
            results.unshift({ title: query, type: 'create' });
        }

        return results;
    }

    handleKeyDown(event) {
        if (!this.isVisible) return false;

        const items = this.autocompleteEl?.querySelectorAll('.autocomplete-item');
        if (!items) return false;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection();
                return true;
            
            case 'ArrowUp':
                event.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                return true;
            
            case 'Enter':
            case 'Tab':
                event.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectItem(this.selectedIndex);
                } else if (items.length > 0) {
                    this.selectItem(0); // Select first item if none selected
                }
                return true;
            
            case 'Escape':
                this.hide();
                return true;
        }

        return false;
    }

    updateSelection() {
        if (!this.autocompleteEl) return;

        this.autocompleteEl.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
    }

    selectItem(index) {
        const items = this.autocompleteEl?.querySelectorAll('.autocomplete-item');
        if (!items || !items[index]) return;

        const matches = this.getMatches(this.currentQuery);
        // Handle empty query case
        if (matches.length === 0 && this.currentQuery === '') {
            const allNotes = Object.values(this.notes).slice(0, 8).map(note => ({
                title: note.title,
                type: 'existing'
            }));
            matches.push(...allNotes);
        }

        const match = matches[index];
        
        if (this.onSelect) {
            this.onSelect(match);
        }
        
        this.hide();
    }
}