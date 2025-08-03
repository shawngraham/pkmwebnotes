// App state
class PKMApp {
    constructor() {
        this.notes = this.loadNotes();
        this.settings = storage.get('pkm_settings', { theme: 'light' });

        this.panes = storage.get('pkm_panes', []);
        this.focusedPaneId = storage.get('pkm_focused_pane', null);

        this.backlinksManager = new BacklinksManager(this.notes);
        this.graphManager = new GraphManager(this.notes);
        
        // Set up graph click handler
        this.graphManager.onNodeClick = (noteId) => {
            this.openNote(noteId);
        };

        this.init();
    }

    loadNotes() {
        const savedNotes = storage.get('pkm_notes', {});
        const notes = {};
        Object.entries(savedNotes).forEach(([id, noteData]) => {
            const note = new Note(noteData.title, noteData.content || '');
            Object.assign(note, noteData);
            if (!note.content.startsWith('---')) {
                note.content = note.generateDefaultContent(note.title) + note.content;
            }
            notes[id] = note;
        });
        return notes;
    }

    init() {
        this.setupTheme();
        this.bindGlobalEvents();
        this.renderNoteList();
        this.loadInitialPanes();
        this.updateRightSidebar();
        
        // Show welcome modal on first load
        this.showWelcomeModal();
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        // Add context menu to sidebar for creating new notes
        document.querySelector('.sidebar').addEventListener('contextmenu', e => {
            if (!e.target.closest('.note-item')) {
                e.preventDefault();
                this.showContextMenu(e, null); // Pass null for noteId
            }
        });
    }

