// pyodideManager.js

// PyodideManager class - handles Python code execution with isolated state per note
export class PyodideManager {
    constructor() {
        this.pyodide = null;
        this.isLoading = false;
        this.noteStates = new Map(); // Isolated state per note
        this.executionCounters = new Map(); // Track execution count per note
        this.initPromise = this.initPyodide();
        this.statusUpdateCallback = null; // Callback for status updates
    }

    // Set callback for status updates
    setStatusCallback(callback) {
        this.statusUpdateCallback = callback;
    }

    // Update status in UI
    updateStatus(status, message) {
        if (this.statusUpdateCallback) {
            this.statusUpdateCallback(status, message);
        }
    }

    async initPyodide() {
        if (this.pyodide || this.isLoading) return this.pyodide;
        
        try {
            this.isLoading = true;
            this.updateStatus('loading', 'Loading Python...');
            console.log("🐍 Pyodide loading...");
            
            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
            });
            
            console.log("🐍 Pyodide loaded. Installing packages...");
            this.updateStatus('loading', 'Installing packages...');
            
            await this.pyodide.loadPackage(["pandas", "numpy", "matplotlib", "micropip"]);
            console.log("✅ Pyodide and packages loaded successfully");
            
            // This setup is now minimal, as the main helpers will be in the note state
            await this.pyodide.runPythonAsync(`
import matplotlib.pyplot as plt
plt.ioff()  # Turn off interactive mode
            `);
            
