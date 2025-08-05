import { PyodideManager } from './pyodideManager.js';
import { Note } from './note.js';
import { BacklinksManager } from './backlinks.js';
import { GraphManager } from './graph.js';
import { ResizablePanes } from './resizable-panes.js';
import { AutocompleteManager } from './autocomplete.js';
import { storage, debounce } from './utils.js'; 

// Main PKM Application Class
class PKMApp {
    constructor() {
        this.notes = this.loadNotes();
        this.settings = storage.get('pkm_settings', { theme: 'light' });

        this.panes = storage.get('pkm_panes', []);
        this.focusedPaneId = storage.get('pkm_focused_pane', null);
        
        this.paneWidths = new Map(storage.get('pkm_pane_widths', []));

        this.backlinksManager = new BacklinksManager(this.notes);
        this.graphManager = new GraphManager(this.notes);
        
        this.pyodideManager = new PyodideManager();
        this.codeBlockOutputs = new Map();
        
        this.graphManager.onNodeClick = (noteId) => this.openNote(noteId);
        this.resizablePanes = null;

        this.init();
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
        this.showWelcomeModal();
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        document.querySelector('.sidebar').addEventListener('contextmenu', e => {
            if (!e.target.closest('.note-item')) {
                e.preventDefault();
                this.showContextMenu(e, null);
            }
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
            const noteFiles = manifest.defaultNotes;

            if (!noteFiles || noteFiles.length === 0) {
                console.warn("No default notes listed in manifest.json");
                return {};
            }

            const fetchPromises = noteFiles.map(filename => 
                fetch(`content/${filename}`)
                    .then(response => {
                        if (!response.ok) {
                            console.error(`Failed to fetch ${filename}: ${response.statusText}`);
                            return `# Error\n\nFailed to load content for ${filename}.`;
                        }
                        return response.text();
                    })
            );

            const noteContents = await Promise.all(fetchPromises);

            noteContents.forEach((content) => {
                const note = new Note("Default Note", content);
                note.update(content, true); 
                notes[note.id] = note;
            });

        } catch (error) {
            console.error("Error creating default notes:", error);
            const errorNote = new Note("Error Loading Notes", "There was an issue loading the default notes. Please check 'content/manifest.json' and the browser console for details.");
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
    }

    bindGlobalEvents() {
        document.getElementById('newNoteBtn').addEventListener('click', () => this.createNote());
        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('importBtn').addEventListener('click', () => this.importFiles());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportNotes());
        document.getElementById('searchInput').addEventListener('input', debounce((e) => this.searchNotes(e.target.value), 300));
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));
        
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

    openNote(noteId) {
        let targetPane = this.getPane(this.focusedPaneId);
        if (!targetPane && this.panes.length > 0) targetPane = this.panes[0];
        if (!targetPane) targetPane = this.createPane(noteId);
        targetPane.noteId = noteId;
        this.setFocusedPane(targetPane.id);
        this.renderAllPanes();
    }

    openNoteInNewPane(noteId) {
        const pane = this.createPane(noteId);
        this.setFocusedPane(pane.id);
        this.renderAllPanes();
    }

