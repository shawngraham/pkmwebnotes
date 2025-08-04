// Enhanced ResizablePanes with simplified maximize/minimize functionality
export class ResizablePanes {
    constructor(container) {
        console.log('🔧 ResizablePanes constructor called', container);
        this.container = container;
        this.isResizing = false;
        this.currentHandle = null;
        this.startX = 0;
        this.leftPaneStartWidth = 0;
        this.rightPaneStartWidth = 0;
        
        // Simplified maximize state management
        this.maximizedPane = null;
        this.preMaximizeState = null; // Store entire layout state
        
        this.createWidthTooltip();
        this.attachGlobalListeners();
        this.onResizeEnd = null;
        
        console.log('✅ ResizablePanes initialized successfully');
    }

    createWidthTooltip() {
        const existing = document.getElementById('widthTooltip');
        if (existing) {
            this.tooltip = existing;
            return;
        }
        
        const tooltip = document.createElement('div');
        tooltip.id = 'widthTooltip';
        tooltip.className = 'width-tooltip';
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
    }

    attachGlobalListeners() {
        // Use arrow functions to maintain 'this' context
        this.handleResizeEvent = this.handleResize.bind(this);
        this.stopResizeEvent = this.stopResize.bind(this);
        
        document.addEventListener('mousemove', this.handleResizeEvent);
        document.addEventListener('mouseup', this.stopResizeEvent);
        document.addEventListener('touchmove', this.handleResizeEvent, { passive: false });
        document.addEventListener('touchend', this.stopResizeEvent);
        
        document.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                e.preventDefault();
            }
        });
    }

    /**
     * Main update method - simplified logic
     */
    update() {
        console.log('🔄 ResizablePanes.update() called');
        
        // Clear existing handles and buttons
        this.clearExistingElements();
        
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        console.log(`📊 Found ${panes.length} panes`);
        
        if (panes.length === 0) return;
        
        // Add maximize buttons to all panes
        panes.forEach(pane => this.addMaximizeButton(pane));
        
        // Only add resize handles if not maximized
        if (!this.maximizedPane) {
            this.addResizeHandles(panes);
            this.applyNormalLayout(panes);
        } else {
            this.applyMaximizedLayout(panes);
        }
        
        console.log('✅ ResizablePanes.update() completed');
    }

    clearExistingElements() {
        // Remove existing resize handles
        const existingHandles = this.container.querySelectorAll('.resize-handle');
        existingHandles.forEach(handle => handle.remove());
        
        // Remove existing maximize buttons
        const existingMaxButtons = this.container.querySelectorAll('.maximize-btn');
        existingMaxButtons.forEach(btn => btn.remove());
    }

    addResizeHandles(panes) {
        for (let i = 0; i < panes.length - 1; i++) {
            const handle = this.createResizeHandle(panes[i], panes[i + 1]);
            panes[i].parentNode.insertBefore(handle, panes[i].nextSibling);
        }
    }

    applyNormalLayout(panes) {
        panes.forEach(pane => {
            pane.style.display = 'flex';
            pane.classList.remove('maximized');
            // Width will be handled by applyStoredWidths or default flex
        });
    }

    applyMaximizedLayout(panes) {
    // Force container to recognize new layout
    this.container.style.display = 'block';
    
    const containerWidth = this.container.getBoundingClientRect().width - 20;
    
    panes.forEach(pane => {
        if (pane.id === this.maximizedPane) {
            pane.style.display = 'flex';
            pane.style.width = `${containerWidth}px`;
            pane.style.maxWidth = '100%';
            pane.style.flex = '0 0 auto';
            pane.classList.add('maximized');
        } else {
            pane.style.display = 'none';
        }
    });
    
    // Reset container display
    this.container.style.display = '';
}

    addMaximizeButton(pane) {
        const header = pane.querySelector('.editor-header .editor-modes');
        if (!header) return;

        const maximizeBtn = document.createElement('button');
        maximizeBtn.className = 'maximize-btn btn';
        maximizeBtn.innerHTML = this.maximizedPane === pane.id ? '🗗' : '🗖';
        maximizeBtn.title = this.maximizedPane === pane.id ? 'Restore' : 'Maximize';
        maximizeBtn.style.cssText = `
            margin-left: 8px;
            padding: 4px 8px;
            font-size: 12px;
            min-width: 28px;
        `;
        
        maximizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMaximize(pane.id);
        });
        
        header.appendChild(maximizeBtn);
    }

    /**
     * Simplified toggle maximize
     */
    toggleMaximize(paneId) {
        console.log(`🔄 Toggling maximize for pane ${paneId}`);
        
        if (this.maximizedPane === paneId) {
            this.restoreFromMaximized();
        } else {
            this.maximizePane(paneId);
        }
    }

    maximizePane(paneId) {
        console.log(`📈 Maximizing pane ${paneId}`);
        
        // Save current state before maximizing
        this.saveCurrentLayout();
        this.maximizedPane = paneId;
        
        // Update layout
        this.update();
        
        // Notify parent about resize
        if (this.onResizeEnd) {
            const containerWidth = this.container.offsetWidth - 20;
            this.onResizeEnd(paneId, containerWidth);
        }
    }

    restoreFromMaximized() {
        console.log('📉 Restoring from maximized state');
        
        if (!this.maximizedPane) return;
        
        this.maximizedPane = null;
        
        // Update layout
        this.update();
        
        // Restore previous widths if available
        if (this.preMaximizeState) {
            this.restoreLayout();
        }
    }

    saveCurrentLayout() {
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        this.preMaximizeState = panes.map(pane => ({
            id: pane.id,
            width: pane.offsetWidth,
            display: pane.style.display || 'flex'
        }));
        console.log('💾 Saved layout state:', this.preMaximizeState);
    }

    restoreLayout() {
        if (!this.preMaximizeState) return;
        
        this.preMaximizeState.forEach(state => {
            const pane = document.getElementById(state.id);
            if (pane) {
                pane.style.width = `${state.width}px`;
                pane.style.flex = 'none';
                pane.style.display = state.display;
                
                // Notify parent
                if (this.onResizeEnd) {
                    this.onResizeEnd(state.id, state.width);
                }
            }
        });
        
        console.log('🔄 Restored layout state');
    }

    // Status methods
    isMaximized() {
        return this.maximizedPane !== null;
    }

    getMaximizedPane() {
        return this.maximizedPane;
    }

    /**
     * Apply stored widths (only when not maximized)
     */
    applyStoredWidths(paneWidths) {
        if (this.maximizedPane) {
            console.log('📐 Skipping width application - pane is maximized');
            return;
        }
        
        console.log('📐 Applying stored widths:', paneWidths);
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        
        panes.forEach(pane => {
            const storedWidth = paneWidths.get(pane.id);
            if (storedWidth) {
                pane.style.width = `${storedWidth}px`;
                pane.style.flex = 'none';
            }
        });
    }

    resetWidths() {
        console.log('🔄 Resetting all pane widths');
        
        // If maximized, restore first
        if (this.maximizedPane) {
            this.restoreFromMaximized();
        }
        
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        if (panes.length === 0) return;
        
        const containerWidth = this.container.offsetWidth;
        const handleWidth = 6;
        const totalHandles = panes.length - 1;
        const availableWidth = containerWidth - (totalHandles * handleWidth);
        const equalWidth = Math.floor(availableWidth / panes.length);
        
        panes.forEach(pane => {
            pane.style.width = `${equalWidth}px`;
            pane.style.flex = 'none';
            
            if (this.onResizeEnd) {
                this.onResizeEnd(pane.id, equalWidth);
            }
        });
        
        this.update();
    }

    // Resize handle creation and management
    createResizeHandle(leftPane, rightPane) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.leftPane = leftPane;
        handle.rightPane = rightPane;
        
        handle.addEventListener('mousedown', (e) => this.startResize(e, handle));
        handle.addEventListener('dblclick', (e) => this.autoSize(e, handle));
        handle.addEventListener('touchstart', (e) => this.startResize(e, handle));
        
        handle.style.cssText = `
            opacity: 0.8;
            position: relative;
            z-index: 1000;
            cursor: col-resize;
            min-height: 100%;
            width: 6px;
            flex-shrink: 0;
        `;
        handle.title = 'Drag to resize | Double-click to auto-size';
        
        return handle;
    }

    startResize(e, handle) {
        if (this.maximizedPane) {
            console.log('⚠️ Resize blocked - pane is maximized');
            return;
        }
        
        e.preventDefault();
        this.isResizing = true;
        this.currentHandle = handle;
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.startX = clientX;
        this.leftPaneStartWidth = handle.leftPane.offsetWidth;
        this.rightPaneStartWidth = handle.rightPane.offsetWidth;
        
        document.body.classList.add('resizing');
        handle.classList.add('dragging');
        this.showWidthTooltip(e);
    }

    handleResize(e) {
        if (!this.isResizing || this.maximizedPane) return;
        
        e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const deltaX = clientX - this.startX;

        const leftPane = this.currentHandle.leftPane;
        const rightPane = this.currentHandle.rightPane;
        const minWidth = 250;
        
        let newLeftWidth = Math.max(minWidth, this.leftPaneStartWidth + deltaX);
        let newRightWidth = Math.max(minWidth, this.rightPaneStartWidth - deltaX);
        
        // Ensure minimum widths
        const totalWidth = newLeftWidth + newRightWidth;
        const requiredWidth = this.leftPaneStartWidth + this.rightPaneStartWidth;
        
        if (totalWidth !== requiredWidth) {
            const ratio = requiredWidth / totalWidth;
            newLeftWidth *= ratio;
            newRightWidth *= ratio;
        }

        leftPane.style.width = `${newLeftWidth}px`;
        leftPane.style.flex = 'none';
        rightPane.style.width = `${newRightWidth}px`;
        rightPane.style.flex = 'none';
        
        this.updateWidthTooltip(e, newLeftWidth, newRightWidth);
    }

    stopResize() {
        if (!this.isResizing) return;
        
        if (this.currentHandle && this.onResizeEnd) {
            const leftPane = this.currentHandle.leftPane;
            const rightPane = this.currentHandle.rightPane;
            this.onResizeEnd(leftPane.id, leftPane.offsetWidth);
            this.onResizeEnd(rightPane.id, rightPane.offsetWidth);
        }
        
        this.isResizing = false;
        document.body.classList.remove('resizing');
        if (this.currentHandle) {
            this.currentHandle.classList.remove('dragging');
        }
        this.currentHandle = null;
        this.hideWidthTooltip();
    }

    autoSize(e, handle) {
        if (this.maximizedPane) return;
        
        e.preventDefault();
        const leftPane = handle.leftPane;
        const rightPane = handle.rightPane;
        const totalWidth = leftPane.offsetWidth + rightPane.offsetWidth;
        const equalWidth = Math.floor(totalWidth / 2);

        leftPane.style.width = `${equalWidth}px`;
        leftPane.style.flex = 'none';
        rightPane.style.width = `${equalWidth}px`;
        rightPane.style.flex = 'none';

        if (this.onResizeEnd) {
            this.onResizeEnd(leftPane.id, equalWidth);
            this.onResizeEnd(rightPane.id, equalWidth);
        }
    }

    // Tooltip methods
    showWidthTooltip(e) {
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.tooltip.style.left = `${clientX + 15}px`;
        this.tooltip.style.top = `${e.clientY + 15}px`;
        this.tooltip.classList.add('visible');
    }

    updateWidthTooltip(e, leftWidth, rightWidth) {
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.tooltip.textContent = `${Math.round(leftWidth)}px | ${Math.round(rightWidth)}px`;
        this.tooltip.style.left = `${clientX + 15}px`;
        this.tooltip.style.top = `${e.clientY + 15}px`;
    }

    hideWidthTooltip() {
        this.tooltip.classList.remove('visible');
    }

    // Cleanup method
    destroy() {
        document.removeEventListener('mousemove', this.handleResizeEvent);
        document.removeEventListener('mouseup', this.stopResizeEvent);
        document.removeEventListener('touchmove', this.handleResizeEvent);
        document.removeEventListener('touchend', this.stopResizeEvent);
        
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
    }
}