            this.updateStatus('ready', 'Ready');
            return this.pyodide;
        } catch (error) {
            console.error("❌ Pyodide failed to load:", error);
            this.updateStatus('error', 'Failed to load');
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    async ensureReady() {
        if (!this.pyodide) {
            await this.initPromise;
        }
        return this.pyodide;
    }

    getOrCreateNoteState(noteId) {
        if (!this.noteStates.has(noteId)) {
            const namespace = this.pyodide.globals.get('dict')();
            
            // Define all necessary components, including the helper function, in the note's isolated namespace
            this.pyodide.runPython(`
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from io import StringIO, BytesIO
import json
import csv
import micropip
import base64

plt.ioff()

# Helper to convert a Matplotlib figure to a base64 PNG string
# This function MUST be defined in each note's namespace to be accessible
def _convert_fig_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')
            `, { globals: namespace });
            
            this.noteStates.set(noteId, namespace);
            console.log(`🗂️ Created isolated state for note ${noteId}`);
        }
        return this.noteStates.get(noteId);
    }

    clearNoteState(noteId) {
        if (this.noteStates.has(noteId)) {
            const namespace = this.noteStates.get(noteId);
            namespace.destroy();
            this.noteStates.delete(noteId);
            this.executionCounters.delete(noteId);
            console.log(`🗑️ Cleared state for note ${noteId}`);
        }
    }

    // Get next execution number for a note
    getNextExecutionNumber(noteId) {
        const current = this.executionCounters.get(noteId) || 0;
        const next = current + 1;
        this.executionCounters.set(noteId, next);
        return next;
    }

    // Get current execution number for a note
    getCurrentExecutionNumber(noteId) {
        return this.executionCounters.get(noteId) || 0;
    }

    async executeCode(code, noteId, blockIndex) {
        await this.ensureReady();
        
        const namespace = this.getOrCreateNoteState(noteId);
        const executionNumber = this.getNextExecutionNumber(noteId);
        let stdout = '';
        let result = null;
        let plots = [];
        
        this.pyodide.setStdout({ 
            batched: (str) => { stdout += str + "\n"; } 
        });

        try {
            // Capture matplotlib figures before execution
            await this.pyodide.runPythonAsync(`
_captured_figures = []
_original_show = plt.show

def _capture_show(*args, **kwargs):
    figs = [plt.figure(i) for i in plt.get_fignums()]
    for fig in figs:
        # This will now correctly find the helper function in the note's namespace
        _captured_figures.append(_convert_fig_to_base64(fig))
    plt.close('all')

plt.show = _capture_show
            `, { globals: namespace });

            // Handle data_url directive
            const dataUrlMatch = code.match(/^\s*#\s*data_url:\s*['"]?(https?:\/\/[^\s\r\n'"]+)['"]?/m);
            
            if (dataUrlMatch) {
                console.log("🌐 Found data_url directive:", dataUrlMatch[1]);
                
                const dataUrl = dataUrlMatch[1].trim();
                const response = await fetch(dataUrl);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
                }
                
                const csvData = await response.text();
                console.log(`📊 Fetched ${csvData.length} characters of data`);
                
                // Make data available in the namespace
                namespace.set('fetched_data', csvData);
                
                // Remove the data_url line and execute remaining code
                const codeToExecute = code.replace(/^\s*#\s*data_url:.*$/m, '').trim();
                
                if (codeToExecute) {
                    result = await this.pyodide.runPythonAsync(codeToExecute, { globals: namespace });
                }
                
                // Clean up
                namespace.delete('fetched_data');
                
            } else {
                // Regular code execution
                result = await this.pyodide.runPythonAsync(code, { globals: namespace });
            }

            // Check if the result itself is a matplotlib figure
            if (result && typeof result.toJs === 'function' && result.type === "<class 'matplotlib.figure.Figure'>") {
                // FIX: Get the helper function from the note's namespace, not the global one.
                plots.push(namespace.get('_convert_fig_to_base64')(result));
                result.destroy();
                result = null; // Don't show figure as text result
            }

            // Capture any figures created during execution
            const capturedFigures = await this.pyodide.runPythonAsync(`
figures = _captured_figures.copy()
_captured_figures.clear()
figures
            `, { globals: namespace });

            if (capturedFigures && capturedFigures.length > 0) {
                plots.push(...capturedFigures.toJs());
                capturedFigures.destroy();
            }

            // Restore original plt.show
            await this.pyodide.runPythonAsync(`
plt.show = _original_show
            `, { globals: namespace });
            
        } catch (error) {
            throw error;
        } finally {
            this.pyodide.setStdout({});
        }

        return { 
            result, 
            stdout: stdout.trim(), 
            executionNumber,
            blockIndex,
            plots
        };
    }

    formatOutput(result, stdout, executionNumber, plots) {
        let outputHtml = '';
        let rawText = ''; // <-- ADD: Variable to hold raw text for copying

        // Add execution info (not included in raw text)
        outputHtml += `<div class="output-header">
            <div class="execution-info"><span class="execution-number">[${executionNumber}]</span> <span>Executed</span></div>
            <button class="copy-output-btn" title="Copy output to clipboard">Copy</button>
        </div>`;
        
        // Add stdout if present
        if (stdout) {
            outputHtml += `<div class="output-label">Output:</div>`;
            outputHtml += `<pre class="output-text">${this.escapeHtml(stdout)}</pre>`;
            rawText += stdout + '\n'; 
        }
        
        // Add plots if present (cannot be copied as text, so we add a note)
                if (plots && plots.length > 0) {
            plots.forEach((plotBase64, index) => {
                outputHtml += `<div class="plot-container">`;
                if (plots.length > 1) {
                    outputHtml += `<div class="output-label">Plot ${index + 1}:</div>`;
                }
                outputHtml += `<img src="data:image/png;base64,${plotBase64}" alt="Plot ${index + 1}" />`;
                // Add the new action buttons for each plot
                outputHtml += `<div class="plot-actions">
                    <button class="copy-plot-btn" title="Copy image to clipboard" data-plot-base64="${plotBase64}">Copy Image</button>
                    <button class="download-plot-btn" title="Download image as PNG" data-plot-base64="${plotBase64}" data-filename="plot_${executionNumber}_${index + 1}.png">Download</button>
                </div>`;
                outputHtml += `</div>`;
            });
        }
        
        if (result !== undefined && result !== null) {
            let resultStr = '';
            try {
                if (typeof result.to_html === 'function') {
                    outputHtml += `<div class="output-label">Result:</div>`;
                    outputHtml += result.to_html();
                    resultStr = result.to_string ? result.to_string() : String(result);
                    result.destroy(); 
                } else if (typeof result.toString === 'function') {
                    resultStr = result.toString();
                    if (resultStr !== 'undefined' && resultStr.trim() !== '') {
                        outputHtml += `<div class="output-label">Result:</div>`;
                        outputHtml += `<pre class="output-result">${this.escapeHtml(resultStr)}</pre>`;
                    }
                }
            } catch (error) { /* ... */ }
            if (resultStr.trim() !== '') {
                 rawText += `Result:\n${resultStr}`;
            }
        }
        
        const finalHtml = outputHtml || "<pre>Code executed successfully.</pre>";
        
        return {
            html: finalHtml,
            rawText: rawText.trim()
        };
    }

       escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 