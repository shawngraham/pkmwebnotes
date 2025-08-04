// Debug version of ResizablePanes with console logging
class ResizablePanes {
    constructor(container) {
        console.log('🔧 ResizablePanes constructor called', container);
        this.container = container;
        this.isResizing = false;
        this.currentHandle = null;
        this.startX = 0;
        this.leftPaneStartWidth = 0;
        this.rightPaneStartWidth = 0;

        // Create the tooltip once
        this.createWidthTooltip();
        // Attach global listeners that live for the lifetime of the app
        this.attachGlobalListeners();
        
        // Callback for when resize ends - to be set by PKMApp
        this.onResizeEnd = null;
        
        console.log('✅ ResizablePanes initialized successfully');
    }

    createWidthTooltip() {
        const existing = document.getElementById('widthTooltip');
        if (existing) {
            console.log('📝 Width tooltip already exists, reusing it');
            this.tooltip = existing;
            return;
        }
        
        const tooltip = document.createElement('div');
        tooltip.id = 'widthTooltip';
        tooltip.className = 'width-tooltip';
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
        console.log('📝 Width tooltip created');
    }

    attachGlobalListeners() {
        console.log('🎯 Attaching global listeners');
        document.addEventListener('mousemove', this.handleResize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));
        document.addEventListener('touchmove', this.handleResize.bind(this), { passive: false });
        document.addEventListener('touchend', this.stopResize.bind(this));
        