    closePane(paneId) {
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

    deleteNote(noteId) {
        if (!confirm(`Are you sure you want to permanently delete "${this.notes[noteId]?.title || 'this note'}"?`)) return;
        this.panes = this.panes.filter(p => p.noteId !== noteId);
        if (this.panes.some(p => p.id === this.focusedPaneId && p.noteId === noteId)) this.focusedPaneId = null;
        delete this.notes[noteId];
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.saveNotes();
        this.savePanes();
        this.renderNoteList();
        this.renderAllPanes();
        this.updateRightSidebar();
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
                    <textarea class="editor-textarea" placeholder="Start writing...">${note.content}</textarea>
                </div>
                <div class="preview-pane"><div class="preview-content"></div></div>
            </div>
            <div class="status-bar"><span class="save-status">Saved</span></div>`;
    }

    bindPaneEvents(paneEl, pane) {
        const textarea = paneEl.querySelector('.editor-textarea');
        const autocompleteManager = new AutocompleteManager(this.notes, paneEl.querySelector('.editor-pane'));
        let originalTitle = this.notes[pane.noteId].title;
        paneEl.addEventListener('click', () => this.setFocusedPane(pane.id));
        paneEl.querySelector('.close-pane-btn').addEventListener('click', (e) => { e.stopPropagation(); this.closePane(pane.id); });
        paneEl.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); pane.mode = btn.dataset.mode; this.renderAllPanes(); });
        });
        textarea.addEventListener('input', debounce(() => this.saveNoteFromPane(pane.id, originalTitle), 1500));
        textarea.addEventListener('input', () => {
            const note = this.notes[pane.noteId];
            note.update(textarea.value, false);
            this.updatePaneContent(paneEl, note);
            this.updateRightSidebar();
            this.handleAutocomplete(textarea, autocompleteManager, (selectedMatch, originalLinkMatch) => {
                this.afterAutocomplete(textarea, selectedMatch, originalLinkMatch, () => {
                note.update(textarea.value, false);
                this.updatePaneContent(paneEl, note);
                 });
            });
        });
        paneEl.addEventListener('focus', () => { originalTitle = this.notes[pane.noteId].title; }, true);
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
        const oldTitle = originalTitle || note.title;
        note.update(content, true);
        if (oldTitle !== note.title) {
            this.renderNoteList();
            this.renderAllPanes();
        } else {
            paneEl.querySelector('.editor-title').textContent = note.title;
            paneEl.querySelector('.save-status').textContent = `Saved`;
        }
        this.saveNotes();
        this.backlinksManager.updateNotes(this.notes);
        this.graphManager.updateNotes(this.notes);
        this.updateRightSidebar();
    }

    updatePaneContent(paneEl, note) {
        this.updatePanePreview(paneEl, note);
    }

    updatePanePreview(paneEl, note) {
        const previewContentEl = paneEl.querySelector('.preview-content');
        if (!previewContentEl) return;

        let content = note.getContentWithoutMetadata();

        content = content.replace(/!\[\[([^#\]]+)#\^([^\]]+)\]\]/g, (match, noteTitle, blockId) => {
            const targetNote = Object.values(this.notes).find(n => 
                n.title.toLowerCase() === noteTitle.trim().toLowerCase()
            );
            
            if (targetNote) {
                const blockContent = targetNote.getBlockContent(blockId.trim());
                if (blockContent) {
                    return `<div class="embedded-block">${marked.parse(blockContent)}<div class="embedded-block-source">From: <span class="wikilink" data-link="${targetNote.title}">${targetNote.title}</span></div></div>`;
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
                let markdownPart = part.replace(/\[\[([^\]]+)\]\]/g, (match, linkText) => {
                    const exists = Object.values(this.notes).some(n => 
                        n.title.toLowerCase() === linkText.toLowerCase()
                    );
                    return `<span class="${exists ? 'wikilink' : 'wikilink broken'}" data-link="${linkText}">${linkText}</span>`;
                });
                
                return marked.parse(markdownPart);
            }
        });

        previewContentEl.innerHTML = finalHtmlParts.join('');
        
        previewContentEl.querySelectorAll('pre code:not(.language-python)').forEach(block => {
            hljs.highlightBlock(block);
        });
        
        this.bindPreviewEvents(paneEl, note);
    }
    
    // --- CORRECTLY PLACED HELPER METHODS ---
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

                        // --- MODIFIED: Reliable Download Logic ---
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
                const linkText = link.dataset.link;
                const targetNote = Object.values(this.notes).find(n => n.title.toLowerCase() === linkText.toLowerCase());
                if (targetNote) {
                    this.openNote(targetNote.id);
                } else {
                    console.warn(`Target note "${linkText}" not found`);
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
        const timestamp = new Date().toISOString().split('T');
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

    renderNoteList() {
        const noteList = document.getElementById('noteList');
        const sortedNotes = Object.values(this.notes).sort((a, b) => b.modified - a.modified);
        
        noteList.innerHTML = sortedNotes.map(note => `
            <div class="note-item" data-note-id="${note.id}">
                <div class="note-title">${note.title}</div>
                <div class="note-preview">${note.getPreview()}</div>
            </div>`).join('');

        noteList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => this.openNote(item.dataset.noteId));
            item.addEventListener('contextmenu', (e) => { 
                e.preventDefault(); 
                this.showContextMenu(e, item.dataset.noteId); 
            });
        });
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.updateActiveNoteInSidebar();
            });
        });
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

    showContextMenu(event, noteId) {
        this.hideContextMenu();
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';

        let menuItems = '';

        if (noteId) {
            const pane = this.panes.find(p => p.noteId === noteId);
            const isMaximized = this.resizablePanes && this.resizablePanes.getMaximizedPane() === pane?.id;
            
            menuItems = `
                <button class="context-menu-item" data-action="new-note">📝 New Note</button>
                <div class="context-menu-separator"></div>
                <button class="context-menu-item" data-action="open-pane">✨ Open in New Pane</button>
                ${pane ? `<button class="context-menu-item" data-action="toggle-maximize">${isMaximized ? '🗗 Minimize Pane' : '🗖 Maximize Pane'}</button>` : ''}
                <div class="context-menu-separator"></div>
                <button class="context-menu-item" data-action="delete">🗑️ Delete Note</button>
            `;
        } else {
            menuItems = `<button class="context-menu-item" data-action="new-note">📝 New Note</button>`;
        }

        menu.innerHTML = menuItems;
        document.body.appendChild(menu);
        menu.style.top = `${event.clientY}px`;
        menu.style.left = `${event.clientX}px`;
        
        menu.querySelector('[data-action="new-note"]').addEventListener('click', () => { 
            this.createNote(); 
            this.hideContextMenu(); 
        });
        
        if (noteId) {
            menu.querySelector('[data-action="delete"]').addEventListener('click', () => { 
                this.deleteNote(noteId); 
                this.hideContextMenu(); 
            });
            
            menu.querySelector('[data-action="open-pane"]').addEventListener('click', () => { 
                this.openNoteInNewPane(noteId); 
                this.hideContextMenu(); 
            });
            
            const toggleMaxBtn = menu.querySelector('[data-action="toggle-maximize"]');
            if (toggleMaxBtn) {
                toggleMaxBtn.addEventListener('click', () => { 
                    const pane = this.panes.find(p => p.noteId === noteId);
                    if (pane && this.resizablePanes) {
                        this.resizablePanes.toggleMaximize(pane.id);
                    }
                    this.hideContextMenu(); 
                });
            }
        }
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.remove();
    }

    handleAutocomplete(textarea, autocompleteManager, onSelectCallback) {
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPos);
        
        const linkMatch = textBeforeCursor.match(/\[\[([^\]\[]*)$/);
        
        if (linkMatch) {
            autocompleteManager.show(textarea, linkMatch, (selectedMatch) => {
                onSelectCallback(selectedMatch, linkMatch);
            });
        } else {
            autocompleteManager.hide();
        }
    }

    afterAutocomplete(textarea, selectedMatch, originalLinkMatch, onComplete) {
        const cursorPos = textarea.selectionStart;
        const queryToReplace = originalLinkMatch;
        const startOfReplace = cursorPos - queryToReplace.length;
        
        const textBefore = textarea.value.substring(0, startOfReplace);
        const textAfter = textarea.value.substring(cursorPos);

        if (selectedMatch.type === 'create') {
            const newNote = new Note(selectedMatch.title);
            this.notes[newNote.id] = newNote;
            this.graphManager.updateNotes(this.notes);
            this.saveNotes();
            this.renderNoteList();
        }
        
        const replacementText = `[[${selectedMatch.title}]]`;
        textarea.value = textBefore + replacementText + textAfter;
        const newCursorPos = startOfReplace + replacementText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        if (onComplete) {
            onComplete();
        }
        
        textarea.focus();
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
                        const yamlContent = yamlMatch;
                        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
                        if (titleMatch) {
                            title = titleMatch.replace(/^['"]|['"]$/g, '');
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

    toggleTheme() { 
        this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light'; 
        this.saveSettings(); 
        this.setupTheme(); 
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
                    <li><b>WARNING</b>: If you change a note name, existing wikilinks to that note will break</li>
                </ul>
                
                <h4>Multi-Pane Interface</h4>
                <ul>
                    <li>Open multiple notes simultaneously in separate panes</li>
                    <li>Split view modes: Edit only, Preview only, or Split (edit and preview side-by-side)</li>
                    <li>Drag the handles between panes to resize them.</li>
                    <li>Double-click resize handles to auto-size panes equally.</li>
                    <li><strong>NEW:</strong> Click the 🗖 button to maximize any pane to full width</li>
                    <li><strong>NEW:</strong> Use Ctrl/Cmd + M to toggle maximize for the focused pane</li>
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

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PKMApp();
});