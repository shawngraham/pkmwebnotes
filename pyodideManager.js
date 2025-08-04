// PyodideManager class - handles Python code execution with isolated state per note
export class PyodideManager {
    constructor() {
        this.pyodide = null;
        this.isLoading = false;
        this.noteStates = new Map(); // Isolated state per note
        this.initPromise = this.initPyodide();
    }

    async initPyodide() {
        if (this.pyodide || this.isLoading) return this.pyodide;
        
        try {
            this.isLoading = true;
            console.log("🐍 Pyodide loading...");
            
            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
            });
            
            console.log("🐍 Pyodide loaded. Installing packages...");
            await this.pyodide.loadPackage(["pandas", "numpy", "matplotlib", "micropip"]);
            console.log("✅ Pyodide and packages loaded successfully");
            
            // Set up default imports
            await this.pyodide.runPythonAsync(`
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from io import StringIO
import json
import csv
import micropip
plt.ioff()  # Turn off interactive mode
            `);
            
            return this.pyodide;
        } catch (error) {
            console.error("❌ Pyodide failed to load:", error);
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
            
            // Add common imports to each namespace
            this.pyodide.runPython(`
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from io import StringIO
import json
import csv
import micropip
plt.ioff()
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
            console.log(`🗑️ Cleared state for note ${noteId}`);
        }
    }

    async executeCode(code, noteId) {
        await this.ensureReady();
        
        const namespace = this.getOrCreateNoteState(noteId);
        let stdout = '';
        let result = null;
        
        this.pyodide.setStdout({ 
            batched: (str) => { stdout += str + "\n"; } 
        });

        try {
            // Check for data_url directive - FIXED REGEX AND LOGIC
            const dataUrlMatch = code.match(/^\s*#\s*data_url:\s*(https?:\/\/[^\s\r\n]+)/m);
            
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
            
        } catch (error) {
            throw error;
        } finally {
            this.pyodide.setStdout({});
        }

        return { result, stdout: stdout.trim() };
    }

    formatOutput(result, stdout) {
        let outputHtml = '';
        
        if (stdout) {
            outputHtml += `<pre class="output-text">${this.escapeHtml(stdout)}</pre>`;
        }
        
        if (result !== undefined && result !== null) {
            try {
                if (typeof result.to_html === 'function') {
                    outputHtml += result.to_html();
                    result.destroy(); // Clean up pyodide proxy
                } else if (typeof result.toString === 'function') {
                    const resultStr = result.toString();
                    if (resultStr !== 'undefined') {
                        outputHtml += `<pre class="output-result">${this.escapeHtml(resultStr)}</pre>`;
                    }
                }
            } catch (error) {
                console.warn("Error formatting result:", error);
                outputHtml += `<pre class="output-result">${this.escapeHtml(String(result))}</pre>`;
            }
        }
        
        return outputHtml || "<pre>Code executed successfully.</pre>";
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}