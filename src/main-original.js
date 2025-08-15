// Import CodeMirror modules
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { autocompletion } from '@codemirror/autocomplete'
import { wikilinkPlugin } from './wikilink-decorator.js';


import { PyodideManager } from './pyodideManager.js';
import { Note } from './note.js';
import { BacklinksManager } from './backlinks.js';
import { GraphManager } from './graph.js';
import { ResizablePanes } from './resizable-panes.js';
import { storage, debounce } from './utils.js'; 
import { RightSidebar } from './rightsidebar.js';

// CodeMirror Editor Wrapper Class
class MarkdownEditor {
constructor(parent, content = '', notes = {}, openNoteCallback = null, createNoteCallback = null, completionSource = null) { 
    this.onContentChange = null;
    this.notes = notes;
    this.openNoteCallback = openNoteCallback;
    this.createNoteCallback = createNoteCallback;
    
    this.view = new EditorView({
        state: EditorState.create({
            doc: content,
            extensions: [
                markdown(),
                search(),
                
                autocompletion({ override: completionSource ? [completionSource] : [] }), 
                ...(openNoteCallback && createNoteCallback ? 
                    [wikilinkPlugin(notes, openNoteCallback, createNoteCallback)] : []
                ),
                keymap.of([
                    ...defaultKeymap,
                    ...searchKeymap
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && this.onContentChange) {
                        this.onContentChange(this.getContent())
                    }
                }),
                EditorView.lineWrapping
            ]
        }),
        parent
    })
}



    getContent() {
        return this.view.state.doc.toString()
    }

    setContent(content) {
        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content
            }
        })
    }

    setOnContentChange(callback) {
        this.onContentChange = callback
    }

    focus() {
        this.view.focus()
    }

    destroy() {
        this.view.destroy()
    }
}


// Main PKM Application Class
class PKMApp {
    constructor() {
        this.notes = this.loadNotes();
        this.settings = storage.get('pkm_settings', { theme: 'light', skipDeleteConfirm: false });
        this.activeNoteId = null;
        this.sortOrder = storage.get('pkm_sort_order', 'alphabetical');

        this.panes = storage.get('pkm_panes', []);
        this.focusedPaneId = storage.get('pkm_focused_pane', null);
        

        this.history = [];
        this.historyIndex = -1;
        this.isNavigating = false; // A flag to prevent cycles
    

        this.paneWidths = new Map(storage.get('pkm_pane_widths', []));

        this.backlinksManager = new BacklinksManager(this.notes);
        this.graphManager = new GraphManager(this.notes);
        
        this.pyodideManager = new PyodideManager();
        this.codeBlockOutputs = new Map();
        
        // Store CodeMirror instances for each pane
        this.editorInstances = new Map();
        
        this.graphManager.onNodeClick = (noteId) => this.openNote(noteId);
        this.resizablePanes = null;
        this.md = null;

        this.setupMarkdownParser(); 
        this.init();
    }
    
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    setupMarkdownParser() {
    const checkDependencies = () => {
        if (!window.markdownit || !window.hljs) {
            setTimeout(checkDependencies, 100);
            return;
        }
        this.initializeMarkdownParser();
    };
    checkDependencies();
}