    setupTheme() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
    }

    bindGlobalEvents() {
        document.getElementById('newNoteBtn').addEventListener('click', () => this.createNote());
        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('importBtn').addEventListener('click', () => this.importFiles());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('searchInput').addEventListener('input', debounce((e) => this.searchNotes(e.target.value), 300));
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));
    }

    loadInitialPanes() {
        if (this.panes.length > 0) {
            this.renderAllPanes();
        } else {
            const container = document.getElementById('editorPanesContainer');
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Welcome to PKM Notes</h3>
                    <p>Select a note from the sidebar or create a new one to get started.</p>
                </div>`;
        }
    }
    
    // --- Pane Management Logic ---

    createPane(noteId) {
        const newPane = {
            id: 'pane_' + Date.now(),
            noteId: noteId,
            mode: 'split',
        };
        this.panes.push(newPane);
        // Do not focus here, let the calling function decide
        this.savePanes();
        return newPane;
    }

    /**
     * [REVISED] Opens a note, deciding which pane to use.
     * This logic is now simpler and more predictable.
     */
    openNote(noteId) {
        // 1. Find a pane to open the note in.
        let targetPane = this.getPane(this.focusedPaneId);

        // If no pane is focused, use the first one available.
        if (!targetPane && this.panes.length > 0) {
            targetPane = this.panes[0];
        }
        
        // If still no pane, create a new one.
        if (!targetPane) {
            targetPane = this.createPane(noteId);
        }

        // 2. Update the pane's content and focus.
        targetPane.noteId = noteId;
        this.setFocusedPane(targetPane.id); // This also updates the sidebar.
        
        // 3. Re-render all panes to reflect the changes.
        this.renderAllPanes();
    }

    openNoteInNewPane(noteId) {
        const pane = this.createPane(noteId);
        this.setFocusedPane(pane.id);
        this.renderAllPanes();
    }

    closePane(paneId) {
        this.panes = this.panes.filter(p => p.id !== paneId);
        
        if (this.focusedPaneId === paneId) {
            this.focusedPaneId = this.panes.length > 0 ? this.panes[this.panes.length - 1].id : null;
        }
        
        this.savePanes();
        this.renderAllPanes();
        this.updateActiveNoteInSidebar(); // Ensure sidebar is updated after closing a pane
        this.updateRightSidebar();
    }
    
    setFocusedPane(paneId) {
        this.focusedPaneId = paneId;
        this.savePanes();
        
        document.querySelectorAll('.editor-container').forEach(p => {
            p.classList.toggle('focused', p.dataset.paneId === paneId);
        });
        
        this.updateActiveNoteInSidebar();
        this.updateRightSidebar();
    }

    getPane(paneId) {
        return this.panes.find(p => p.id === paneId);
    }
    
    // --- Core Data & UI Actions ---

    createNote() {
        const note = new Note();
        this.notes[note.id] = note;
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.openNoteInNewPane(note.id);
    }

    deleteNote(noteId) {
        if (!confirm(`Are you sure you want to permanently delete "${this.notes[noteId]?.title || 'this note'}"?`)) return;

        this.panes = this.panes.filter(p => p.noteId !== noteId);
        if (this.panes.some(p => p.id === this.focusedPaneId && p.noteId === noteId)) {
            this.focusedPaneId = null;
        }

        delete this.notes[noteId];
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);

        this.saveNotes();
        this.savePanes();
        this.renderNoteList();
        this.renderAllPanes();
        this.updateRightSidebar();
    }

    // --- Rendering Logic ---

    renderAllPanes() {
        const container = document.getElementById('editorPanesContainer');
        container.innerHTML = '';

        if (this.panes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Welcome to PKM Notes</h3>
                    <p>Select a note from the sidebar or create a new one to get started.</p>
                </div>`;
            this.updateRightSidebar();
            return;
        }

        this.panes.forEach(pane => {
            const note = this.notes[pane.noteId];
            if (!note) {
                this.closePane(pane.id);
                return;
            };

            const paneEl = document.createElement('div');
            paneEl.className = 'editor-container';
            paneEl.dataset.paneId = pane.id;
            
            if(pane.id === this.focusedPaneId) {
                paneEl.classList.add('focused');
            }

            paneEl.innerHTML = this.getEditorHTML(note, pane);
            container.appendChild(paneEl);
            
            this.bindPaneEvents(paneEl, pane);
            this.updatePaneContent(paneEl, note);
        });
        
        this.savePanes();
    }

    getEditorHTML(note, pane) {
        return `
            <div class="editor-header">
                <div class="editor-title-wrapper">
                    <button class="close-pane-btn" title="Close Pane">×</button>
                    <div class="editor-title" title="${note.title}">${note.title}</div>
                </div>
                <div class="editor-modes">
                    <button class="mode-btn ${pane.mode === 'edit' ? 'active' : ''}" data-mode="edit">Edit</button>
                    <button class="mode-btn ${pane.mode === 'split' ? 'active' : ''}" data-mode="split">Split</button>
                    <button class="mode-btn ${pane.mode === 'preview' ? 'active' : ''}" data-mode="preview">Preview</button>
                </div>
            </div>
            <div class="editor-content ${pane.mode}-mode">
                <div class="editor-pane" style="position: relative;">
                    <textarea class="editor-textarea" placeholder="Start writing...">${note.content}</textarea>
                </div>
                <div class="preview-pane"><div class="preview-content"></div></div>
            </div>
            <div class="status-bar">
                <span class="save-status">Saved</span>
            </div>`;
    }

    bindPaneEvents(paneEl, pane) {
        const textarea = paneEl.querySelector('.editor-textarea');
        const autocompleteManager = new AutocompleteManager(this.notes, paneEl.querySelector('.editor-pane'));

        // Store the original title when the pane is first created/bound
        let originalTitle = this.notes[pane.noteId].title;

        paneEl.addEventListener('click', () => this.setFocusedPane(pane.id));
        paneEl.querySelector('.close-pane-btn').addEventListener('click', (e) => { e.stopPropagation(); this.closePane(pane.id); });
        paneEl.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                pane.mode = btn.dataset.mode;
                this.renderAllPanes();
            });
        });

        textarea.addEventListener('input', debounce(() => this.saveNoteFromPane(pane.id, originalTitle), 1500));
        textarea.addEventListener('input', () => {
            const note = this.notes[pane.noteId];
            note.update(textarea.value, false);
            this.updatePaneContent(paneEl, note);
            this.updateRightSidebar();
            this.handleAutocomplete(textarea, autocompleteManager, (match) => {
                 this.afterAutocomplete(textarea, match, () => {
                    note.update(textarea.value, false);
                    this.updatePaneContent(paneEl, note);
                 });
            });
        });

        // Reset the original title when focus changes to this pane
        paneEl.addEventListener('focus', () => {
            originalTitle = this.notes[pane.noteId].title;
        }, true);

        textarea.addEventListener('keydown', (e) => { if (autocompleteManager.handleKeyDown(e)) e.preventDefault(); });
        textarea.addEventListener('blur', () => setTimeout(() => autocompleteManager.hide(), 200));
    }
    
    saveNoteFromPane(paneId, originalTitle = null) {
        const pane = this.getPane(paneId);
        if (!pane) return;
        const paneEl = document.querySelector(`.editor-container[data-pane-id="${paneId}"]`);
        if (!paneEl) return;
        const note = this.notes[pane.noteId];
        const content = paneEl.querySelector('.editor-textarea').value;
        
        // Use the passed originalTitle, or fall back to current title if not provided
        const oldTitle = originalTitle || note.title;

        note.update(content, true);

        console.log('DEBUG: Title change check:', { oldTitle, newTitle: note.title, changed: oldTitle !== note.title });

        if (oldTitle !== note.title) {
            console.log('DEBUG: Title changed, updating sidebar and panes');
            // Title changed - need to update both sidebar and all panes
            this.renderNoteList();
            this.renderAllPanes(); // This recreates all pane elements
            
            // Force an immediate DOM update for the sidebar
            setTimeout(() => {
                console.log('DEBUG: Force updating sidebar after title change');
                this.updateActiveNoteInSidebar();
            }, 0);
            
            // Don't try to use paneEl after this point - it's been recreated
        } else {
            // Title unchanged - just update the current pane's title
            paneEl.querySelector('.editor-title').textContent = note.title;
            // Update the save status for this specific pane
            paneEl.querySelector('.save-status').textContent = `Saved`;
        }
        
        this.saveNotes();
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.updateRightSidebar();
        
        // Only update save status if we didn't re-render all panes
        if (oldTitle === note.title) {
            // Save status was already updated above
        } else {
            // After renderAllPanes(), we need to find the new pane element
            const newPaneEl = document.querySelector(`.editor-container[data-pane-id="${paneId}"]`);
            if (newPaneEl) {
                newPaneEl.querySelector('.save-status').textContent = `Saved`;
            }
        }
    }

    updatePaneContent(paneEl, note) {
        this.updatePanePreview(paneEl, note);
    }
    
    // --- Right Sidebar ---
        updateRightSidebar() {
        const rightSidebar = document.getElementById('rightSidebar');
        const container = rightSidebar.querySelector('.right-sidebar-content');
        const focusedPane = this.getPane(this.focusedPaneId);

        if (!focusedPane || !this.notes[focusedPane.noteId]) {
            container.innerHTML = `<div class="empty-sidebar"><p>No note selected.</p></div>`;
            return;
        }

        const note = this.notes[focusedPane.noteId];

        // Word Count
        const content = note.getContentWithoutMetadata();
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

        // Backlinks
        const backlinks = this.backlinksManager.getBacklinks(note.title);
        let backlinksHTML = `<div class="backlinks-list">
                ${backlinks.map(b => `
                    <div class="backlink-item" data-note-id="${b.noteId}">
                        <div class="backlink-title">${b.noteTitle}</div>
                        <div class="backlink-context">${b.context}</div>
                    </div>`).join('')}
            </div>`;
        if (backlinks.length === 0) {
            backlinksHTML = '<div class="word-count-display">No backlinks to this note.</div>';
        }

        // Render everything
        container.innerHTML = `
            <div class="sidebar-section">
                <div class="sidebar-section-header">Word Count</div>
                <div class="word-count-display">${wordCount} words</div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-section-header">
                    Link Graph
                    <button class="btn" id="exportGraphBtn" style="float: right; padding: 2px 6px; font-size: 10px;">Export CSV</button>
                </div>
                <div class="graph-container" id="graphContainer"></div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-section-header">Backlinks</div>
                ${backlinksHTML}
            </div>
        `;

        // Create the graph visualization with default 1 step
        const graphContainerEl = container.querySelector('#graphContainer');
        this.graphManager.createGraph(graphContainerEl, note.id, 1);

        // Bind export button event - update to include current steps
        const exportBtn = container.querySelector('#exportGraphBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportNetworkData(note.id);
            });
        }

        // Re-bind events for the new backlinks
        container.querySelectorAll('.backlink-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openNote(item.dataset.noteId);
            });
        });
    }

    // --- Network Data Export Method ---
    exportNetworkData(noteId) {
        // Show export options
        const exportMenu = document.createElement('div');
        exportMenu.className = 'context-menu';
        exportMenu.style.position = 'fixed';
        exportMenu.style.top = '50%';
        exportMenu.style.left = '50%';
        exportMenu.style.transform = 'translate(-50%, -50%)';
        exportMenu.style.zIndex = '10000';
        
        exportMenu.innerHTML = `
            <div style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid var(--border); margin-bottom: 8px;">Network Export Options</div>
            <button class="context-menu-item" data-action="export-complete">🌐 Complete Network</button>
            <div style="font-size: 11px; color: var(--text-muted); padding: 4px 12px;">All notes and connections</div>
            <button class="context-menu-item" data-action="export-ego">🎯 Current View Network</button>
            <div style="font-size: 11px; color: var(--text-muted); padding: 4px 12px;">Just the currently visible connections</div>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" data-action="cancel">❌ Cancel</button>
        `;
        
        document.body.appendChild(exportMenu);
        
        // Add event listeners
        exportMenu.querySelector('[data-action="export-complete"]').addEventListener('click', () => {
            this.performNetworkExport(noteId, true); // Complete network
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="export-ego"]').addEventListener('click', () => {
            this.performNetworkExport(noteId, false); // Ego network with current steps
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            exportMenu.remove();
        });
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeExportMenu(e) {
                if (!exportMenu.contains(e.target)) {
                    exportMenu.remove();
                    document.removeEventListener('click', closeExportMenu);
                }
            });
        }, 100);
    }

     performNetworkExport(noteId, completeNetwork = true) {
        const currentSteps = completeNetwork ? null : this.graphManager.currentSteps;
        const networkData = this.graphManager.exportNetworkCSV(noteId, true, completeNetwork, true, currentSteps);
        if (!networkData) return;

        const note = this.notes[noteId];
        const timestamp = new Date().toISOString().split('T')[0];
        const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const networkType = completeNetwork ? 'complete' : `ego_${currentSteps}step${currentSteps > 1 ? 's' : ''}`;

        // Count files to download
        let fileCount = 3; // edges, nodes, stats
        if (networkData.isolatedCSV && completeNetwork) {
            fileCount = 4; // add isolated notes
        }

        // Download all CSV files with staggered timing
        this.graphManager.downloadCSV(
            networkData.edgesCSV, 
            `${safeTitle}_${networkType}_edges_${timestamp}.csv`
        );

        setTimeout(() => {
            this.graphManager.downloadCSV(
                networkData.nodesCSV, 
                `${safeTitle}_${networkType}_nodes_${timestamp}.csv`
            );
        }, 100);

        setTimeout(() => {
            this.graphManager.downloadCSV(
                networkData.statsCSV, 
                `${safeTitle}_${networkType}_stats_${timestamp}.csv`
            );
        }, 200);

        // Download isolated notes if available
        if (networkData.isolatedCSV && completeNetwork) {
            setTimeout(() => {
                this.graphManager.downloadCSV(
                    networkData.isolatedCSV, 
                    `${safeTitle}_isolated_notes_${timestamp}.csv`
                );
            }, 300);
        }

        // Show user feedback
        const totalNotes = Object.keys(this.notes).length;
        const networkSize = completeNetwork ? totalNotes : `${currentSteps}-step network`;
        
        setTimeout(() => {
            let message = `${completeNetwork ? 'Complete' : `${currentSteps}-step ego`} network data exported!\n\nNetwork size: ${networkSize}\nDownloaded ${fileCount} files:\n• Edges (connections)\n• Nodes (connected notes)\n• Statistics (metrics with centrality & communities)`;
            
            if (networkData.isolatedCSV && completeNetwork) {
                message += '\n• Isolated Notes (orphan notes with no wikilinks)';
            }
            
            alert(message);
        }, 400);
    }

    // --- Context Menu & Note List Sidebar ---

    renderNoteList() {
        console.log('DEBUG: renderNoteList called');
        const noteList = document.getElementById('noteList');
        const sortedNotes = Object.values(this.notes).sort((a, b) => b.modified - a.modified);
        
        console.log('DEBUG: Sorted notes titles:', sortedNotes.map(n => n.title));
        
        // Update the innerHTML
        noteList.innerHTML = sortedNotes.map(note => `
            <div class="note-item" data-note-id="${note.id}">
                <div class="note-title">${note.title}</div>
                <div class="note-preview">${note.getPreview()}</div>
            </div>`).join('');

        console.log('DEBUG: Updated noteList innerHTML');

        // Force a reflow to ensure DOM is updated immediately
        noteList.offsetHeight; // This forces the browser to recalculate layout

        // Re-bind events to the new elements
        noteList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => this.openNote(item.dataset.noteId));
            item.addEventListener('contextmenu', (e) => { 
                e.preventDefault(); 
                this.showContextMenu(e, item.dataset.noteId); 
            });
        });
        
        console.log('DEBUG: About to call updateActiveNoteInSidebar via requestAnimationFrame');
        
        // Use double requestAnimationFrame to ensure DOM is fully rendered before updating active state
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                console.log('DEBUG: Calling updateActiveNoteInSidebar from renderNoteList');
                this.updateActiveNoteInSidebar();
            });
        });
    }

    updateActiveNoteInSidebar() {
        // Use a double requestAnimationFrame to ensure DOM is fully updated
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // First, remove 'active' class from any currently highlighted item.
                document.querySelectorAll('.note-item.active').forEach(activeItem => {
                    activeItem.classList.remove('active');
                });
            
                // Then, find the correct note and add the 'active' class.
                const focusedPane = this.getPane(this.focusedPaneId);
                if (focusedPane) {
                    const newActiveItem = document.querySelector(`.note-item[data-note-id="${focusedPane.noteId}"]`);
                    if (newActiveItem) {
                        newActiveItem.classList.add('active');
                        
                        // Force another reflow to ensure the visual update happens
                        newActiveItem.offsetHeight;
                    }
                }
            });
        });
    }

    showContextMenu(event, noteId) {
        this.hideContextMenu();
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';

        let menuItems = '';

        if (noteId) {
            // Menu for a specific note
            menuItems = `
                <button class="context-menu-item" data-action="new-note">📝 New Note</button>
                <div class="context-menu-separator"></div>
                <button class="context-menu-item" data-action="open-pane">✨ Open in New Pane</button>
                <div class="context-menu-separator"></div>
                <button class="context-menu-item" data-action="delete">🗑️ Delete Note</button>
            `;
        } else {
            // Menu for the sidebar background
            menuItems = `<button class="context-menu-item" data-action="new-note">📝 New Note</button>`;
        }

        menu.innerHTML = menuItems;
        document.body.appendChild(menu);
        menu.style.top = `${event.clientY}px`;
        menu.style.left = `${event.clientX}px`;
        
        // Bind actions
        menu.querySelector('[data-action="new-note"]').addEventListener('click', () => { this.createNote(); this.hideContextMenu(); });
        
        if (noteId) {
            menu.querySelector('[data-action="delete"]').addEventListener('click', () => { this.deleteNote(noteId); this.hideContextMenu(); });
            menu.querySelector('[data-action="open-pane"]').addEventListener('click', () => { this.openNoteInNewPane(noteId); this.hideContextMenu(); });
        }
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.remove();
    }

    // --- Pane-Specific Update Methods --- 

    updatePanePreview(paneEl, note) {
        const previewContentEl = paneEl.querySelector('.preview-content');
        if (!previewContentEl) return;
        let content = note.getContentWithoutMetadata();
        content = content.replace(/!\[\[([^#\]]+)#\^([^\]]+)\]\]/g, (match, noteTitle, blockId) => {
            const targetNote = Object.values(this.notes).find(n => n.title.toLowerCase() === noteTitle.trim().toLowerCase());
            if (targetNote) {
                const blockContent = targetNote.getBlockContent(blockId.trim());
                if (blockContent) return `<div class="embedded-block">${marked.parse(blockContent)}<div class="embedded-block-source">From: <span class="wikilink" data-link="${targetNote.title}">${targetNote.title}</span></div></div>`;
                return `<div class="broken-embed">Block <code>^${blockId}</code> not found in "${noteTitle}"</div>`;
            }
            return `<div class="broken-embed">Note "${noteTitle}" not found</div>`;
        });
        content = content.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
            const exists = Object.values(this.notes).some(n => n.title.toLowerCase() === linkText.toLowerCase());
            return `<span class="${exists ? 'wikilink' : 'wikilink broken'}" data-link="${linkText}">${linkText}</span>`;
        });
        previewContentEl.innerHTML = marked.parse(content);
        previewContentEl.querySelectorAll('pre code').forEach(b => hljs.highlightBlock(b));
        previewContentEl.querySelectorAll('.wikilink').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetNote = Object.values(this.notes).find(n => n.title.toLowerCase() === link.dataset.link.toLowerCase());
                if (targetNote) this.openNote(targetNote.id);
            });
        });
    }

    handleAutocomplete(textarea, autocompleteManager, onSelectCallback) {
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPos);
        const linkMatch = textBeforeCursor.match(/\[\[([^\]]*?)$/);
        if (linkMatch) autocompleteManager.show(textarea, linkMatch[1], onSelectCallback);
        else autocompleteManager.hide();
    }

    afterAutocomplete(textarea, match, onComplete) {
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPos);
        const linkMatch = textBeforeCursor.match(/\[\[([^\]]*?)$/);
        const query = linkMatch[1];
        const beforeLink = textarea.value.substring(0, cursorPos - query.length);
        const afterCursor = textarea.value.substring(cursorPos);
        if (match.type === 'create') {
            const newNote = new Note(match.title);
            this.notes[newNote.id] = newNote;
            this.graphManager.updateNotes(this.notes);
            this.saveNotes();
            this.renderNoteList();
        }
        textarea.value = beforeLink + match.title + ']]' + afterCursor;
        const newCursorPos = beforeLink.length + match.title.length + 2;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        onComplete();
        textarea.focus();
    }
    
    saveNotes() { storage.set('pkm_notes', this.notes); }
    saveSettings() { storage.set('pkm_settings', this.settings); }
    savePanes() {
        storage.set('pkm_panes', this.panes);
        storage.set('pkm_focused_pane', this.focusedPaneId);
    }
    
    importFiles() { document.getElementById('fileInput').click(); }
    
    handleFileImport(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            if (file.type === 'text/markdown' || file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;
                    
                    // Extract title from filename (remove extension)
                    let title = file.name.replace(/\.(md|txt)$/i, '');
                    
                    // Try to extract title from content if it has frontmatter
                    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                    if (yamlMatch) {
                        const yamlContent = yamlMatch[1];
                        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
                        if (titleMatch) {
                            title = titleMatch[1].replace(/^['"]|['"]$/g, ''); // Remove quotes
                        }
                    }

                    // Create new note with imported content
                    const note = new Note(title, content);
                    this.notes[note.id] = note;
                    
                    console.log(`Imported note: ${title}`);
                };
                reader.readAsText(file);
            } else {
                alert(`Unsupported file type: ${file.name}. Only .md and .txt files are supported.`);
            }
        });

        // Update UI after all files are processed
        setTimeout(() => {
            this.backlinksManager.updateNotes(this.notes);
            this.graphManager.updateNotes(this.notes);
            this.saveNotes();
            this.renderNoteList();
            this.updateRightSidebar();
        }, 100);

        // Clear the file input
        event.target.value = '';
    }

    exportNotes() {
        // Show export options
        const exportMenu = document.createElement('div');
        exportMenu.className = 'context-menu';
        exportMenu.style.position = 'fixed';
        exportMenu.style.top = '50%';
        exportMenu.style.left = '50%';
        exportMenu.style.transform = 'translate(-50%, -50%)';
        exportMenu.style.zIndex = '10000';
        
        exportMenu.innerHTML = `
            <div style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid var(--border); margin-bottom: 8px;">Export Options</div>
            <button class="context-menu-item" data-action="export-json">📄 Export as JSON</button>
            <button class="context-menu-item" data-action="export-markdown">📝 Export as Markdown Files</button>
            <button class="context-menu-item" data-action="export-single-md">📋 Export as Single Markdown</button>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" data-action="cancel">❌ Cancel</button>
        `;
        
        document.body.appendChild(exportMenu);
        
        // Add event listeners
        exportMenu.querySelector('[data-action="export-json"]').addEventListener('click', () => {
            this.exportAsJSON();
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="export-markdown"]').addEventListener('click', () => {
            this.exportAsMarkdownFiles();
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="export-single-md"]').addEventListener('click', () => {
            this.exportAsSingleMarkdown();
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            exportMenu.remove();
        });
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeExportMenu(e) {
                if (!exportMenu.contains(e.target)) {
                    exportMenu.remove();
                    document.removeEventListener('click', closeExportMenu);
                }
            });
        }, 100);
    }

    exportAsJSON() {
        const exportData = {
            notes: this.notes,
            exported: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `pkm-notes-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportAsMarkdownFiles() {
        if (Object.keys(this.notes).length === 0) {
            alert('No notes to export!');
            return;
        }

        // Create a zip-like structure by downloading each file individually
        // Note: For a real zip, look at eg JSZip
        Object.values(this.notes).forEach((note, index) => {
            setTimeout(() => {
                const blob = new Blob([note.content], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                // Sanitize filename
                const filename = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                a.download = `${filename}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, index * 100); // Stagger downloads to avoid browser blocking
        });
        
        alert(`Downloading ${Object.keys(this.notes).length} markdown files...`);
    }

    exportAsSingleMarkdown() {
        if (Object.keys(this.notes).length === 0) {
            alert('No notes to export!');
            return;
        }

        const sortedNotes = Object.values(this.notes).sort((a, b) => b.modified - a.modified);
        
        let combinedContent = `# PKM Notes Export\n\nExported on: ${new Date().toLocaleString()}\n\n---\n\n`;
        
        sortedNotes.forEach(note => {
            combinedContent += `# ${note.title}\n\n`;
            combinedContent += `*Created: ${new Date(note.created).toLocaleString()}*\n`;
            combinedContent += `*Modified: ${new Date(note.modified).toLocaleString()}*\n\n`;
            combinedContent += note.getContentWithoutMetadata();
            combinedContent += `\n\n---\n\n`;
        });
        
        const blob = new Blob([combinedContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `pkm-notes-combined-${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    toggleTheme() { 
        this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light'; 
        this.saveSettings(); 
        this.setupTheme(); 
    }

    showWelcomeModal() {
        // Check if user has seen the welcome modal before
        const hasSeenWelcome = storage.get('pkm_seen_welcome', false);
        if (hasSeenWelcome) return;

        const modal = document.createElement('div');
        modal.className = 'welcome-modal';
        modal.innerHTML = `
       <div class="welcome-overlay"></div>
        <div class="welcome-modal-content">
            <div class="welcome-header">
                <h2>Welcome to PKM WebNotes! 📝</h2>
                <button class="welcome-close-btn">×</button>
            </div>
            <div class="welcome-body">
                <h3>Features</h3>
                
                <h4>Note Management</h4>
                <ul>
                    <li>Create and edit notes with markdown support</li>
                    <li>Notes automatically save as you type</li>
                    <li>Real-time preview with syntax highlighting</li>
                    <li>Search through all notes by title or content</li>
                    <li>Notes are sorted by most recently modified</li>
                </ul>
                
                <h4>Linking System</h4>
                <ul>
                    <li>Create wiki-style links between notes using <code>[[Note Title]]</code> syntax</li>
                    <li>Autocomplete suggestions when typing links</li>
                    <li>Backlinks panel shows which notes link to the current note</li>
                    <li>Broken links are highlighted differently from valid links</li>
                    <li>Create new notes directly from broken links</li>
                </ul>
                
                <h4>Multi-Pane Interface</h4>
                <ul>
                    <li>Open multiple notes simultaneously in separate panes</li>
                    <li>Split view modes: Edit only, Preview only, or Split (edit and preview side-by-side)</li>
                    <li>Click any pane to focus it</li>
                    <li>Close individual panes with the X button</li>
                    <li>Right-click a note in the note list to open in a new pane; use horizontal scroll bar if necessary!</li>
                    <li>Right sidebar shows information for the currently focused note</li>
                </ul>
                
                <h4>Import and Export</h4>
                <ul>
                    <li>Import markdown (.md) and text (.txt) files</li>
                    <li>Export options:
                        <ul>
                            <li>JSON format (complete backup with metadata)</li>
                            <li>Individual markdown files</li>
                            <li>Single combined markdown file</li>
                        </ul>
                    </li>
                    <li>Preserve frontmatter and metadata during import/export</li>
                </ul>
                
                <h4>Wikilink Connection Graph Export</h4>
                <ul>
                    <li>Export as nodes and edges CSV describing the interconnections in your notes</li>
                    <li>Network statistics calculated include <strong>Betweenness Centrality</strong> and <strong>Community Detection</strong></li>
                    <li><strong>What This Reveals About Your Notes:</strong>
                        <ul>
                            <li>High betweenness centrality notes = Your most important conceptual bridges</li>
                            <li>Communities = Natural topic clusters in your knowledge</li>
                            <li>Modularity score = How well-separated your topics are</li>
                        </ul>
                    </li>
                </ul>
                
                <h4>Themes</h4>
                <ul>
                    <li>Light and dark theme support</li>
                    <li>Theme preference is saved automatically</li>
                </ul>
                
                <h3>Getting Started</h3>
                <ol>
                    <li>Click "New Note" to create your first note</li>
                    <li>Start writing in markdown format</li>
                    <li>Use <code>[[Note Title]]</code> to link to other notes</li>
                    <li>Right-click on notes in the sidebar for additional options</li>
                    <li>You can create new notes by writing a wikilink to a non-existing note; before you get to the final ]], autocomplete will ask if you wish to create that note. Click on that modal to create!</li>
                </ol>
                
                <h3>Block Embeds</h3>
                <p>If you want to embed blocks from one note in another, you have to give the block an id. To test this, create a note:</p>
                
                <pre><code># Source Note

This is a paragraph with a block reference. ^my-block

Another paragraph here. ^another-block</code></pre>
                
                <p>Then reference those blocks in another note:</p>
                
                <pre><code># Target Note

Here's an embedded block:
![[Source Note#^my-block]]

And another:
![[Source Note#^another-block]]</code></pre>
                
                <p>When you preview the target note, the other blocks will embed. <strong>Careful</strong> this is fragile:</p>
                <ul>
                    <li>Case sensitivity: <code>![[source note#^my-block]]</code> won't match <code>Source Note</code></li>
                    <li>Exact title matching: Note titles must match exactly</li>
                    <li>Only works in preview: Embeds don't show in edit mode</li>
                </ul>
            </div>
            <div class="welcome-footer">
                <button class="btn btn-primary" id="welcomeGotItBtn">Got it!</button>
                <label class="welcome-checkbox">
                    <input type="checkbox" id="welcomeDontShow"> Don't show this again
                </label>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Bind events
    const closeBtn = modal.querySelector('.welcome-close-btn');
    const gotItBtn = modal.querySelector('#welcomeGotItBtn');
    const overlay = modal.querySelector('.welcome-overlay');
    const dontShowCheckbox = modal.querySelector('#welcomeDontShow');

    const closeModal = () => {
        if (dontShowCheckbox.checked) {
            storage.set('pkm_seen_welcome', true);
        }
        modal.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    gotItBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    // ESC key to close
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}
}

document.addEventListener('DOMContentLoaded', () => {
    new PKMApp();
});