        document.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                e.preventDefault();
            }
        });
    }

    /**
     * This is the main method to call whenever the panes are re-rendered.
     * It finds all panes, adds handles between them.
     */
    update() {
        console.log('🔄 ResizablePanes.update() called');
        
        // Remove all existing resize handles
        const existingHandles = this.container.querySelectorAll('.resize-handle');
        console.log(`🗑️ Removing ${existingHandles.length} existing handles`);
        existingHandles.forEach(handle => handle.remove());
        
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        console.log(`📊 Found ${panes.length} panes to work with`);
        
        // Add handles between panes
        panes.forEach((pane, index) => {
            console.log(`📋 Processing pane ${index}: ${pane.id}`);
            if (index < panes.length - 1) {
                const handle = this.createResizeHandle(pane, panes[index + 1]);
                const insertResult = pane.parentNode.insertBefore(handle, pane.nextSibling);
                console.log(`➕ Added resize handle between ${pane.id} and ${panes[index + 1].id}`);
                console.log(`📍 Handle inserted:`, insertResult);
                console.log(`📍 Handle parent:`, handle.parentNode);
                console.log(`📍 Handle position in DOM:`, Array.from(handle.parentNode.children).indexOf(handle));
            }
        });
        
        console.log('✅ ResizablePanes.update() completed');
    }

    /**
     * Apply stored widths to panes
     */
    applyStoredWidths(paneWidths) {
        console.log('📐 Applying stored widths:', paneWidths);
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        panes.forEach(pane => {
            const paneId = pane.id;
            const storedWidth = paneWidths.get(paneId);
            if (storedWidth) {
                pane.style.width = `${storedWidth}px`;
                pane.style.flex = 'none'; // Override flex behavior
                console.log(`📏 Applied width ${storedWidth}px to pane ${paneId}`);
            } else {
                console.log(`⚠️ No stored width for pane ${paneId}`);
            }
        });
    }

    /**
     * Reset all panes to equal widths
     */
    resetWidths() {
        console.log('🔄 Resetting all pane widths');
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        if (panes.length === 0) {
            console.log('⚠️ No panes found for reset');
            return;
        }
        
        const containerWidth = this.container.offsetWidth;
        const handleWidth = 6; // Width of resize handles
        const totalHandleWidth = (panes.length - 1) * handleWidth;
        const availableWidth = containerWidth - totalHandleWidth;
        const equalWidth = Math.floor(availableWidth / panes.length);
        
        console.log(`📊 Container: ${containerWidth}px, Available: ${availableWidth}px, Equal: ${equalWidth}px`);
        
        panes.forEach(pane => {
            pane.style.width = `${equalWidth}px`;
            if (this.onResizeEnd) {
                this.onResizeEnd(pane.id, equalWidth);
            }
            console.log(`📏 Reset pane ${pane.id} to ${equalWidth}px`);
        });
    }

    /**
     * Get current pane widths
     */
    getPaneWidths() {
        const panes = Array.from(this.container.querySelectorAll('.editor-container'));
        const widths = panes.map(pane => ({
            id: pane.id,
            width: pane.offsetWidth
        }));
        console.log('📊 Current pane widths:', widths);
        return widths;
    }

    createResizeHandle(leftPane, rightPane) {
        console.log(`🎚️ Creating resize handle between ${leftPane.id} and ${rightPane.id}`);
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        
        // Store references to the panes this handle controls
        handle.leftPane = leftPane;
        handle.rightPane = rightPane;
        
        handle.addEventListener('mousedown', (e) => {
            console.log('🖱️ Mouse down on resize handle');
            this.startResize(e, handle);
        });
        handle.addEventListener('dblclick', (e) => {
            console.log('🖱️ Double click on resize handle');
            this.autoSize(e, handle);
        });
        handle.addEventListener('touchstart', (e) => {
            console.log('👆 Touch start on resize handle');
            this.startResize(e, handle);
        });
        
        // Enhanced debug styling to make handles more visible and grabbable
        //handle.style.backgroundColor = 'red';
        handle.style.opacity = '0.8';
        handle.style.position = 'relative';
        handle.style.zIndex = '1000';
        handle.style.cursor = 'col-resize';
        handle.style.minHeight = '100%';
        handle.style.width = '6px';
        handle.style.flexShrink = '0';
        handle.title = 'Drag to resize | Double-click to auto-size';
        
        console.log('✅ Resize handle created and event listeners attached');
        return handle;
    }

    startResize(e, handle) {
        console.log('🚀 Starting resize operation');
        e.preventDefault();
        this.isResizing = true;
        this.currentHandle = handle;
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.startX = clientX;
        
        // Store the initial widths of the two panes being resized
        this.leftPaneStartWidth = this.currentHandle.leftPane.offsetWidth;
        this.rightPaneStartWidth = this.currentHandle.rightPane.offsetWidth;
        
        console.log(`📊 Start widths - Left: ${this.leftPaneStartWidth}px, Right: ${this.rightPaneStartWidth}px`);

        document.body.classList.add('resizing');
        handle.classList.add('dragging');
        this.showWidthTooltip(e);
    }

    handleResize(e) {
        if (!this.isResizing) return;
        
        e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const deltaX = clientX - this.startX;

        const leftPane = this.currentHandle.leftPane;
        const rightPane = this.currentHandle.rightPane;

        const minWidth = 250; // Minimum pane width
        
        let newLeftWidth = this.leftPaneStartWidth + deltaX;
        let newRightWidth = this.rightPaneStartWidth - deltaX;

        // Enforce minimum width constraints
        if (newLeftWidth < minWidth) {
            newRightWidth += newLeftWidth - minWidth;
            newLeftWidth = minWidth;
        }
        if (newRightWidth < minWidth) {
            newLeftWidth += newRightWidth - minWidth;
            newRightWidth = minWidth;
        }

        // Override flex with explicit width
        leftPane.style.width = `${newLeftWidth}px`;
        leftPane.style.flex = 'none';
        rightPane.style.width = `${newRightWidth}px`;
        rightPane.style.flex = 'none';
        
        this.updateWidthTooltip(e, newLeftWidth, newRightWidth);
        
        // Debug logging (only every 10th resize event to avoid spam)
        if (Math.abs(deltaX) % 10 < 2) {
            console.log(`📏 Resizing - Delta: ${deltaX}px, Left: ${newLeftWidth}px, Right: ${newRightWidth}px`);
        }
    }

    stopResize() {
        if (!this.isResizing) return;
        
        console.log('🛑 Stopping resize operation');

        // Call the callback to save widths
        if (this.currentHandle && this.onResizeEnd) {
            const leftPane = this.currentHandle.leftPane;
            const rightPane = this.currentHandle.rightPane;
            console.log(`💾 Saving widths - Left: ${leftPane.offsetWidth}px, Right: ${rightPane.offsetWidth}px`);
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
        console.log('✅ Resize operation completed');
    }

    autoSize(e, handle) {
        console.log('⚖️ Auto-sizing panes');
        e.preventDefault();
        const leftPane = handle.leftPane;
        const rightPane = handle.rightPane;
        
        const totalWidth = leftPane.offsetWidth + rightPane.offsetWidth;
        const equalWidth = Math.floor(totalWidth / 2);
        
        console.log(`📊 Total width: ${totalWidth}px, Equal width: ${equalWidth}px`);

        leftPane.style.width = `${equalWidth}px`;
        leftPane.style.flex = 'none';
        rightPane.style.width = `${equalWidth}px`;
        rightPane.style.flex = 'none';

        if (this.onResizeEnd) {
            this.onResizeEnd(leftPane.id, equalWidth);
            this.onResizeEnd(rightPane.id, equalWidth);
        }
        
        console.log('✅ Auto-size completed');
    }

    // --- Tooltip Methods ---

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
}