    initializeMarkdownParser() {
    const wikilinkPlugin = (md) => {
        // Enhanced regex to handle both formats: [[id|title]] and [[title/alias]]
        const wikilinkRegex = /\[\[([^|\]\/]+)(?:\|([^\]]+)|\/([^\]]+))?\]\]/;

        function wikilinkTokenizer(state, silent) {
    // Added Guard Condition ---
    // Check if we are inside an active code delimiter.
    // The `state.delimiters` array holds active markers like `*` or `_` or `` ` ``.
    if (state.delimiters) {
        for (let i = 0; i < state.delimiters.length; i++) {
            // 0x60 is the character code for the backtick '`'
            if (state.delimiters[i].marker === 0x60) {
                return false; // Abort if we're inside a code block
            }
        }
    }
            const match = wikilinkRegex.exec(state.src.slice(state.pos));
            if (!match) { return false; }

            const fullMatch = match[0];
            const firstPart = match[1].trim();
            const pipePart = match[2] ? match[2].trim() : null;
            const slashPart = match[3] ? match[3].trim() : null;
            
            let id, text, noteTitle;
            
            if (pipePart) {
                // Format: [[id|title]]
                id = firstPart;
                text = pipePart;
                noteTitle = pipePart;
            } else if (slashPart) {
                // Format: [[title/alias]]
                noteTitle = firstPart;
                text = slashPart;
                // Find the note ID from title
                const notes = state.env.notes || {};
                const note = Object.values(notes).find(n => 
                    n.title.toLowerCase() === noteTitle.toLowerCase()
                );
                id = note ? note.id : null;
            } else {
                // This shouldn't happen with our conversion, but handle it
                id = firstPart;
                text = firstPart;
                noteTitle = firstPart;
            }

            if (!silent) {
                const token = state.push('wikilink_open', 'span', 1);
                token.attrs = [['class', 'wikilink'], ['data-link', id || noteTitle], ['title', `Link to: ${text}`]];
                
                const textToken = state.push('text', '', 0);
                textToken.content = text;
                
                state.push('wikilink_close', 'span', -1);
            }
            state.pos += fullMatch.length;
            return true;
        }

        md.inline.ruler.before('link', 'wikilink', wikilinkTokenizer);

        md.renderer.rules.wikilink_open = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const linkRef = token.attrGet('data-link');
            
            const notes = env.notes || {};
            const exists = notes[linkRef] || Object.values(notes).find(n => 
                n.title.toLowerCase() === linkRef.toLowerCase()
            );
            
            if (!exists) {
                token.attrJoin('class', 'broken');
            } else {
                token.attrSet('title', `Link to: ${exists.title}`);
            }

            return self.renderToken(tokens, idx, options);
        };
    };

    const mdInstance = window.markdownit({
        html: true, linkify: true, typographer: true, tables: true,
    }).use(wikilinkPlugin);

    mdInstance.options.highlight = function (str, lang) {
        if (lang && window.hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' + window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
            } catch (__) {}
        }
        return '<pre class="hljs"><code>' + mdInstance.utils.escapeHtml(str) + '</code></pre>';
    };
    this.md = mdInstance;
}
    
    bindPyodideStatus() {
        this.pyodideManager.setStatusCallback((status, message) => {
            const statusEl = document.getElementById('pyodideStatus');
            const textEl = statusEl.querySelector('.status-text');
            if (!statusEl || !textEl) return;
            statusEl.className = 'pyodide-status';
            statusEl.classList.add(status);
            textEl.textContent = message;
        });
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

    async init() {
        await this.waitForDependencies();
        
        if (Object.keys(this.notes).length === 0) {
            const hasLoadedBefore = storage.get('pkm_has_loaded_before', false);
            if (!hasLoadedBefore) {
                console.log("First time load: creating default notes from external files.");
                this.notes = await this.createDefaultNotes();
                this.saveNotes();
                this.backlinksManager.updateNotes(this.notes);
                this.graphManager.updateNotes(this.notes);
                storage.set('pkm_has_loaded_before', true);
            }
        }

        this.setupTheme();
        this.bindPyodideStatus();
        this.bindGlobalEvents();
        this.renderNoteList();
        this.loadInitialPanes();
        this.updateRightSidebar();
        this.initResizablePanes();
        new RightSidebar('toggle-right-sidebar', '.main', this.resizablePanes);
        this.showWelcomeModal();
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        document.querySelector('.sidebar').addEventListener('contextmenu', e => {
            if (!e.target.closest('.note-item')) {
                e.preventDefault();
                this.showContextMenu(e, { type: 'sidebar' }); 
            }
        });
    }

    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDeps = () => {
                if (window.markdownit && window.DOMPurify && window.hljs && window.d3) {
                    resolve();
                } else {
                    setTimeout(checkDeps, 100);
                }
            };
            checkDeps();
        });
    }
    
    async createDefaultNotes() {
        const notes = {};
        try {
            console.log("=== Starting createDefaultNotes ===");
            
            const manifestResponse = await fetch('content/manifest.json');
            if (!manifestResponse.ok) {
                throw new Error(`Failed to fetch manifest.json: ${manifestResponse.statusText}`);
            }
            
            const manifest = await manifestResponse.json();
            console.log("Manifest loaded:", manifest);

            const processEntries = (entries, currentPath = '') => {
                let files = [];
                console.log(`Processing entries at path: "${currentPath}"`);
                
                for (const key in entries) {
                    const value = entries[key];
                    console.log(`Processing key: "${key}", value type:`, Array.isArray(value) ? 'array' : typeof value);
                    
                    if (Array.isArray(value)) { 
                        console.log(`"${key}" is an array with ${value.length} files`);
                        
                        value.forEach(filename => {
                            let filePath, folder;
                            
                            if (key === 'root') {
                                filePath = filename;
                                folder = 'root';
                            } else {
                                filePath = currentPath ? `${currentPath}${key}/${filename}` : `${key}/${filename}`;
                                folder = currentPath ? `${currentPath}${key}` : key;
                            }
                            
                            const fileInfo = { filePath, folder };
                            console.log(`Added file: ${JSON.stringify(fileInfo)}`);
                            files.push(fileInfo);
                        });
                    } else if (typeof value === 'object' && value !== null) { 
                        console.log(`"${key}" is a folder object, recursing...`);
                        const newPath = currentPath ? `${currentPath}${key}/` : `${key}/`;
                        const subFiles = processEntries(value, newPath);
                        files = files.concat(subFiles);
                        console.log(`Added ${subFiles.length} files from subfolder "${key}"`);
                    }
                }
                return files;
            };

            const noteFiles = processEntries(manifest.defaultNotes);
            console.log("=== ALL FILES TO FETCH ===");
            noteFiles.forEach((file, index) => {
                console.log(`${index + 1}. ${file.filePath} -> folder: "${file.folder}"`);
            });

            if (!noteFiles || noteFiles.length === 0) {
                console.warn("No default notes listed in manifest.json");
                return {};
            }

            console.log("=== STARTING FETCHES ===");
            const fetchPromises = noteFiles.map((fileInfo, index) =>
                fetch(`content/${fileInfo.filePath}`)
                    .then(response => {
                        console.log(`${index + 1}. Fetching content/${fileInfo.filePath}:`, response.ok ? 'SUCCESS' : 'FAILED');
                        if (!response.ok) {
                            console.error(`Failed to fetch content/${fileInfo.filePath}: ${response.status} ${response.statusText}`);
                            return { 
                                content: `# Error Loading File\n\nFailed to load content for ${fileInfo.filePath}.\n\nStatus: ${response.status} ${response.statusText}\nFull URL: ${response.url}`, 
                                fileInfo,
                                error: true 
                            };
                        }
                        return response.text().then(content => {
                            console.log(`   SUCCESS: Got ${content.length} characters for ${fileInfo.filePath}`);
                            return { content, fileInfo, error: false };
                        });
                    })
                    .catch(error => {
                        console.error(`Exception fetching ${fileInfo.filePath}:`, error);
                        return { 
                            content: `# Network Error\n\nFailed to load ${fileInfo.filePath}\n\nError: ${error.message}`, 
                            fileInfo,
                            error: true 
                        };
                    })
            );

            const noteResults = await Promise.all(fetchPromises);
            console.log("=== PROCESSING RESULTS ===");

            noteResults.forEach((result, index) => {
                const { content, fileInfo, error } = result;
                
                let title = fileInfo.filePath.split('/').pop().replace(/\.(md|txt)$/i, '');
                
                if (!error) {
                    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                    if (yamlMatch) {
                        const yamlContent = yamlMatch[1];
                        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
                        if (titleMatch) {
                            title = titleMatch[1].replace(/^['"]|['"]$/g, '').trim();
                            console.log(`   Extracted title from YAML: "${title}"`);
                        }
                    }
                }
                
                const note = new Note(title, content);
                note.folder = fileInfo.folder;
                console.log(`Created note: "${note.title}" in folder: "${note.folder}"`);
                notes[note.id] = note;
            });

            console.log(`=== FINAL: Created ${Object.keys(notes).length} notes ===`);

        } catch (error) {
            console.error("Error creating default notes:", error);
            const errorNote = new Note("Error Loading Notes", 
                `There was an issue loading the default notes: ${error.message}\n\nPlease check 'content/manifest.json' and the browser console for details.`);
            errorNote.folder = 'root';
            notes[errorNote.id] = errorNote;
        }
        return notes;
    }

    initResizablePanes() {
        const container = document.getElementById('editorPanesContainer');
        if (container && !this.resizablePanes) {
            this.resizablePanes = new ResizablePanes(container);
            this.resizablePanes.onResizeEnd = (paneId, newWidth) => {
                this.paneWidths.set(paneId, newWidth);
                storage.set('pkm_pane_widths', Array.from(this.paneWidths.entries()));
            };
        }
    }

    setupTheme() {
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    // The editor will now default to its light theme, so no extra call is needed.
}


updateHistoryButtons() {
    const backBtn = document.getElementById('backBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    if (!backBtn || !forwardBtn) return;

    backBtn.disabled = this.historyIndex <= 0;
    forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
}

addHistoryEntry(paneId, noteId) {
    if (this.isNavigating) {
        return;
    }

    const lastEntry = this.history[this.historyIndex];
    if (lastEntry && lastEntry.paneId === paneId && lastEntry.noteId === noteId) {
        return; // Don't add duplicate consecutive entries
    }
    
    // If we are in the middle of history, new action clears the "forward" history
    if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.history.push({ paneId, noteId });
    this.historyIndex = this.history.length - 1;
    
    this.updateHistoryButtons();
}

navigateBack() {
    if (this.historyIndex > 0) {
        this.isNavigating = true;
        this.historyIndex--;
        const entry = this.history[this.historyIndex];
        this.openNote(entry.noteId, entry.paneId, false); // Go to the note without adding new history
        this.setFocusedPane(entry.paneId, false);
        this.isNavigating = false;
        this.updateHistoryButtons();
    }
}

navigateForward() {
    if (this.historyIndex < this.history.length - 1) {
        this.isNavigating = true;
        this.historyIndex++;
        const entry = this.history[this.historyIndex];
        this.openNote(entry.noteId, entry.paneId, false);
        this.setFocusedPane(entry.paneId, false);
        this.isNavigating = false;
        this.updateHistoryButtons();
    }
}

    bindGlobalEvents() {
        document.getElementById('newNoteBtn').addEventListener('click', () => this.createNote());
       document.getElementById('backBtn').addEventListener('click', () => this.navigateBack());
        document.getElementById('forwardBtn').addEventListener('click', () => this.navigateForward());
        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('importBtn').addEventListener('click', () => this.importFiles());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('searchInput').addEventListener('input', debounce((e) => this.searchNotes(e.target.value), 300));
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));
        document.getElementById('noteListHeader').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(e, { type: 'header' });
        });
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                if (this.focusedPaneId && this.resizablePanes) {
                    this.resizablePanes.toggleMaximize(this.focusedPaneId);
                }
            }
            
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                this.resetPaneWidths();
            }
            
            if (e.key === 'Escape' && this.resizablePanes && this.resizablePanes.isMaximized()) {
                this.resizablePanes.restoreFromMaximized();
            }
        });
    }

    loadInitialPanes() {
        if (this.panes.length > 0) {
            this.renderAllPanes();
            
            setTimeout(() => {
                const maximizedPaneId = storage.get('pkm_maximized_pane', null);
                if (maximizedPaneId && this.resizablePanes) {
                    const paneExists = this.panes.some(p => p.id === maximizedPaneId);
                    if (paneExists) {
                        this.resizablePanes.maximizePane(maximizedPaneId);
                    }
                }
            }, 100);
        } else {
            const container = document.getElementById('editorPanesContainer');
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Welcome to PKM Notes</h3>
                    <p>Select a note from the sidebar or create a new one to get started.</p>
                </div>`;
        }
    }
    
    createPane(noteId) {
        const newPane = { id: 'pane_' + Date.now(), noteId: noteId, mode: 'split' };
        this.panes.push(newPane);
        this.savePanes();
        return newPane;
    }

    openNote(noteId, targetPaneId = null, addToHistory = true) { // Add new parameters
    let targetPane;

    if (targetPaneId) {
        targetPane = this.getPane(targetPaneId);
    } else {
        targetPane = this.getPane(this.focusedPaneId);
    }
    
    if (!targetPane && this.panes.length > 0) targetPane = this.panes[0];
    if (!targetPane) targetPane = this.createPane(noteId);
    
    targetPane.noteId = noteId;
    
    // Use the addToHistory flag for setFocusedPane
    this.setFocusedPane(targetPane.id, addToHistory); 
    
    this.renderAllPanes();
}

    openNoteInNewPane(noteId) {
        const pane = this.createPane(noteId);
        this.setFocusedPane(pane.id);
        this.renderAllPanes();
    }

    closePane(paneId) {
        const editor = this.editorInstances.get(paneId);
        if (editor) {
            editor.destroy();
            this.editorInstances.delete(paneId);
        }
        
        this.paneWidths.delete(paneId);
        this.panes = this.panes.filter(p => p.id !== paneId);
        if (this.focusedPaneId === paneId) {
            this.focusedPaneId = this.panes.length > 0 ? this.panes[this.panes.length - 1].id : null;
        }
        this.savePanes();
        this.renderAllPanes();
        this.updateActiveNoteInSidebar();
        this.updateRightSidebar();
    }
    
    setFocusedPane(paneId, addToHistory = true) { // Add new parameter
    this.focusedPaneId = paneId;
    
    if (addToHistory) {
        const pane = this.getPane(paneId);
        if (pane) {
            this.addHistoryEntry(pane.id, pane.noteId);
        }
    }

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
    
    resetPaneWidths() {
        if (this.resizablePanes) {
            this.resizablePanes.resetWidths();
            this.paneWidths.clear();
            storage.set('pkm_pane_widths', []);
        }
    }
    
    getPaneMaximizeStatus() {
        if (!this.resizablePanes) return null;
        
        return {
            isMaximized: this.resizablePanes.isMaximized(),
            maximizedPaneId: this.resizablePanes.getMaximizedPane()
        };
    }
    
    createNote() {
        const note = new Note();
        this.notes[note.id] = note;
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.openNoteInNewPane(note.id);
    }

    createNoteWithTitle(title) {
        const existingNote = Object.values(this.notes).find(n => n.title.toLowerCase() === title.toLowerCase());
        if (existingNote) {
            this.openNote(existingNote.id);
            return;
        }
        const note = new Note(title);
        this.notes[note.id] = note;
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.openNoteInNewPane(note.id);
    }

    async deleteNote(noteId, event = {}) {
        let confirmed = true;
        let skipFuture = false;

        if (!this.settings.skipDeleteConfirm || event.shiftKey) {
            const title = this.notes[noteId]?.title || 'this note';
            const result = await this._showConfirmationModal({
                title: 'Delete Note?',
                message: `Are you sure you want to permanently delete "${title}"? This action cannot be undone. <br><br><b>Tip:</b> Hold 'Shift' when clicking 'Delete' to always see this confirmation.`,
                confirmText: 'Delete',
                confirmClass: 'danger',
                showSkipCheckbox: true
            });
            confirmed = result.confirmed;
            skipFuture = result.skipFuture;
        }

        if (!confirmed) return;

        if (skipFuture) {
            this.settings.skipDeleteConfirm = true;
            this.saveSettings();
        }

        const focusedPane = this.getPane(this.focusedPaneId);
        if (focusedPane && focusedPane.noteId === noteId) {
            this.focusedPaneId = null;
        }
        this.panes = this.panes.filter(p => p.noteId !== noteId);
        if (!this.focusedPaneId && this.panes.length > 0) {
            this.focusedPaneId = this.panes[this.panes.length - 1].id;
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

    _showConfirmationModal(options) {
        return new Promise((resolve) => {
            const { 
                title = 'Confirm', 
                message = 'Are you sure?', 
                confirmText = 'OK', 
                cancelText = 'Cancel',
                confirmClass = 'primary',
                showSkipCheckbox = false
            } = options;

            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';

            let skipCheckboxHTML = '';
            if (showSkipCheckbox) {
                skipCheckboxHTML = `
                    <div class="confirm-modal-skip">
                        <label>
                            <input type="checkbox" id="confirmSkipCheckbox"> I understand, do not ask again.
                        </label>
                    </div>
                `;
            }
            
            overlay.innerHTML = `
                <div class="confirm-modal">
                    <div class="confirm-modal-header">${title}</div>
                    <div class="confirm-modal-body">
                        ${message}
                        ${skipCheckboxHTML}
                    </div>
                    <div class="confirm-modal-footer">
                        <button class="confirm-btn secondary" id="confirmCancelBtn">${cancelText}</button>
                        <button class="confirm-btn ${confirmClass}" id="confirmOkBtn">${confirmText}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);

            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const skipCheckbox = document.getElementById('confirmSkipCheckbox');

            const cleanup = () => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.remove();
            };

            const onOk = () => {
                cleanup();
                resolve({
                    confirmed: true,
                    skipFuture: skipCheckbox ? skipCheckbox.checked : false
                });
            };

            const onCancel = () => {
                cleanup();
                resolve({ confirmed: false, skipFuture: false });
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    renderAllPanes() {
        const container = document.getElementById('editorPanesContainer');
        if (this.panes.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>Welcome to PKM Notes</h3><p>Select a note or create a new one.</p></div>`;
            this.updateRightSidebar();
            return;
        }
        
        container.innerHTML = '';
        this.panes.forEach((pane) => {
            const note = this.notes[pane.noteId];
            if (!note) { 
                this.closePane(pane.id); 
                return; 
            }
            
            const paneEl = document.createElement('div');
            paneEl.className = 'editor-container';
            paneEl.dataset.paneId = pane.id;
            paneEl.id = pane.id;
            
            if (pane.id === this.focusedPaneId) {
                paneEl.classList.add('focused');
            }
            
            paneEl.innerHTML = this.getEditorHTML(note, pane);
            container.appendChild(paneEl);
            this.bindPaneEvents(paneEl, pane);
            this.updatePaneContent(paneEl, note);
            
            const savedWidth = this.paneWidths.get(pane.id) || 450;
            paneEl.style.width = `${savedWidth}px`;
            paneEl.style.flex = 'none';
        });
        
        if (!this.resizablePanes && this.panes.length > 0) {
            this.initResizablePanes();
        }
        
        if (this.resizablePanes) {
            this.resizablePanes.update();
            
            if (!this.resizablePanes.isMaximized()) {
                this.resizablePanes.applyStoredWidths(this.paneWidths);
            }
        }
        
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
                    <div class="codemirror-container"></div>
                </div>
                <div class="preview-pane"><div class="preview-content"></div></div>
            </div>
            <div class="status-bar"><span class="save-status">Saved</span></div>`;
    }

    bindPaneEvents(paneEl, pane) {
    const editorContainer = paneEl.querySelector('.codemirror-container');
    const note = this.notes[pane.noteId];
    const displayContent = this.convertToDisplayFormat(note.content);
    
    // Pass notes and callbacks to the editor for wikilink support
    const editor = new MarkdownEditor(
        editorContainer, 
        displayContent, 
        this.notes,
        (noteId) => this.openNote(noteId),           // openNoteCallback
        (noteTitle) => this.createNoteWithTitle(noteTitle),  // createNoteCallback
        this.createWikiLinkCompletion()
    );
    
   
    this.editorInstances.set(pane.id, editor);
    
    let originalTitle = this.notes[pane.noteId].title;
    
    paneEl.addEventListener('click', () => this.setFocusedPane(pane.id));
    paneEl.querySelector('.close-pane-btn').addEventListener('click', (e) => { 
        e.stopPropagation(); 
        this.closePane(pane.id); 
    });
    
    paneEl.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            
            // Update pane mode
            pane.mode = btn.dataset.mode; 
            
            // Update button states
            paneEl.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update content area classes
            const editorContent = paneEl.querySelector('.editor-content');
            editorContent.className = `editor-content ${pane.mode}-mode`;
            
            this.savePanes();
        });
    });
    
    // Single content change handler that does both save and preview
    let saveTimeout;
