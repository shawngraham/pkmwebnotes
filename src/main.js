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
        this.sortOrder = storage.get('pkm_sort_order', 'alphabetical');

        // --- State for Tabbed Interface ---
        this.openTabs = storage.get('pkm_open_tabs', []);
        this.activeTabIndex = storage.get('pkm_active_tab_index', -1);
        this.editorMode = storage.get('pkm_editor_mode', 'split'); // For Edit/Split/Preview

        this.history = [];
        this.historyIndex = -1;
        this.isNavigating = false;

        this.backlinksManager = new BacklinksManager(this.notes);
        this.graphManager = new GraphManager(this.notes);
        
        this.pyodideManager = new PyodideManager();
        this.codeBlockOutputs = new Map();
        
        // --- A single editor instance for the tabbed view ---
        this.editor = null;       
        
        this.graphManager.onNodeClick = (noteId) => this.openNote(noteId);
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
    // Enhanced regex to handle decorators with double pipe
    const wikilinkRegex = /^\[\[([^|\]\/]+)(?:\|([^\]|]+)(?:\|([^\]]+))?|\/([^\]|]+)(?:\|([^\]]+))?)?\]\]/;
    function wikilinkTokenizer(state, silent) {
        
        const match = wikilinkRegex.exec(state.src.slice(state.pos));
        if (!match) { return false; }

        const fullMatch = match[0];
        const firstPart = match[1].trim();
        const secondPart = match[2] ? match[2].trim() : null;
        const thirdPart = match[3] ? match[3].trim() : null;
        const fourthPart = match[4] ? match[4].trim() : null; // alias part
        const fifthPart = match[5] ? match[5].trim() : null;  // decorator for alias
        
        let id, text, noteTitle, decorator = null;
        
        if (secondPart && !fourthPart) {
            // Format: [[note.id|title]] or [[note.id|title|decorator]]
            id = firstPart;
            text = secondPart;
            noteTitle = secondPart;
            decorator = thirdPart;
        } else if (fourthPart) {
            // Format: [[target note/alias]] or [[target note/alias|decorator]]
            noteTitle = firstPart;
            text = fourthPart;
            decorator = fifthPart;
            const notes = state.env.notes || {};
            const note = Object.values(notes).find(n => 
                n.title.toLowerCase() === noteTitle.toLowerCase()
            );
            id = note ? note.id : null;
        } else {
            // Format: [[title]] - simple format
            id = firstPart;
            text = firstPart;
            noteTitle = firstPart;
        }

        if (!silent) {
            const token = state.push('wikilink_open', 'a', 1);
            const classes = ['wikilink'];
            if (decorator) {
                classes.push(`wikilink-${decorator}`);
            }
            
            token.attrs = [
                ['class', classes.join(' ')], 
                ['data-link', id || noteTitle], 
                ['title', `Link to: ${text}${decorator ? ` [${decorator}]` : ''}`]
            ];
            if (decorator) {
                token.attrs.push(['data-decorator', decorator]);
            }
            
            const textToken = state.push('text', '', 0);
            textToken.content = text;
            
            state.push('wikilink_close', 'a', -1);
        }
        state.pos += fullMatch.length;
        return true;
    }

    md.inline.ruler.before('link', 'wikilink', wikilinkTokenizer);

    md.renderer.rules.wikilink_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const linkRef = token.attrGet('data-link');
        const decorator = token.attrGet('data-decorator');

        token.attrSet('href', '#');
        
        const notes = env.notes || {};
        const exists = notes[linkRef] || Object.values(notes).find(n => 
            n.title.toLowerCase() === linkRef.toLowerCase()
        );
        
        if (!exists) {
            token.attrJoin('class', 'broken');
        } else {
            const title = exists.title;
            const decoratorText = decorator ? ` [${decorator}]` : '';
            token.attrSet('title', `Link to: ${title}${decoratorText}`);
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
        this.loadInitialEditorState();
        this.updateRightSidebar();
 
        new RightSidebar('toggle-right-sidebar', '.main');
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
            const manifestResponse = await fetch('content/manifest.json');
            if (!manifestResponse.ok) {
                throw new Error(`Failed to fetch manifest.json: ${manifestResponse.statusText}`);
            }
            const manifest = await manifestResponse.json();

            const processEntries = (entries, currentPath = '') => {
                let files = [];
                for (const key in entries) {
                    const value = entries[key];
                    if (Array.isArray(value)) { 
                        value.forEach(filename => {
                            let filePath, folder;
                            if (key === 'root') {
                                filePath = filename;
                                folder = 'root';
                            } else {
                                filePath = currentPath ? `${currentPath}${key}/${filename}` : `${key}/${filename}`;
                                folder = currentPath ? `${currentPath}${key}` : key;
                            }
                            files.push({ filePath, folder });
                        });
                    } else if (typeof value === 'object' && value !== null) { 
                        const newPath = currentPath ? `${currentPath}${key}/` : `${key}/`;
                        files = files.concat(processEntries(value, newPath));
                    }
                }
                return files;
            };

            const noteFiles = processEntries(manifest.defaultNotes);
            if (!noteFiles || noteFiles.length === 0) {
                return {};
            }

            const fetchPromises = noteFiles.map(fileInfo =>
                fetch(`content/${fileInfo.filePath}`)
                    .then(response => {
                        if (!response.ok) {
                            return { content: `# Error: ${response.statusText}`, fileInfo, error: true };
                        }
                        return response.text().then(content => ({ content, fileInfo, error: false }));
                    })
                    .catch(error => ({ content: `# Network Error: ${error.message}`, fileInfo, error: true }))
            );

            const noteResults = await Promise.all(fetchPromises);

            noteResults.forEach(result => {
                const { content, fileInfo, error } = result;
                let title = fileInfo.filePath.split('/').pop().replace(/\.(md|txt)$/i, '');
                
                if (!error) {
                    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                    if (yamlMatch) {
                        const titleMatch = yamlMatch[1].match(/^title:\s*(.+)$/m);
                        if (titleMatch) title = titleMatch[1].replace(/^['"]|['"]$/g, '').trim();
                    }
                }
                
                const note = new Note(title, content);
                note.folder = fileInfo.folder;
                notes[note.id] = note;
            });
        } catch (error) {
            console.error("Error creating default notes:", error);
            const errorNote = new Note("Error Loading Notes", `Error: ${error.message}`);
            errorNote.folder = 'root';
            notes[errorNote.id] = errorNote;
        }
        return notes;
    }

    setupTheme() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
    }

    updateHistoryButtons() {
        const backBtn = document.getElementById('backBtn');
        const forwardBtn = document.getElementById('forwardBtn');
        if (!backBtn || !forwardBtn) return;
        backBtn.disabled = this.historyIndex <= 0;
        forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    addHistoryEntry(noteId) {
        if (this.isNavigating) return;

        const lastEntry = this.history[this.historyIndex];
        if (lastEntry && lastEntry.noteId === noteId) return;
        
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push({ noteId });
        this.historyIndex = this.history.length - 1;
        this.updateHistoryButtons();
    }

    navigateBack() {
        if (this.historyIndex > 0) {
            this.isNavigating = true;
            this.historyIndex--;
            const entry = this.history[this.historyIndex];
            this.openNote(entry.noteId, false);
            this.isNavigating = false;
            this.updateHistoryButtons();
        }
    }

    navigateForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.isNavigating = true;
            this.historyIndex++;
            const entry = this.history[this.historyIndex];
            this.openNote(entry.noteId, false);
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
        
        // NOTE: Obsolete keyboard shortcuts related to panes have been removed.
    }

    loadInitialEditorState() {
        if (this.openTabs.length > 0 && this.activeTabIndex > -1) {
            this.renderEditor();
        } else if (Object.keys(this.notes).length > 0) {
            const sortedNotes = Object.values(this.notes).sort((a, b) => b.modified - a.modified);
            if(sortedNotes[0]) this.openNote(sortedNotes[0].id);
        } else {
            const container = document.getElementById('editorPanesContainer');
            container.innerHTML = `<div class="empty-state"><h3>Welcome</h3><p>Select a note or create a new one.</p></div>`;
        }
    }

    openNote(noteId, addToHistory = true) {
        const existingTabIndex = this.openTabs.findIndex(tabNoteId => tabNoteId === noteId);

        if (existingTabIndex > -1) {
            this.activeTabIndex = existingTabIndex;
        } else {
            this.openTabs.push(noteId);
            this.activeTabIndex = this.openTabs.length - 1;
        }
        
        if (addToHistory) {
           this.addHistoryEntry(noteId);
        }

        this.renderEditor();
        this.updateActiveNoteInSidebar();
        this.updateRightSidebar();
        this.saveTabsState();
    }

    closeTab(indexToClose) {
        this.openTabs.splice(indexToClose, 1);

        if (this.activeTabIndex >= indexToClose && this.activeTabIndex > 0) {
            this.activeTabIndex--;
        } else if (this.openTabs.length === 0) {
            this.activeTabIndex = -1;
        } else if (this.activeTabIndex >= this.openTabs.length) {
            this.activeTabIndex = this.openTabs.length - 1;
        }

        this.renderEditor();
        this.updateActiveNoteInSidebar();
        this.updateRightSidebar();
        this.saveTabsState();
    }
    
    createNote() {
        const note = new Note();
        this.notes[note.id] = note;
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.openNote(note.id);
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
        this.openNote(note.id);
    }

    saveTabsState() {
        storage.set('pkm_open_tabs', this.openTabs);
        storage.set('pkm_active_tab_index', this.activeTabIndex);
    }

    async deleteNote(noteId, event = {}) {
        let confirmed = true;
        let skipFuture = false;

        if (!this.settings.skipDeleteConfirm || (event && event.shiftKey)) {
            const title = this.notes[noteId]?.title || 'this note';
            const result = await this._showConfirmationModal({
                title: 'Delete Note?',
                message: `Permanently delete "${title}"? This cannot be undone.`,
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

        // Close any open tab for this note
        const tabIndex = this.openTabs.findIndex(id => id === noteId);
        if (tabIndex > -1) {
            this.closeTab(tabIndex);
        }

        delete this.notes[noteId];
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.updateRightSidebar();
    }

    /**
     * Moves a specific note to a new folder by updating its 'folder' property.
     * @param {string} noteId - The ID of the note to move.
     */
    moveNote(noteId) {
    const note = this.notes[noteId];
    if (!note) return;

    const currentFolder = note.folder || 'root';
    const newFolder = prompt(`Move "${note.title}" to which folder?`, currentFolder);

    // Exit if the user cancelled or didn't change the folder
    if (newFolder === null || newFolder.trim() === currentFolder) {
        return;
    }

    // Update the folder property, using 'root' for empty input
    note.folder = newFolder.trim() || 'root';
    
    // Manually update the modified timestamp to the current time
    note.modified = Date.now(); 
    
    this.saveNotes();
    this.renderNoteList();
}

    /**
     * "Creates" a new folder by creating a new note within that folder path.
     */
    createFolder() {
        const folderName = prompt("Enter new folder name (e.g., 'Projects/Web'):");
        if (!folderName || folderName.trim().length === 0) {
            return;
        }
        
        // Create a new, untitled note
        const note = new Note(`Untitled`);
        // Assign it to the new folder path
        note.folder = folderName.trim();
        this.notes[note.id] = note;

        // Update all app components
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.renderNoteList();
        this.openNote(note.id); // Open the new note for immediate editing
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

            let skipCheckboxHTML = showSkipCheckbox ? `
                <div class="confirm-modal-skip">
                    <label><input type="checkbox" id="confirmSkipCheckbox"> Don't ask again</label>
                </div>` : '';
            
            overlay.innerHTML = `
                <div class="confirm-modal">
                    <div class="confirm-modal-header">${title}</div>
                    <div class="confirm-modal-body">${message}${skipCheckboxHTML}</div>
                    <div class="confirm-modal-footer">
                        <button class="confirm-btn secondary" id="confirmCancelBtn">${cancelText}</button>
                        <button class="confirm-btn ${confirmClass}" id="confirmOkBtn">${confirmText}</button>
                    </div>
                </div>`;
            
            document.body.appendChild(overlay);

            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const skipCheckbox = document.getElementById('confirmSkipCheckbox');

            const cleanup = () => overlay.remove();

            const onOk = () => {
                cleanup();
                resolve({ confirmed: true, skipFuture: skipCheckbox ? skipCheckbox.checked : false });
            };

            const onCancel = () => {
                cleanup();
                resolve({ confirmed: false, skipFuture: false });
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    renderEditor() {
        const container = document.getElementById('editorPanesContainer');
        
        if (this.activeTabIndex === -1 || this.openTabs.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>Welcome</h3><p>Select a note or create one.</p></div>`;
            if (this.editor) {
                this.editor.destroy();
                this.editor = null;
            }
            return;
        }

        const activeNoteId = this.openTabs[this.activeTabIndex];
        const note = this.notes[activeNoteId];
        if (!note) {
            this.closeTab(this.activeTabIndex);
            return;
        }

        const tabsHTML = this.openTabs.map((noteId, index) => {
            const tabNote = this.notes[noteId];
            if (!tabNote) return ''; // Skip rendering if note was deleted
            return `<div class="editor-tab ${index === this.activeTabIndex ? 'active' : ''}" data-index="${index}">
                        <span>${tabNote.title}</span>
                        <button class="tab-close-btn" data-index="${index}">×</button>
                    </div>`;
        }).join('');

        if (!this.editor) {
            container.innerHTML = `
                <div class="editor-container">
                    <div class="editor-tabs">${tabsHTML}</div>
                    ${this.getEditorHTML(note)}
                </div>`;
            
            const editorContainerEl = container.querySelector('.codemirror-container');
            this.editor = new MarkdownEditor(
                editorContainerEl,
                this.convertToDisplayFormat(note.content),
                this.notes,
                (noteId) => this.openNote(noteId),
                (noteTitle) => this.createNoteWithTitle(noteTitle),
                this.createWikiLinkCompletion()
            );

            this.editor.setOnContentChange(debounce(() => {
                const currentNote = this.notes[this.openTabs[this.activeTabIndex]];
                if (currentNote) {
                    this.saveActiveNote();
                    this.updatePanePreview(container.querySelector('.editor-container'), currentNote);
                }
            }, 500));
            this.bindEditorEvents(); 
        } else {
            container.querySelector('.editor-tabs').innerHTML = tabsHTML;
            this.editor.setContent(this.convertToDisplayFormat(note.content));
        }
        
        this.updateEditorHeaderAndPreview(note);
        this.bindTabEvents();
    }

    saveActiveNote() {
        if (!this.editor || this.activeTabIndex === -1) return;
        
        const activeNoteId = this.openTabs[this.activeTabIndex];
        const note = this.notes[activeNoteId];
        if (!note) return;

        const internalContent = this.convertToInternalFormat(this.editor.getContent());
        
        if (note.content !== internalContent) {
            const oldTitle = note.title;
            note.update(internalContent, true);
            
            if (oldTitle !== note.title) {
                this.handleNoteRename(note, oldTitle);
                this.renderNoteList();
                this.renderEditor(); // Re-render tabs with new title
            } else {
                 this.saveNotes();
                 this.backlinksManager.updateNotes(this.notes);
                 this.graphManager.updateNotes(this.notes);
                 this.updateRightSidebar();
            }
        }
    }

    bindTabEvents() {
        const container = document.getElementById('editorPanesContainer');
        container.querySelectorAll('.editor-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-close-btn')) return;
                const newIndex = parseInt(tab.dataset.index, 10);
                if (this.activeTabIndex !== newIndex) {
                    this.saveActiveNote();
                    this.activeTabIndex = newIndex;
                    this.renderEditor();
                    this.updateActiveNoteInSidebar();
                    this.updateRightSidebar();
                    this.saveTabsState();
                }
            });
        });

        container.querySelectorAll('.tab-close-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const indexToClose = parseInt(button.dataset.index, 10);
                this.closeTab(indexToClose);
            });
        });
    }

    updateEditorHeaderAndPreview(note) {
        const container = document.getElementById('editorPanesContainer');
        const editorEl = container.querySelector('.editor-container');
        if (!editorEl) return;
        
        editorEl.querySelector('.editor-title').textContent = note.title;
        this.updatePanePreview(editorEl, note);
    }

    getEditorHTML(note) {
       const editorMode = this.editorMode; 
       return `
            <div class="editor-header">
                <div class="editor-title-wrapper">
                    <div class="editor-title" title="${note.title}">${note.title}</div>
                </div>
                <div class="editor-modes">
                    <button class="mode-btn ${editorMode === 'edit' ? 'active' : ''}" data-mode="edit">Edit</button>
                    <button class="mode-btn ${editorMode === 'split' ? 'active' : ''}" data-mode="split">Split</button>
                    <button class="mode-btn ${editorMode === 'preview' ? 'active' : ''}" data-mode="preview">Preview</button>
                </div>
            </div>
            <div class="editor-content ${editorMode}-mode">
                <div class="editor-pane"><div class="codemirror-container"></div></div>
                <div class="preview-pane"><div class="preview-content"></div></div>
            </div>
            <div class="status-bar"><span class="save-status">Saved</span></div>`;
    }

    bindEditorEvents() {
        const editorEl = document.querySelector('.editor-container');
        if (!editorEl) return;

        editorEl.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                this.editorMode = btn.dataset.mode; 
                storage.set('pkm_editor_mode', this.editorMode);
                
                editorEl.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const editorContent = editorEl.querySelector('.editor-content');
                editorContent.className = `editor-content ${this.editorMode}-mode`;
            });
        });
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

        const finalHtmlParts = parts.map((part) => {
            if (part.startsWith('```python')) {
                const code = part.replace(/^```python\n/, '').replace(/\n```$/, '');
                const uniqueId = `code-${note.id}-${codeBlockIndex}`;
                const escapedCode = this.escapeHtml(code);
                const noteOutputs = this.codeBlockOutputs.get(note.id) || new Map();
                const storedOutput = noteOutputs.get(codeBlockIndex) || '';
                
                const html = `<div class="code-container" id="${uniqueId}">
                        <div class="code-header"><span>PYTHON</span><button class="run-btn">▶ Run</button></div>
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
            console.error("DOMPurify not loaded.");
            previewContentEl.textContent = 'Error: Preview renderer not loaded.';
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

        const notesToUpdate = Object.values(this.notes).filter(note =>
            note.id !== linkId && (note.content.includes(`[[${linkId}|`) || note.content.toLowerCase().includes(`![[${oldTitle.toLowerCase()}#`))
        );

        if (notesToUpdate.length > 0) {
            const linkUpdateRegex = new RegExp(`\\[\\[(${linkId})\\|([^\\]]+)\\]\\]`, 'g');
            const embedUpdateRegex = new RegExp(`(!\\[\\[)(${this.escapeRegExp(oldTitle)})(#\\^.*?\\]\\])`, 'gi');

            notesToUpdate.forEach(note => {
                let newContent = note.content;
                let changed = false;
                
                newContent = newContent.replace(linkUpdateRegex, (match, id, displayText) => {
                    if (displayText.trim().toLowerCase() === oldTitle.trim().toLowerCase()) {
                        changed = true;
                        return `[[${id}|${newTitle}]]`;
                    }
                    return match;
                });

                if (embedUpdateRegex.test(newContent)) {
                    newContent = newContent.replace(embedUpdateRegex, `$1${newTitle}$3`);
                    changed = true;
                }

                if (changed) {
                    note.update(newContent, false); // false to avoid recursive save loop
                }
            });
        }
        
        this.saveNotes();
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.updateRightSidebar();
    }

    base64ToBlob(base64, contentType = 'image/png') {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type: contentType });
    }

    async copyTextToClipboard(text, buttonElement) {
        try {
            await navigator.clipboard.writeText(text);
            if (buttonElement) buttonElement.textContent = 'Copied!';
        } catch (err) {
            console.warn('Clipboard API failed, falling back.', err);
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                if(document.execCommand('copy')) {
                    if (buttonElement) buttonElement.textContent = 'Copied!';
                }
            } catch (err) {
                 if (buttonElement) buttonElement.textContent = 'Error';
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
                    outputEl.innerHTML = '<pre class="output-error">No code found</pre>';
                    return;
                }

                const code = codeElement.textContent;
                outputEl.innerHTML = '<div class="spinner">⏳ Executing...</div>';
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
                            this.copyTextToClipboard(formattedOutput.rawText || '', target);
                        } else if (target.matches('.copy-plot-btn')) {
                            const base64 = target.dataset.plotBase64;
                            try {
                                const blob = this.base64ToBlob(base64);
                                await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
                                target.textContent = 'Copied!';
                                setTimeout(() => { target.textContent = 'Copy Image'; }, 2000);
                            } catch (err) {
                                console.error('Failed to copy image:', err);
                                target.textContent = 'Error!';
                            }
                        } else if (target.matches('.download-plot-btn')) {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(this.base64ToBlob(target.dataset.plotBase64));
                            a.download = target.dataset.filename;
                            a.click();
                        }
                    });
                } catch (error) {
                    let errorMessage = error.message || error.toString();
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
                if (this.notes[noteId]) this.openNote(noteId);
            });
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateRightSidebar() {
        const container = document.getElementById('rightSidebar').querySelector('.right-sidebar-content');
        const activeNoteId = this.activeTabIndex > -1 ? this.openTabs[this.activeTabIndex] : null;

        if (!activeNoteId || !this.notes[activeNoteId]) {
            container.innerHTML = `<div class="empty-sidebar"><p>No note selected.</p></div>`;
            return;
        }

        const note = this.notes[activeNoteId];
        const content = note.getContentWithoutMetadata();
        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
        const backlinks = this.backlinksManager.getBacklinks(note.title);
        
        let backlinksHTML = backlinks.length > 0 ? `<div class="backlinks-list">
            ${backlinks.map(b => `
                <div class="backlink-item" data-note-id="${b.noteId}">
                    <div class="backlink-title">${b.noteTitle}</div>
                    <div class="backlink-context">${b.context}</div>
                </div>`).join('')}
            </div>` : '<div class="word-count-display">No backlinks to this note.</div>';

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

        this.graphManager.createGraph(container.querySelector('#graphContainer'), note.id, 1);

        container.querySelector('#exportGraphBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.exportNetworkData(note.id);
        });

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
        Object.assign(exportMenu.style, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '10000' });
        
        exportMenu.innerHTML = `
            <div style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid var(--border); margin-bottom: 8px;">Export Options</div>
            <button class="context-menu-item" data-action="export-complete">🌐 Complete Network</button>
            <button class="context-menu-item" data-action="export-ego">🎯 Current View Network</button>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" data-action="cancel">❌ Cancel</button>
        `;
        
        document.body.appendChild(exportMenu);
        
        const closeMenu = () => exportMenu.remove();
        exportMenu.querySelector('[data-action="export-complete"]').addEventListener('click', () => { this.performNetworkExport(noteId, true); closeMenu(); });
        exportMenu.querySelector('[data-action="export-ego"]').addEventListener('click', () => { this.performNetworkExport(noteId, false); closeMenu(); });
        exportMenu.querySelector('[data-action="cancel"]').addEventListener('click', closeMenu);
    }

    performNetworkExport(noteId, completeNetwork = true) {
        const currentSteps = completeNetwork ? null : this.graphManager.currentSteps;
        const networkData = this.graphManager.exportNetworkCSV(noteId, true, completeNetwork, true, currentSteps);
        if (!networkData) return;

        const note = this.notes[noteId];
        const timestamp = new Date().toISOString().split('T');
        const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const networkType = completeNetwork ? 'complete' : `ego_${currentSteps}step${currentSteps > 1 ? 's' : ''}`;

        this.graphManager.downloadCSV(networkData.edgesCSV, `${safeTitle}_${networkType}_edges_${timestamp}.csv`);
        setTimeout(() => this.graphManager.downloadCSV(networkData.nodesCSV, `${safeTitle}_${networkType}_nodes_${timestamp}.csv`), 100);
        setTimeout(() => this.graphManager.downloadCSV(networkData.statsCSV, `${safeTitle}_${networkType}_stats_${timestamp}.csv`), 200);
        if (networkData.isolatedCSV && completeNetwork) {
            setTimeout(() => this.graphManager.downloadCSV(networkData.isolatedCSV, `${safeTitle}_isolated_notes_${timestamp}.csv`), 300);
        }
    }

    setSortOrder(order) {
        this.sortOrder = order;
        storage.set('pkm_sort_order', this.sortOrder);
        this.renderNoteList();
    }

    renderNoteList() {
        const noteList = document.getElementById('noteList');
        const notesArray = Object.values(this.notes);

        switch (this.sortOrder) {
            case 'alphabetical': notesArray.sort((a, b) => a.title.localeCompare(b.title)); break;
            case 'modified-asc': notesArray.sort((a, b) => a.modified - b.modified); break;
            default: notesArray.sort((a, b) => b.modified - a.modified); break;
        }

        const folderStructure = { _notes: [], _children: {} };
        notesArray.forEach(note => {
            const path = note.folder || 'root';
            if (!path || path === "root") { 
                folderStructure._notes.push(note);
                return;
            }
            let currentLevel = folderStructure._children;
            path.split('/').forEach((part, index, arr) => {
                if (!currentLevel[part]) currentLevel[part] = { _notes: [], _children: {} };
                if (index === arr.length - 1) currentLevel[part]._notes.push(note);
                else currentLevel = currentLevel[part]._children;
            });
        });

        const createNoteHTML = note => `<div class="note-item" data-note-id="${note.id}"><div class="note-title">${note.title}</div><div class="note-preview">${note.getPreview()}</div></div>`;
        const getRecursiveNoteCount = folder => folder._notes.length + Object.values(folder._children).reduce((acc, child) => acc + getRecursiveNoteCount(child), 0);

        const createFolderHTML = (name, folder) => {
            const totalNotes = getRecursiveNoteCount(folder);
            if (totalNotes === 0) return '';
            let contentsHTML = folder._notes.map(createNoteHTML).join('');
            for (const childName of Object.keys(folder._children).sort()) {
                contentsHTML += createFolderHTML(childName, folder._children[childName]);
            }
            return `<div class="folder-item"><div class="folder-header"><span class="folder-arrow">▶</span><span class="folder-name">${name}</span><span class="folder-count">${totalNotes}</span></div><div class="folder-contents" style="display: none;">${contentsHTML}</div></div>`;
        };

        let finalHTML = folderStructure._notes.map(createNoteHTML).join('');
        for (const folderName of Object.keys(folderStructure._children).sort()) {
            finalHTML += createFolderHTML(folderName, folderStructure._children[folderName]);
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
                const contents = header.nextElementSibling;
                const isOpen = contents.style.display === 'block';
                contents.style.display = isOpen ? 'none' : 'block';
                header.querySelector('.folder-arrow').textContent = isOpen ? '▶' : '▼';
            });
        });
        this.updateActiveNoteInSidebar();
    }

    updateActiveNoteInSidebar() {
        requestAnimationFrame(() => {
            document.querySelectorAll('.note-item.active').forEach(i => i.classList.remove('active'));
            if (this.activeTabIndex > -1) {
                const activeNoteId = this.openTabs[this.activeTabIndex];
                const newActiveItem = document.querySelector(`.note-item[data-note-id="${activeNoteId}"]`);
                if (newActiveItem) newActiveItem.classList.add('active');
            }
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
                // --- MODIFICATION START ---
                const noteTitle = this.notes[noteId] ? `"${this.notes[noteId].title}"` : "Note";
                menuItems = `
                    <div class="context-menu-title">Actions for ${noteTitle}</div>
                    <button class="context-menu-item" data-action="open" data-note-id="${noteId}">📂 Open</button>
                    <button class="context-menu-item" data-action="move-note" data-note-id="${noteId}">↦ Move...</button>
                    <div class="context-menu-separator"></div>
                    <button class="context-menu-item" data-action="delete" data-note-id="${noteId}">🗑️ Delete Note</button>
                `;

                break;
            case 'sidebar': // This case is triggered by the existing event listener in init()

                 menuItems = `
                    <button class="context-menu-item" data-action="new-note">📝 New Note</button>
                    <button class="context-menu-item" data-action="new-folder">📁 New Folder...</button>
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-title">Sort Notes By</div>
                    <button class="context-menu-item" data-sort="alphabetical">${check('alphabetical')}Alphabetical</button>
                    <button class="context-menu-item" data-sort="modified-desc">${check('modified-desc')}Most Recent</button>
                    <button class="context-menu-item" data-sort="modified-asc">${check('modified-asc')}Oldest</button>
                `;
                break;
            default: // Fallback for header and other areas
                menuItems = `
                    <div class="context-menu-title">Sort Notes By</div>
                    <button class="context-menu-item" data-sort="alphabetical">${check('alphabetical')}Alphabetical</button>
                    <button class="context-menu-item" data-sort="modified-desc">${check('modified-desc')}Most Recent</button>
                    <button class="context-menu-item" data-sort="modified-asc">${check('modified-asc')}Oldest</button>
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

            const { action, sort: sortOrder, noteId } = target.dataset;

            if (sortOrder) this.setSortOrder(sortOrder);

            switch (action) {
                case 'new-note': this.createNote(); break;
                case 'new-folder': this.createFolder(); break;
                case 'open': this.openNote(noteId); break;
                case 'move-note': this.moveNote(noteId); break;
                case 'delete': this.deleteNote(noteId, e); break;
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
        const searchTerm = query.toLowerCase().trim();
        
        items.forEach(item => {
            if (!searchTerm) {
                item.style.display = 'block';
                return;
            }
            const note = this.notes[item.dataset.noteId];
            const isVisible = note.title.toLowerCase().includes(searchTerm) || note.content.toLowerCase().includes(searchTerm);
            item.style.display = isVisible ? 'block' : 'none';
        });
    }

    saveNotes() { 
        storage.set('pkm_notes', this.notes); 
    }
    
    saveSettings() { 
        storage.set('pkm_settings', this.settings); 
    }
    
    importFiles() { 
        document.getElementById('fileInput').click(); 
    }

    exportNotes() {
        const exportMenu = document.createElement('div');
        exportMenu.className = 'context-menu';
        Object.assign(exportMenu.style, { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: '10000' });
        
        exportMenu.innerHTML = `
            <div style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid var(--border); margin-bottom: 8px;">Export Options</div>
            <button class="context-menu-item" data-action="export-json">📄 Export as JSON</button>
            <button class="context-menu-item" data-action="export-markdown">📝 Export as Markdown Files</button>
            <button class="context-menu-item" data-action="export-single-md">📋 Export as Single Markdown</button>
            <div class="context-menu-separator"></div>
            <button class="context-menu-item" data-action="cancel">❌ Cancel</button>
        `;
        
        document.body.appendChild(exportMenu);
        
        const closeMenu = () => exportMenu.remove();
        exportMenu.querySelector('[data-action="export-json"]').addEventListener('click', () => { this.exportAsJSON(); closeMenu(); });
        exportMenu.querySelector('[data-action="export-markdown"]').addEventListener('click', () => { this.exportAsMarkdownFiles(); closeMenu(); });
        exportMenu.querySelector('[data-action="export-single-md"]').addEventListener('click', () => { this.exportAsSingleMarkdown(); closeMenu(); });
        exportMenu.querySelector('[data-action="cancel"]').addEventListener('click', closeMenu);
    }

    exportAsJSON() {
        const dataStr = JSON.stringify({ notes: this.notes, exported: new Date().toISOString() }, null, 2);
        this.downloadFile(dataStr, `pkm-notes-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    }

    exportAsMarkdownFiles() {
        if (Object.keys(this.notes).length === 0) return;
        Object.values(this.notes).forEach((note, index) => {
            setTimeout(() => {
                const filename = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                this.downloadFile(note.content, `${filename}.md`, 'text/markdown');
            }, index * 100);
        });
    }

    exportAsSingleMarkdown() {
        if (Object.keys(this.notes).length === 0) return;
        const sortedNotes = Object.values(this.notes).sort((a, b) => b.modified - a.modified);
        let combinedContent = `# PKM Notes Export\n\nExported on: ${new Date().toLocaleString()}\n\n---\n\n`;
        sortedNotes.forEach(note => {
            combinedContent += `# ${note.title}\n\n*Created: ${new Date(note.created).toLocaleString()}*\n*Modified: ${new Date(note.modified).toLocaleString()}*\n\n${note.getContentWithoutMetadata()}\n\n---\n\n`;
        });
        this.downloadFile(combinedContent, `pkm-notes-combined-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
    }

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async handleFileImport(event) {
        const files = event.target.files;
        if (!files) return;

        // Create an array to hold a promise for each file read operation
        const readPromises = Array.from(files).map(file => {
            // Return a new promise for each file
            return new Promise((resolve, reject) => {
                if (file.type.startsWith('text/') || file.name.endsWith('.md')) {
                    const reader = new FileReader();
                    
                    reader.onload = (e) => {
                        try {
                            const content = e.target.result;
                            let title = file.name.replace(/\.(md|txt)$/i, '');
                            
                            // Check for title in YAML frontmatter
                            const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                            if (yamlMatch) {
                                const titleMatch = yamlMatch[1].match(/^title:\s*(.+)$/m);
                                if (titleMatch) {
                                    title = titleMatch[1].replace(/^['"]|['"]$/g, '').trim();
                                }
                            }
                            
                            const note = new Note(title, content);
                            this.notes[note.id] = note;
                            resolve(); // Resolve the promise when the note is created
                        } catch (error) {
                            reject(error); // Reject on error
                        }
                    };

                    reader.onerror = () => {
                        reject(new Error(`Failed to read file: ${file.name}`));
                    };

                    reader.readAsText(file);
                } else {
                    // If the file is not a text file, resolve immediately to not block others
                    resolve(); 
                }
            });
        });

        // Wait for all the file reading promises to complete
        try {
            await Promise.all(readPromises);

            // Now that all files are processed and notes are created, update the app
            this.backlinksManager.updateNotes(this.notes);
            this.graphManager.updateNotes(this.notes);
            this.saveNotes();
            this.renderNoteList();
            this.updateRightSidebar();
            
        } catch (error) {
            console.error("An error occurred during file import:", error);
            // Optionally, display an error message to the user
        }

        // Reset the file input so the user can import the same file again if needed
        event.target.value = '';
    }

    createWikiLinkCompletion() {
        return (context) => {
            const before = context.matchBefore(/\[\[([^\]]*)$/);
            if (!before) return null;
            
            const query = before.text.slice(2).toLowerCase();
            
            const options = Object.values(this.notes)
                .filter(note => note.title.toLowerCase().includes(query))
                .map(note => ({
                    label: `[[${note.title}]]`,
                    type: "text",
                    apply: `[[${note.title}]]`
                }));
                
            if (query.length > 0) {
                options.push({
                    label: `[[${query}]] (create new)`,
                    type: "text", 
                    apply: `[[${query}]]`
                });
            }
            
            return { from: before.from, options };
        };
    }

    toggleTheme() { 
        this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light'; 
        this.saveSettings(); 
        this.setupTheme(); 
    }

    convertToDisplayFormat(content) {
        return content.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (match, id, displayText) => {
            const note = this.notes[id];
            if (!note) return match;
            return displayText !== note.title ? `[[${note.title}/${displayText}]]` : `[[${displayText}]]`;
        });
    }

    convertToInternalFormat(content) {
        const titleToIdMap = Object.values(this.notes).reduce((acc, note) => {
            acc[note.title.toLowerCase()] = note.id;
            return acc;
        }, {});

        return content.replace(/\[\[([^|\]\/]+)(?:\/([^\]]+))?\]\]/g, (match, firstPart, aliasPart) => {
            const noteTitle = firstPart.trim();
            const noteId = titleToIdMap[noteTitle.toLowerCase()];
            if (noteId) {
                const alias = (aliasPart || '').trim();
                return `[[${noteId}|${alias || noteTitle}]]`;
            }
            return match;
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
                    <p>This is a lightweight, web-based personal knowledge management tool.</p>
                    <h4>Key Features:</h4>
                    <ul>
                        <li><b>Tabbed Interface:</b> Open and manage multiple notes in tabs.</li>
                        <li><b>Markdown Editor:</b> Real-time preview with syntax highlighting.</li>
                        <li><b>Wikilinks:</b> Create connections between notes using <code>[[Note Title]]</code>.</li>
                        <li><b>Aliases for Links:</b> Create aliases for displayed link text using <code> [[Note Title/Display Text]]</code>.</li>
                        <li><b>Backlinks Panel:</b> See all notes that link to your current note.</li>
                        <li><b>Code Execution:</b> Run Python code blocks directly within your notes via the Preview window.</li>
                        <li><b>Graph View:</b> Visualize the connections between your notes.</li>
                        <li><b>Local Storage:</b> Everything is saved directly in your browser.</li>
                        <li><b>Portability:</b> Your notes and the graph of your linked thought can be exported as .md and .csv.</li>
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

        const closeModal = () => {
            if (modal.querySelector('#welcomeDontShow').checked) {
                storage.set('pkm_seen_welcome', true);
            }
            modal.remove();
        };

        modal.querySelector('.welcome-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#welcomeGotItBtn').addEventListener('click', closeModal);
        modal.querySelector('.welcome-overlay').addEventListener('click', closeModal);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PKMApp();
});