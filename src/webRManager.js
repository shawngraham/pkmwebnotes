// src/webRManager.js

export class WebRManager {
    constructor() {
        this.webR = null;
        this.isLoading = false;
        this.initPromise = this.initWebR();
        this.statusUpdateCallback = null;
        this.executionCounter = 0;
    }

    setStatusCallback(callback) {
        this.statusUpdateCallback = callback;
    }

    updateStatus(status, message) {
        if (this.statusUpdateCallback) {
            this.statusUpdateCallback(status, message);
        }
    }

    async initWebR() {
        if (this.webR || this.isLoading) return this.webR;

        try {
            this.isLoading = true;
            this.updateStatus('loading', 'Loading R...');
            console.log("®️ webR loading...");

            const { WebR } = await import('https://webr.r-wasm.org/latest/webr.mjs');
            this.webR = new WebR();
            await this.webR.init();

            console.log("®️ webR loaded. Installing packages...");
            this.updateStatus('loading', 'Installing packages...');
            
            await this.webR.installPackages(['ggplot2', 'dplyr']);
            
            console.log("✅ webR and packages loaded successfully");
            this.updateStatus('ready', 'Ready');
            return this.webR;
        } catch (error) {
            console.error("❌ webR failed to load:", error);
            this.updateStatus('error', 'Failed to load');
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    async ensureReady() {
        if (!this.webR) {
            await this.initPromise;
        }
        return this.webR;
    }

    async executeCode(code) {
        await this.ensureReady();
        this.executionCounter++;

        const result = {
            stdout: '',
            stderr: '',
            plots: [],
            result: null,
            executionNumber: this.executionCounter
        };

        let shelter;
        let captured;
        try {
            shelter = await new this.webR.Shelter();

            const codeToExecute = `print({ ${code} })`;

            captured = await shelter.captureR(codeToExecute);
            
            // Process output messages (stdout, stderr)
            captured.output.forEach(msg => {
                // The 'print' wrapper adds some noise; we can filter it out if needed,
                // but for now, we'll keep it for clarity.
                if (msg.type === 'stdout') {
                    result.stdout += msg.data + '\n';
                } else if (msg.type === 'stderr') {
                    result.stderr += msg.data + '\n';
                }
            });

            // Process the captured plot images
            for (const img of captured.images) {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                result.plots.push(canvas.toDataURL('image/png').split(',')[1]); 
            }
            
            // The `print` wrapper means we no longer need to process `captured.result`.
            // The printed output of the result will be in `stdout`, which is what we want.

        } catch (error) {
            result.stderr = error.message;
        } finally {
            if (captured && captured.result) {
                this.webR.destroy(captured.result);
            }
            if (shelter) {
                await shelter.purge();
            }
        }

        return result;
    }
    
    formatOutput(execResult) {
        let outputHtml = '';
        let rawText = '';

        outputHtml += `<div class="output-header">
            <div class="execution-info"><span class="execution-number">[${execResult.executionNumber}]</span> <span>Executed</span></div>
            <button class="copy-output-btn" title="Copy output to clipboard">Copy</button>
        </div>`;

        if (execResult.stderr && execResult.stderr.trim()) {
            outputHtml += `<pre class="output-error">${this.escapeHtml(execResult.stderr.trim())}</pre>`;
            rawText += `Error:\n${execResult.stderr.trim()}\n`;
        }
        
        // The result is now part of stdout, so we only need to show stdout.
        if (execResult.stdout && execResult.stdout.trim()) {
            outputHtml += `<div class="output-label">Output & Result:</div>`;
            outputHtml += `<pre class="output-text">${this.escapeHtml(execResult.stdout.trim())}</pre>`;
            rawText += execResult.stdout.trim() + '\n';
        }
        
        if (execResult.plots && execResult.plots.length > 0) {
            execResult.plots.forEach((plotBase64, index) => {
                outputHtml += `<div class="plot-container">`;
                if (execResult.plots.length > 1) {
                    outputHtml += `<div class="output-label">Plot ${index + 1}:</div>`;
                }
                outputHtml += `<img src="data:image/png;base64,${plotBase64}" alt="R Plot ${index + 1}" />`;
                outputHtml += `<div class="plot-actions">
                    <button class="copy-plot-btn" title="Copy image to clipboard" data-plot-base64="${plotBase64}">Copy Image</button>
                    <button class="download-plot-btn" title="Download image as PNG" data-plot-base64="${plotBase64}" data-filename="r_plot_${execResult.executionNumber}_${index + 1}.png">Download</button>
                </div>`;
                outputHtml += `</div>`;
            });
        }
        
        // No longer need a separate `result` section as it's included in stdout
        
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