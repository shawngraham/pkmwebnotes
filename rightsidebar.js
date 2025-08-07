// rightsidebar.js

export class RightSidebar {
    constructor(toggleButtonId, mainContainerSelector, resizablePanes) {
        this.toggleButton = document.getElementById(toggleButtonId);
        this.mainContainer = document.querySelector(mainContainerSelector);
        this.resizablePanes = resizablePanes; // Store the resizablePanes instance

        if (!this.toggleButton || !this.mainContainer) {
            console.error("Sidebar elements not found!");
            return;
        }

        this.init();
    }

    init() {
        this.toggleButton.addEventListener('click', () => this.toggle());
    }

    toggle() {
        this.mainContainer.classList.toggle('right-sidebar-collapsed');

        // After the animation, tell the resizable panes to update.
        // The timeout should match your CSS transition duration.
        setTimeout(() => {
            if (this.resizablePanes && typeof this.resizablePanes.update === 'function') {
                this.resizablePanes.update();
            }
            // A general resize event can also help other components adjust.
            window.dispatchEvent(new Event('resize')); 
        }, 300); // 300ms matches the transition duration
    }
}