editor.setOnContentChange(() => {
    // For the live preview, we create a temporary, disposable note object.
    // This prevents us from modifying the main state on every keystroke.
    const previewNote = new Note(
        this.notes[pane.noteId].title, 
        editor.getContent() // Use the editor's current content directly
    );
    
    // We also need to copy the ID so that links in the preview work.
    previewNote.id = this.notes[pane.noteId].id;
    
    // Update the visual preview using our temporary note object.
    this.updatePaneContent(paneEl, previewNote);
    this.updateRightSidebar();
        
        // Debounced save
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            this.saveNoteFromPane(pane.id, originalTitle);
        }, 1500);
    });
    
    paneEl.addEventListener('focus', () => { 
        originalTitle = this.notes[pane.noteId].title; 
    }, true);
}
    
    saveNoteFromPane(paneId, originalTitle = null) {
        const pane = this.getPane(paneId);
        if (!pane) return;
        
        const editor = this.editorInstances.get(paneId);
        const paneEl = document.querySelector(`.editor-container[data-pane-id="${paneId}"]`);
        if (!editor || !paneEl) return;
        
        const note = this.notes[pane.noteId];
        const displayContent = editor.getContent();
        
        // Convert display format back to internal format before saving
        const internalContent = this.convertToInternalFormat(displayContent);
        
        const oldTitle = originalTitle || note.title;
        note.update(internalContent, true);
        
        if (oldTitle !== note.title) {
            // Handle rename - this will update links in other notes
            this.handleNoteRename(note, oldTitle);
            this.renderNoteList();
            this.renderAllPanes(); // This will refresh all editors with updated display format
        } else {
            // Update just this pane's title
            paneEl.querySelector('.editor-title').textContent = note.title;
            paneEl.querySelector('.save-status').textContent = `Saved`;
        }
        
        this.saveNotes();
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.renderNoteList();
        this.updateRightSidebar();
    }

    updatePaneContent(paneEl, note) {
        this.updatePanePreview(paneEl, note);
    }

    updatePanePreview(paneEl, note) {
        const previewContentEl = paneEl.querySelector('.preview-content');
        if (!previewContentEl) return;

        let content = note.getContentWithoutMetadata();

        content = content.replace(/!\[\[([^#\]|]+)(\|([^\]]+))?#\^([^\]]+)\]\]/g, (match, noteTitle, pipe, displayText, blockId) => {
            const targetNote = Object.values(this.notes).find(n => n.title.toLowerCase() === noteTitle.trim().toLowerCase());
            if (targetNote) {
                const blockContent = targetNote.getBlockContent(blockId.trim());
                if (blockContent) {
                    const embedTitle = displayText || noteTitle;
                    const renderedBlock = this.md.render(blockContent);
                    return `<div class="embedded-block">${renderedBlock}<div class="embedded-block-source">From: <span class="wikilink" data-link="${targetNote.id}">${embedTitle}</span></div></div>`;
                }
                return `<div class="broken-embed">Block <code>^${blockId}</code> not found in "${noteTitle}"</div>`;
            }
            return `<div class="broken-embed">Note "${noteTitle}" not found</div>`;
        });

        const codeBlockRegex = /(```python\n[\s\S]*?\n```)/g;
        const parts = content.split(codeBlockRegex);

        let codeBlockIndex = 0;

        const titleToIdMap = Object.values(this.notes).reduce((acc, note) => {
            acc[note.title.toLowerCase()] = note.id;
            return acc;
        }, {});

        const finalHtmlParts = parts.map((part) => {
            if (part.startsWith('```python')) {
                const code = part.replace(/^```python\n/, '').replace(/\n```$/, '');
                const uniqueId = `code-${note.id}-${codeBlockIndex}`;
                const escapedCode = this.escapeHtml(code);
                const noteOutputs = this.codeBlockOutputs.get(note.id) || new Map();
                const storedOutput = noteOutputs.get(codeBlockIndex) || '';
                
                const html = `<div class="code-container" id="${uniqueId}">
                        <div class="code-header">
                            <span>PYTHON</span>
                            <button class="run-btn">▶ Run</button>
                        </div>
                        <pre><code class="language-python">${escapedCode}</code></pre>
                        <div class="code-output">${storedOutput}</div>
                    </div>`;
                codeBlockIndex++;
                return html;
            } else {
                return this.md.render(part, { notes: this.notes });
            }
        });

        const dirtyHtml = finalHtmlParts.join('');

        if (!window.DOMPurify) {
            console.error("DOMPurify has not loaded. Cannot sanitize HTML.");
            previewContentEl.textContent = 'Error: Preview renderer not loaded yet, is not available.';
            return;
        }

        const cleanHtml = window.DOMPurify.sanitize(dirtyHtml, {
            ADD_CLASSES: ['wikilink', 'broken', 'embedded-block', 'embedded-block-source', 'code-container', 'code-header', 'run-btn', 'code-output', 'language-python', 'output-error', 'spinner', 'hljs']
        });
        
        previewContentEl.innerHTML = cleanHtml;
        
        this.bindPreviewEvents(paneEl, note);
    }
    
    async handleNoteRename(renamedNote, oldTitle) {
        const linkId = renamedNote.id;
        const newTitle = renamedNote.title;

        const notesWithLinks = Object.values(this.notes).filter(note =>
            note.id !== linkId && note.content.includes(`[[${linkId}|`)
        );

        if (notesWithLinks.length > 0) {
            const result = await this._showConfirmationModal({
                title: 'Update Link Display Text?',
                message: `You renamed "${oldTitle}" to "${newTitle}". <br><br>Update the display text for ${notesWithLinks.length} link(s) in other notes where it matches the old title?`,
                confirmText: 'Update Links',
                cancelText: 'Leave Them'
            });

            if (result.confirmed) {
                const wikilinkRegex = new RegExp(`\\[\\[(${linkId})\\|([^\\]]+)\\]\\]`, 'g');
                notesWithLinks.forEach(note => {
                    const newContent = note.content.replace(wikilinkRegex, (match, id, displayText) => {
                        if (displayText.trim().toLowerCase() === oldTitle.trim().toLowerCase()) {
                            return `[[${id}|${newTitle}]]`;
                        }
                        return match;
                    });
                    if (newContent !== note.content) {
                        note.update(newContent, true);
                    }
                });
            }
        }

        const notesWithEmbeds = [];
        const embedSearchRegex = new RegExp(`!\\[\\[${this.escapeRegExp(oldTitle)}#\\^`, 'i');

        for (const note of Object.values(this.notes)) {
            if (note.id !== linkId && embedSearchRegex.test(note.content)) {
                notesWithEmbeds.push(note);
            }
        }

        if (notesWithEmbeds.length > 0) {
            const embedUpdateRegex = new RegExp(`(!\\[\\[)(${this.escapeRegExp(oldTitle)})(#\\^.*?\\]\\])`, 'gi');

            notesWithEmbeds.forEach(note => {
                const newEmbedContent = note.content.replace(embedUpdateRegex, `$1${newTitle}$3`);
                note.update(newEmbedContent, true);
            });
        }

        this.saveNotes();
        this.renderAllPanes(); 
        this.updateRightSidebar();
    }

    base64ToBlob(base64, contentType = 'image/png', sliceSize = 512) {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType });
    }

    async copyTextToClipboard(text, buttonElement) {
        try {
            await navigator.clipboard.writeText(text);
            if (buttonElement) {
                buttonElement.textContent = 'Copied!';
            }
        } catch (err) {
            console.warn('Async clipboard API failed, falling back to execCommand.', err);
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.top = '0';
            textArea.style.left = '0';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (buttonElement) {
                    buttonElement.textContent = successful ? 'Copied!' : 'Error';
                }
            } catch (err) {
                console.error('Fallback copy command failed.', err);
                if (buttonElement) {
                    buttonElement.textContent = 'Error';
                }
            }
            document.body.removeChild(textArea);
        } finally {
            if (buttonElement) {
                setTimeout(() => {
                    if (buttonElement.classList.contains('copy-output-btn')) {
                         buttonElement.textContent = 'Copy Text';
                    } else if (buttonElement.classList.contains('copy-plot-btn')) {
                         buttonElement.textContent = 'Copy Image';
                    }
                }, 2000);
            }
        }
    }

    bindPreviewEvents(paneEl, note) {
        let codeBlockIndex = 0;
        paneEl.querySelectorAll('.run-btn').forEach(button => {
            const currentBlockIndex = codeBlockIndex++;
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', async (e) => {
                const container = e.target.closest('.code-container');
                const codeElement = container.querySelector('code.language-python');
                const outputEl = container.querySelector('.code-output');
                
                if (!codeElement) {
                    outputEl.innerHTML = '<pre class="output-error">No Python code found</pre>';
                    return;
                }

                const code = codeElement.textContent;
                
                outputEl.innerHTML = '<div class="spinner">⏳ Executing Python code...</div>';
                newButton.disabled = true;
                newButton.textContent = '⏳ Running...';

                try {
                    const execResult = await this.pyodideManager.executeCode(code, note.id, currentBlockIndex);
                    
                    const formattedOutput = this.pyodideManager.formatOutput(execResult.result, execResult.stdout, execResult.executionNumber, execResult.plots);
                    outputEl.innerHTML = formattedOutput.html;

                    const noteOutputs = this.codeBlockOutputs.get(note.id) || new Map();
                    noteOutputs.set(currentBlockIndex, formattedOutput.html);
                    this.codeBlockOutputs.set(note.id, noteOutputs);

                    outputEl.addEventListener('click', async (event) => {
                        const target = event.target;

                        if (target.matches('.copy-output-btn')) {
                            if (formattedOutput.rawText) {
                                this.copyTextToClipboard(formattedOutput.rawText, target);
                            } else {
                                target.textContent = 'No Text';
                                setTimeout(() => { target.textContent = 'Copy Text'; }, 2000);
                            }
                        }

                        if (target.matches('.copy-plot-btn')) {
                            const base64 = target.dataset.plotBase64;
                            try {
                                const blob = this.base64ToBlob(base64);
                                await navigator.clipboard.write([
                                    new ClipboardItem({ 'image/png': blob })
                                ]);
                                target.textContent = 'Copied!';
                                setTimeout(() => { target.textContent = 'Copy Image'; }, 2000);
                            } catch (err) {
                                console.error('Failed to copy image to clipboard:', err);
                                target.textContent = 'Error!';
                                setTimeout(() => { target.textContent = 'Copy Image'; }, 2000);
                            }
                        }

                        if (target.matches('.download-plot-btn')) {
                            const base64 = target.dataset.plotBase64;
                            const filename = target.dataset.filename;
                            const blob = this.base64ToBlob(base64);
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            
                            a.href = url;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    });

                } catch (error) {
                    console.error('Python execution error:', error);
                    let errorMessage = error.message || error.toString();
                    if (errorMessage.includes('NetworkError') || errorMessage.includes('fetch')) {
                        errorMessage = 'Network error: Could not fetch data. Check the URL and your connection.';
                    } else if (errorMessage.includes('SyntaxError')) {
                        errorMessage = `Python syntax error: ${errorMessage}`;
                    } else if (errorMessage.includes('NameError')) {
                        errorMessage = `Variable not found: ${errorMessage}`;
                    }
                    outputEl.innerHTML = `<pre class="output-error">${this.escapeHtml(errorMessage)}</pre>`;
                    const noteOutputs = this.codeBlockOutputs.get(note.id) || new Map();
                    noteOutputs.set(currentBlockIndex, outputEl.innerHTML);
                    this.codeBlockOutputs.set(note.id, noteOutputs);                  
                } finally {
                    newButton.disabled = false;
                    newButton.textContent = '▶ Run';
                }
            });
        });

        paneEl.querySelectorAll('.wikilink').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = link.dataset.link;
                
                if (this.notes[noteId]) {
                    this.openNote(noteId);
                } else {
                    console.warn(`Clicked a broken link to a non-existent note ID: ${noteId}`);
                }
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateRightSidebar() {
        const rightSidebar = document.getElementById('rightSidebar');
        const container = rightSidebar.querySelector('.right-sidebar-content');
        const focusedPane = this.getPane(this.focusedPaneId);

        if (!focusedPane || !this.notes[focusedPane.noteId]) {
            container.innerHTML = `<div class="empty-sidebar"><p>No note selected.</p></div>`;
            return;
        }

        const note = this.notes[focusedPane.noteId];
        const content = note.getContentWithoutMetadata();
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
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

        const graphContainerEl = container.querySelector('#graphContainer');
        this.graphManager.createGraph(graphContainerEl, note.id, 1);

        const exportBtn = container.querySelector('#exportGraphBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.exportNetworkData(note.id);
            });
        }

        container.querySelectorAll('.backlink-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openNote(item.dataset.noteId);
            });
        });
    }

    exportNetworkData(noteId) {
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
        
        exportMenu.querySelector('[data-action="export-complete"]').addEventListener('click', () => {
            this.performNetworkExport(noteId, true);
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="export-ego"]').addEventListener('click', () => {
            this.performNetworkExport(noteId, false);
            exportMenu.remove();
        });
        
        exportMenu.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            exportMenu.remove();
        });
        
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

        let fileCount = 3;
        if (networkData.isolatedCSV && completeNetwork) {
            fileCount = 4;
        }

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

        if (networkData.isolatedCSV && completeNetwork) {
            setTimeout(() => {
                this.graphManager.downloadCSV(
                    networkData.isolatedCSV, 
                    `${safeTitle}_isolated_notes_${timestamp}.csv`
                );
            }, 300);
        }

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

    setSortOrder(order) {
        this.sortOrder = order;
        storage.set('pkm_sort_order', this.sortOrder);
        this.renderNoteList();
    }

    renderNoteList() {
        const noteList = document.getElementById('noteList');
        const notesArray = Object.values(this.notes);
        let sortedNotes;

        switch (this.sortOrder) {
            case 'alphabetical':
                sortedNotes = notesArray.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'modified-asc':
                sortedNotes = notesArray.sort((a, b) => a.modified - b.modified);
                break;
            case 'modified-desc':
            default:
                sortedNotes = notesArray.sort((a, b) => b.modified - a.modified);
                break;
        }

        const folderStructure = { _notes: [], _children: {} };

        sortedNotes.forEach(note => {
            const path = note.folder || 'root';
            
            if (!path || path === "root") { 
                folderStructure._notes.push(note);
                return;
            }

            let currentLevel = folderStructure._children;
            const pathParts = path.split('/').filter(part => part.length > 0);
            
            pathParts.forEach((part, index) => {
                if (!currentLevel[part]) {
                    currentLevel[part] = { _notes: [], _children: {} };
                }
                if (index === pathParts.length - 1) {
                    currentLevel[part]._notes.push(note);
                } else {
                    currentLevel = currentLevel[part]._children;
                }
            });
        });

        const createNoteHTML = note => `
            <div class="note-item" data-note-id="${note.id}">
                <div class="note-title">${note.title}</div>
                <div class="note-preview">${note.getPreview()}</div>
            </div>`;
        
        const getRecursiveNoteCount = (folder) => {
            let count = folder._notes.length;
            for (const childKey in folder._children) {
                count += getRecursiveNoteCount(folder._children[childKey]);
            }
            return count;
        };

        const createFolderHTML = (name, folder) => {
            const totalNotesInFolder = getRecursiveNoteCount(folder);
            
            if (totalNotesInFolder === 0) {
                return '';
            }

            let contentsHTML = folder._notes.map(createNoteHTML).join('');
            const sortedChildrenKeys = Object.keys(folder._children).sort();

            for (const childName of sortedChildrenKeys) {
                contentsHTML += createFolderHTML(childName, folder._children[childName]);
            }

            return `
                <div class="folder-item">
                    <div class="folder-header">
                        <span class="folder-arrow">▶</span>
                        <span class="folder-name">${name}</span>
                        <span class="folder-count">${totalNotesInFolder}</span>
                    </div>
                    <div class="folder-contents" style="display: none;">${contentsHTML}</div>
                </div>`;
        };

        let finalHTML = '';
        
        if (folderStructure._notes.length > 0) {
            finalHTML += folderStructure._notes.map(createNoteHTML).join('');
        }
        
        const sortedFolderKeys = Object.keys(folderStructure._children).sort();
        for (const folderName of sortedFolderKeys) {
            const folderHTML = createFolderHTML(folderName, folderStructure._children[folderName]);
            finalHTML += folderHTML;
        }
        
        noteList.innerHTML = finalHTML;

        noteList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => this.openNote(item.dataset.noteId));
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, { type: 'note', noteId: item.dataset.noteId });
            });
        });

        noteList.querySelectorAll('.folder-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const arrow = header.querySelector('.folder-arrow');
                const contents = header.nextElementSibling;
                
                if (contents && contents.classList.contains('folder-contents')) {
                    const isOpen = contents.style.display === 'block';
                    contents.style.display = isOpen ? 'none' : 'block';
                    arrow.textContent = isOpen ? '▶' : '▼';
                }
            });
        });

        requestAnimationFrame(() => this.updateActiveNoteInSidebar());
    }

    updateActiveNoteInSidebar() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.querySelectorAll('.note-item.active').forEach(activeItem => {
                    activeItem.classList.remove('active');
                });
            
                const focusedPane = this.getPane(this.focusedPaneId);
                if (focusedPane) {
                    const newActiveItem = document.querySelector(`.note-item[data-note-id="${focusedPane.noteId}"]`);
                    if (newActiveItem) {
                        newActiveItem.classList.add('active');
                    }
                }
            });
        });
    }

    showContextMenu(event, context = {}) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';

        let menuItems = '';
        const check = (order) => this.sortOrder === order ? '✔ ' : '';

        switch (context.type) {
            case 'note':
                const noteId = context.noteId;
                const pane = this.panes.find(p => p.noteId === noteId);
                const isMaximized = this.resizablePanes && this.resizablePanes.getMaximizedPane() === pane?.id;

                menuItems = `
                    <button class="context-menu-item" data-action="open-pane" data-note-id="${noteId}">✨ Open in New Pane</button>
                    ${pane ? `<button class="context-menu-item" data-action="toggle-maximize" data-pane-id="${pane.id}">${isMaximized ? '🗗 Minimize Pane' : '🗖 Maximize Pane'}</button>` : ''}
                    <div class="context-menu-separator"></div>
                    <button class="context-menu-item" data-action="delete" data-note-id="${noteId}">🗑️ Delete Note</button>
                    <div class="context-menu-separator"></div>
                    <button class="context-menu-item" data-action="new-note">📝 New Note</button>
                `;
                break;

            case 'header':
            case 'sidebar':
            default:
                menuItems = `
                    <div class="context-menu-title">Sort Notes By</div>
                    <button class="context-menu-item" data-sort="alphabetical">${check('alphabetical')}Alphabetical (A-Z)</button>
                    <button class="context-menu-item" data-sort="modified-desc">${check('modified-desc')}Most Recent</button>
                    <button class="context-menu-item" data-sort="modified-asc">${check('modified-asc')}Oldest First</button>
                    <div class="context-menu-separator"></div>
                    <button class="context-menu-item" data-action="new-note">📝 New Note</button>
                `;
                break;
        }

        menu.innerHTML = menuItems;
        document.body.appendChild(menu);
        menu.style.top = `${event.clientY}px`;
        menu.style.left = `${event.clientX}px`;

        menu.addEventListener('click', (e) => {
            const target = e.target.closest('button.context-menu-item');
            if (!target) return;

            const action = target.dataset.action;
            const sortOrder = target.dataset.sort;
            const noteId = target.dataset.noteId;
            const paneId = target.dataset.paneId;

            if (sortOrder) {
                this.setSortOrder(sortOrder);
            }

            switch (action) {
                case 'new-note':
                    this.createNote();
                    break;
                case 'open-pane':
                    this.openNoteInNewPane(noteId);
                    break;
                case 'toggle-maximize':
                    if (paneId && this.resizablePanes) this.resizablePanes.toggleMaximize(paneId);
                    break;
                case 'delete':
                    this.deleteNote(noteId, e);
                    break;
            }

            this.hideContextMenu();
        });
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.remove();
    }

    searchNotes(query) {
        const noteList = document.getElementById('noteList');
        const items = noteList.querySelectorAll('.note-item');
        
        if (!query.trim()) {
            items.forEach(item => item.style.display = 'block');
            return;
        }
        
        const searchTerm = query.toLowerCase();
        items.forEach(item => {
            const noteId = item.dataset.noteId;
            const note = this.notes[noteId];
            const titleMatch = note.title.toLowerCase().includes(searchTerm);
            const contentMatch = note.content.toLowerCase().includes(searchTerm);
            
            item.style.display = (titleMatch || contentMatch) ? 'block' : 'none';
        });
    }

    saveNotes() { 
        storage.set('pkm_notes', this.notes); 
    }
    
    saveSettings() { 
        storage.set('pkm_settings', this.settings); 
    }
    
    savePanes() {
        const panesWithState = this.panes.map(pane => ({
            ...pane,
            isMaximized: this.resizablePanes && this.resizablePanes.getMaximizedPane() === pane.id
        }));
        
        storage.set('pkm_panes', panesWithState);
        storage.set('pkm_focused_pane', this.focusedPaneId);
        storage.set('pkm_pane_widths', Array.from(this.paneWidths.entries()));
        
        if (this.resizablePanes) {
            storage.set('pkm_maximized_pane', this.resizablePanes.getMaximizedPane());
        }
    }

    importFiles() { 
        document.getElementById('fileInput').click(); 
    }

    exportNotes() {
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

        Object.values(this.notes).forEach((note, index) => {
            setTimeout(() => {
                const blob = new Blob([note.content], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                const filename = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                a.download = `${filename}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, index * 100);
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

    handleFileImport(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            if (file.type === 'text/markdown' || file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;
                    let title = file.name.replace(/\.(md|txt)$/i, '');
                    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                    if (yamlMatch) {
                        const yamlContent = yamlMatch[1];
                        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
                        if (titleMatch) {
                            title = titleMatch[1].replace(/^['"]|['"]$/g, '');
                        }
                    }
                    const note = new Note(title, content);
                    this.notes[note.id] = note;
                };
                reader.readAsText(file);
            } else {
                alert(`Unsupported file type: ${file.name}. Only .md and .txt files are supported.`);
            }
        });

        setTimeout(() => {
            this.backlinksManager.updateNotes(this.notes);
            this.graphManager.updateNotes(this.notes);
            this.saveNotes();
            this.renderNoteList();
            this.updateRightSidebar();
        }, 100);

        event.target.value = '';
    }

    createWikiLinkCompletion() {
    return (context) => {
        const before = context.matchBefore(/\[\[([^\]]*)$/);
        if (!before) return null;
        
        const query = before.text.slice(2).toLowerCase(); // Remove [[
        
        const options = Object.values(this.notes)
            .filter(note => note.title.toLowerCase().includes(query))
            .map(note => ({
                label: `[[${note.title}]]`,
                type: "text",
                apply: `[[${note.title}]]`
            }));
            
        // Add "Create new note" option
        if (query.length > 0) {
            options.push({
                label: `[[${query}]] (create new)`,
                type: "text", 
                apply: `[[${query}]]`
            });
        }
        
        return {
            from: before.from,
            options
        };
    };
}

    toggleTheme() { 
        this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light'; 
        this.saveSettings(); 
        this.setupTheme(); 
    }

    convertToDisplayFormat(content) {
    // Convert internal [[id|title]] format to display format
    return content.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (match, id, displayText) => {
        const note = this.notes[id];
        if (!note) {
            // Note doesn't exist, keep as is
            return match;
        }
        
        // Check if this was originally an alias (displayText different from note title)
        if (displayText !== note.title) {
            // This is an alias - convert back to [[title/alias]] format
            return `[[${note.title}/${displayText}]]`;
        } else {
            // This is a regular link - show as [[title]]
            return `[[${displayText}]]`;
        }
    });
}

    convertToInternalFormat(content) {
    const titleToIdMap = Object.values(this.notes).reduce((acc, note) => {
        acc[note.title.toLowerCase()] = note.id;
        return acc;
    }, {});

    return content.replace(/\[\[([^|\]\/]+)(?:\/([^\]]+))?\]\]/g, (match, firstPart, aliasPart) => {
        if (aliasPart) {
            // Format: [[target note/alias]]
            const noteTitle = firstPart.trim();
            const alias = aliasPart.trim();
            const noteId = titleToIdMap[noteTitle.toLowerCase()];
            
            if (noteId) {
                // Store as [[id|alias]] internally so the alias is preserved
                return `[[${noteId}|${alias}]]`;
            } else {
                // Keep the alias format for non-existent notes until they're created
                return match;
            }
        } else {
            // Format: [[title]] - handle normally
            const trimmedTitle = firstPart.trim();
            const noteId = titleToIdMap[trimmedTitle.toLowerCase()];
            
            if (noteId) {
                return `[[${noteId}|${trimmedTitle}]]`;
            }
            return match;
        }
    });
}

    showWelcomeModal() {
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
                    <li>You can change the **displayed** text of the wikilink by using [[Note Title/displayed text]]. To change this after, backspace into the link.
                </ul>
                
                <h4>Multi-Pane Interface</h4>
                <ul>
                    <li>Open multiple notes simultaneously in separate panes</li>
                    <li>Split view modes: Edit only, Preview only, or Split (edit and preview side-by-side)</li>
                    <li>Drag the handles between panes to resize them.</li>
                    <li>Double-click resize handles to auto-size panes equally.</li>
                    <li><strong>NEW:</strong> Click the 🗖 button to maximize any pane to full width</li>
                    <li><strong>NEW:</strong> Use Ctrl/Cmd + M to toggle maximize for the focused pane</li>
                    <li><strong>NOW WITH CODEMIRROR:</strong> Advanced text editing with syntax highlighting and search</li>
                </ul>
                
                <h4>Python Code Execution</h4>
                <ul>
                    <li>Write Python code in markdown blocks (<code>\`\`\`python</code>) and execute it directly in your notes.</li>
                    <li>Click the "▶ Run" button on a code block in the preview pane to run it.</li>
                    <li>Standard output (from <code>print()</code>) and the final result are displayed below the code.</li>
                      <li>Load external data (e.g., a CSV file) by adding a special directive to the top of a code block: <code>#data_url: *your_url_here*</code>. The raw text content from the URL will be automatically loaded into a variable named <code>fetched_data</code> for you to use in your script, eg <code>df = pd.read_csv(StringIO(fetched_data))</code>.</li>
    <li><b>NB:</b> The first time you run Python code, it may take a few seconds to initialize the environment, during which the app might seem frozen.</li>
                </ul>

                
                <h4>Import and Export</h4>
                <ul>
                    <li>Import markdown (.md) and text (.txt) files</li>
                    <li>Export options: JSON, individual markdown files, or a single combined file.</li>
                </ul>
                
                <h4>Wikilink Connection Graph Export</h4>
                <ul>
                    <li>Export as nodes and edges CSV describing the interconnections in your notes</li>
                    <li>Reveals topic clusters and important conceptual bridges in your knowledge base.</li>
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

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PKMApp();
}); 