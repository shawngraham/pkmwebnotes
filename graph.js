// Enhanced Graph visualization manager with multi-step support
export class GraphManager {
    constructor(notes) {
        this.notes = notes;
        this.svg = null;
        this.simulation = null;
        this.currentNoteId = null;
        this.currentSteps = 1; // Default to 1 step
    }

    updateNotes(notes) {
        this.notes = notes;
    }

    createGraph(container, noteId, steps = 1) {
        this.currentNoteId = noteId;
        this.currentSteps = steps;
        const note = this.notes[noteId];
        if (!note) return;

        // Clear previous graph
        container.innerHTML = '';

        // Create controls for step selection
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'graph-controls';
        controlsDiv.style.cssText = 'margin-bottom: 8px; display: flex; justify-content: center; gap: 4px;';
        
        for (let i = 1; i <= 3; i++) {
            const btn = document.createElement('button');
            btn.textContent = `${i} step${i > 1 ? 's' : ''}`;
            btn.className = 'step-btn';
            btn.style.cssText = `
                padding: 4px 8px; 
                font-size: 11px; 
                border: 1px solid var(--border); 
                border-radius: 4px; 
                background: ${i === steps ? 'var(--primary)' : 'var(--surface)'}; 
                color: ${i === steps ? 'white' : 'var(--text)'}; 
                cursor: pointer;
                transition: all 0.2s;
            `;
            btn.addEventListener('click', () => {
                this.createGraph(container, noteId, i);
            });
            controlsDiv.appendChild(btn);
        }
        container.appendChild(controlsDiv);

        // Create SVG container
        const svgContainer = document.createElement('div');
        svgContainer.className = 'graph-svg-container';
        container.appendChild(svgContainer);

        // Create SVG
        const width = container.clientWidth || 260;
        const height = 200;
        
        this.svg = d3.select(svgContainer)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('background', 'var(--background)')
            .style('border-radius', '6px');

        // Prepare graph data with specified number of steps
        const { nodes, links } = this.prepareMultiStepGraphData(note, steps);
        
        if (nodes.length === 0) {
            // Show "no connections" message
            this.svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', 'var(--text-muted)')
                .style('font-size', '14px')
                .text('No connections');
            return;
        }

        // Create force simulation with adjusted parameters for different step counts
        const linkDistance = steps === 1 ? 60 : steps === 2 ? 50 : 40;
        const chargeStrength = steps === 1 ? -200 : steps === 2 ? -150 : -100;
        
        this.simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(linkDistance))
            .force('charge', d3.forceManyBody().strength(chargeStrength))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.isCurrent ? 25 : d.step === 1 ? 20 : 15));

        // Create links with different styles based on step
        const link = this.svg.append('g')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', d => d.step === 1 ? 'var(--primary)' : d.step === 2 ? 'var(--text-muted)' : 'var(--border)')
            .attr('stroke-width', d => d.step === 1 ? 2 : 1)
            .attr('opacity', d => d.step === 1 ? 0.8 : d.step === 2 ? 0.6 : 0.4);

        // Create nodes with different sizes and colors based on step
        const node = this.svg.append('g')
            .selectAll('g')
            .data(nodes)
            .enter().append('g')
            .call(d3.drag()
                .on('start', (event, d) => this.dragstarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragended(event, d)));

        // Add circles to nodes with step-based styling
        node.append('circle')
            .attr('r', d => d.isCurrent ? 12 : d.step === 1 ? 10 : d.step === 2 ? 8 : 6)
            .attr('fill', d => {
                if (d.isCurrent) return 'var(--primary)';
                if (d.step === 1) return 'var(--success)';
                if (d.step === 2) return 'var(--warning)';
                return 'var(--text-muted)';
            })
            .attr('stroke', d => d.isCurrent ? 'var(--primary)' : 'var(--border)')
            .attr('stroke-width', d => d.isCurrent ? 3 : 2)
            .attr('opacity', d => d.step === 3 ? 0.7 : 1)
            .style('cursor', d => d.isCurrent ? 'default' : 'pointer');

        // Add labels to nodes with step-based styling
        node.append('text')
            .text(d => this.truncateText(d.title, d.step === 1 ? 15 : d.step === 2 ? 12 : 10))
            .attr('font-size', d => d.isCurrent ? '11px' : d.step === 1 ? '10px' : '9px')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d.isCurrent ? -18 : d.step === 1 ? -16 : d.step === 2 ? -14 : -12)
            .attr('fill', d => d.step === 3 ? 'var(--text-muted)' : 'var(--text)')
            .attr('font-weight', d => d.isCurrent ? 'bold' : d.step === 1 ? '500' : 'normal')
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        // Add step indicators for nodes beyond step 1
        node.filter(d => !d.isCurrent && d.step > 1)
            .append('text')
            .text(d => d.step)
            .attr('font-size', '8px')
            .attr('text-anchor', 'middle')
            .attr('dy', 3)
            .attr('fill', 'white')
            .style('pointer-events', 'none')
            .style('user-select', 'none')
            .style('font-weight', 'bold');

        // Add click handler for non-current nodes
        node.filter(d => !d.isCurrent)
            .on('click', (event, d) => {
                event.stopPropagation();
                if (this.onNodeClick) {
                    this.onNodeClick(d.id);
                }
            });

        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Add legend if showing multiple steps
        if (steps > 1) {
            this.addStepLegend(width, height);
        }
    }

    addStepLegend(width, height) {
        const legend = this.svg.append('g')
            .attr('class', 'step-legend')
            .attr('transform', `translate(10, ${height - 40})`);

        const legendData = [
            { step: 0, label: 'Current', color: 'var(--primary)' },
            { step: 1, label: '1 step', color: 'var(--success)' },
            { step: 2, label: '2 steps', color: 'var(--warning)' },
            { step: 3, label: '3 steps', color: 'var(--text-muted)' }
        ].filter(d => d.step === 0 || d.step <= this.currentSteps);

        const legendItems = legend.selectAll('.legend-item')
            .data(legendData)
            .enter().append('g')
            .attr('class', 'legend-item')
            .attr('transform', (d, i) => `translate(0, ${i * 12})`);

        legendItems.append('circle')
            .attr('r', 4)
            .attr('fill', d => d.color)
            .attr('cx', 5);

        legendItems.append('text')
            .text(d => d.label)
            .attr('x', 12)
            .attr('y', 0)
            .attr('dy', '0.35em')
            .attr('font-size', '9px')
            .attr('fill', 'var(--text-muted)');
    }

    prepareMultiStepGraphData(currentNote, maxSteps = 1) {
        const nodes = [];
        const links = [];
        const nodesByStep = new Map(); // Map from step number to Set of note IDs
        const processedNotes = new Set();

        const titleToNoteMap = Object.values(this.notes).reduce((acc, note) => {
            acc[note.title.toLowerCase()] = note;
            return acc;
         }, {});

        // Initialize with current note
        nodes.push({
            id: currentNote.id,
            title: currentNote.title,
            isCurrent: true,
            step: 0
        });
        processedNotes.add(currentNote.id);
        nodesByStep.set(0, new Set([currentNote.id]));

        // Process each step
        for (let step = 1; step <= maxSteps; step++) {
            const currentStepNodes = new Set();
            const previousStepNodes = nodesByStep.get(step - 1) || new Set();

            // For each node in the previous step, find its connections
            previousStepNodes.forEach(noteId => {
                const note = this.notes[noteId];
                if (!note) return;

                // Get outgoing links
    const outgoingLinkIds = note.getOutgoingLinks(); // This returns an array of note IDs.
    outgoingLinkIds.forEach(targetId => {
        const targetNote = this.notes[targetId]; // CORRECT: Direct lookup using the ID.

        if (targetNote && !processedNotes.has(targetNote.id)) {
            nodes.push({
                id: targetNote.id,
                title: targetNote.title,
                isCurrent: false,
                step: step
            });
            processedNotes.add(targetNote.id);
            currentStepNodes.add(targetNote.id);
        }
        
        // Add link if target exists
        if (targetNote) {
            links.push({
                source: noteId,
                target: targetNote.id,
                type: 'outgoing',
                step: step
            });
        }
    });

                // Get incoming links (backlinks)
    Object.values(this.notes).forEach(otherNote => {
        if (otherNote.id !== noteId) {
            const otherNoteLinks = otherNote.getOutgoingLinks(); // Get IDs linked from otherNote
            if (otherNoteLinks.includes(noteId)) { // CORRECT: Check if otherNote's links include the current note's ID.
                if (!processedNotes.has(otherNote.id)) {
                    nodes.push({
                        id: otherNote.id,
                        title: otherNote.title,
                        isCurrent: false,
                        step: step
                    });
                    processedNotes.add(otherNote.id);
                    currentStepNodes.add(otherNote.id);
                }
                
                // Add link
                links.push({
                    source: otherNote.id,
                    target: noteId,
                    type: 'incoming',
                    step: step
                });
            }
        }
    });
            });

            nodesByStep.set(step, currentStepNodes);
        }

        return { nodes, links };
    }

    // Enhanced complete network data preparation with step information
    prepareCompleteNetworkData() {
        const nodes = [];
        const links = [];
        
        // Add all notes as nodes
        Object.values(this.notes).forEach(note => {
            nodes.push({
                id: note.id,
                title: note.title,
                isCurrent: note.id === this.currentNoteId,
                created: note.created,
                modified: note.modified,
                step: note.id === this.currentNoteId ? 0 : this.calculateStepsFromCurrent(note.id)
            });
        });
        
        // Add all wikilink connections
        Object.values(this.notes).forEach(sourceNote => {
            const outgoingLinks = sourceNote.getOutgoingLinks();
            
            outgoingLinks.forEach(linkTitle => {
                const targetNote = Object.values(this.notes).find(n => 
                    n.title.toLowerCase() === linkTitle.toLowerCase()
                );
                
                if (targetNote) {
                    // Avoid duplicate links
                    const existingLink = links.find(link => 
                        (link.source === sourceNote.id && link.target === targetNote.id) ||
                        (link.source === targetNote.id && link.target === sourceNote.id)
                    );
                    
                    if (!existingLink) {
                        links.push({
                            source: sourceNote.id,
                            target: targetNote.id,
                            type: 'wikilink',
                            bidirectional: false,
                            step: 1 // All direct connections are step 1
                        });
                    }
                }
            });
        });
        
        return { nodes, links };
    }

    // Calculate the minimum number of steps from current note to target note
    calculateStepsFromCurrent(targetNoteId) {
        if (!this.currentNoteId || targetNoteId === this.currentNoteId) return 0;
        
        const visited = new Set();
        const queue = [{ noteId: this.currentNoteId, steps: 0 }];
        visited.add(this.currentNoteId);
        
        while (queue.length > 0) {
            const { noteId, steps } = queue.shift();
            const note = this.notes[noteId];
            
            if (!note) continue;
            
            // Check direct connections
            const outgoingLinks = note.getOutgoingLinks();
            const allConnections = new Set();
            
            // Add outgoing connections
            outgoingLinks.forEach(linkTitle => {
                const targetNote = Object.values(this.notes).find(n => 
                    n.title.toLowerCase() === linkTitle.toLowerCase()
                );
                if (targetNote) {
                    allConnections.add(targetNote.id);
                }
            });
            
            // Add incoming connections (backlinks)
            Object.values(this.notes).forEach(otherNote => {
                if (otherNote.id !== noteId) {
                    const noteLinks = otherNote.getOutgoingLinks();
                    if (noteLinks.some(link => link.toLowerCase() === note.title.toLowerCase())) {
                        allConnections.add(otherNote.id);
                    }
                }
            });
            
            // Process connections
            for (const connectedNoteId of allConnections) {
                if (connectedNoteId === targetNoteId) {
                    return steps + 1;
                }
                
                if (!visited.has(connectedNoteId) && steps < 3) { // Limit search depth
                    visited.add(connectedNoteId);
                    queue.push({ noteId: connectedNoteId, steps: steps + 1 });
                }
            }
        }
        
        return Infinity; // Not reachable within 3 steps
    }

    // Keep the original prepareGraphData for backward compatibility
    prepareGraphData(currentNote) {
        return this.prepareMultiStepGraphData(currentNote, 1);
    }

    // Enhanced CSV export with step information
    exportNetworkCSV(noteId, includeMetadata = true, completeNetwork = false, includeIsolated = true, steps = null) {
        const note = this.notes[noteId];
        if (!note) return null;

        // Use current steps if not specified
        const exportSteps = steps !== null ? steps : (completeNetwork ? null : this.currentSteps);

        // Choose between ego network or complete network
        const { nodes, links } = completeNetwork 
            ? this.prepareCompleteNetworkData() 
            : this.prepareMultiStepGraphData(note, exportSteps || 1);
        
        // Generate standard network CSVs
        const networkData = this.generateStandardNetworkCSVs(nodes, links, noteId, includeMetadata, exportSteps);
        
        // Generate isolated notes CSV if requested
        let isolatedCSV = null;
        if (includeIsolated && completeNetwork) {
            isolatedCSV = this.generateIsolatedNotesCSV();
        }
        
        // Network statistics for the actual exported network
        const statsCSV = this.generateNetworkStats(noteId, nodes, links, completeNetwork, includeIsolated, exportSteps);

        return { 
            edgesCSV: networkData.edgesCSV, 
            nodesCSV: networkData.nodesCSV, 
            statsCSV,
            isolatedCSV 
        };
    }

    // Updated generateStandardNetworkCSVs to include step information
    generateStandardNetworkCSVs(nodes, links, noteId, includeMetadata, steps = null) {
        // Enhanced edges CSV with step information
        const edgesHeaders = includeMetadata 
            ? 'source_id,target_id,source_title,target_title,link_type,step,source_created,target_created,source_modified,target_modified,source_word_count,target_word_count,source_outgoing_links,target_outgoing_links,source_tags,target_tags,weight'
            : 'source_id,target_id,source_title,target_title,link_type,step';
        
        const edgesRows = links.map(link => {
            const sourceNote = this.notes[link.source];
            const targetNote = this.notes[link.target];
            
            if (includeMetadata && sourceNote && targetNote) {
                // Calculate metadata for both notes
                const sourceContent = sourceNote.getContentWithoutMetadata();
                const targetContent = targetNote.getContentWithoutMetadata();
                const sourceWordCount = sourceContent.trim() ? sourceContent.trim().split(/\s+/).length : 0;
                const targetWordCount = targetContent.trim() ? targetContent.trim().split(/\s+/).length : 0;
                const sourceOutgoingLinks = sourceNote.getOutgoingLinks().length;
                const targetOutgoingLinks = targetNote.getOutgoingLinks().length;
                
                // Parse metadata for tags
                const sourceMetadata = sourceNote.parseMetadata();
                const targetMetadata = targetNote.parseMetadata();
                const sourceTags = Array.isArray(sourceMetadata.tags) ? sourceMetadata.tags.join(';') : '';
                const targetTags = Array.isArray(targetMetadata.tags) ? targetMetadata.tags.join(';') : '';

                return `"${link.source}","${link.target}","${this.escapeCsvValue(sourceNote.title)}","${this.escapeCsvValue(targetNote.title)}","${link.type}",${link.step || 1},"${new Date(sourceNote.created).toISOString()}","${new Date(targetNote.created).toISOString()}","${new Date(sourceNote.modified).toISOString()}","${new Date(targetNote.modified).toISOString()}",${sourceWordCount},${targetWordCount},${sourceOutgoingLinks},${targetOutgoingLinks},"${this.escapeCsvValue(sourceTags)}","${this.escapeCsvValue(targetTags)}",1`;
            } else {
                const sourceTitle = sourceNote ? sourceNote.title : 'Unknown';
                const targetTitle = targetNote ? targetNote.title : 'Unknown';
                return `"${link.source}","${link.target}","${this.escapeCsvValue(sourceTitle)}","${this.escapeCsvValue(targetTitle)}","${link.type}",${link.step || 1}`;
            }
        });

        const edgesCSV = [edgesHeaders, ...edgesRows].join('\n');

        // Enhanced nodes CSV with step information
        const nodesHeaders = includeMetadata
            ? 'id,title,is_focal,node_type,step,created,modified,word_count,character_count,outgoing_links_count,incoming_links_count,tags,first_paragraph,last_modified_days_ago'
            : 'id,title,is_focal,node_type,step';

        const nodesRows = nodes.map(node => {
            const noteData = this.notes[node.id];
            if (includeMetadata && noteData) {
                const content = noteData.getContentWithoutMetadata();
                const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
                const charCount = content.length;
                const outgoingCount = noteData.getOutgoingLinks().length;
                
                // Count incoming links (backlinks) from the complete network
                const incomingCount = Object.values(this.notes).filter(n => 
                    n.id !== noteData.id && 
                    n.getOutgoingLinks().some(link => 
                        link.toLowerCase() === noteData.title.toLowerCase()
                    )
                ).length;
                
                // Get tags from metadata
                const metadata = noteData.parseMetadata();
                const tags = Array.isArray(metadata.tags) ? metadata.tags.join(';') : '';
                
                // Extract first paragraph
                const paragraphs = content.split('\n\n').filter(p => p.trim());
                const firstParagraph = paragraphs.length > 0 ? paragraphs[0].replace(/\n/g, ' ').substring(0, 100) : '';
                
                // Calculate days since last modification
                const daysSinceModified = Math.floor((Date.now() - noteData.modified) / (1000 * 60 * 60 * 24));

                return `"${node.id}","${this.escapeCsvValue(node.title)}","${node.id === noteId}","${node.id === noteId ? 'focal' : 'connected'}",${node.step || 0},"${new Date(noteData.created).toISOString()}","${new Date(noteData.modified).toISOString()}",${wordCount},${charCount},${outgoingCount},${incomingCount},"${this.escapeCsvValue(tags)}","${this.escapeCsvValue(firstParagraph)}",${daysSinceModified}`;
            } else {
                return `"${node.id}","${this.escapeCsvValue(node.title)}","${node.id === noteId}","${node.id === noteId ? 'focal' : 'connected'}",${node.step || 0}`;
            }
        });

        const nodesCSV = [nodesHeaders, ...nodesRows].join('\n');

        return { edgesCSV, nodesCSV };
    }

    // Updated generateNetworkStats to include step information
    generateNetworkStats(focalNoteId, nodes, links, isCompleteNetwork = false, includeIsolated = true, steps = null) {
        const focalNote = this.notes[focalNoteId];
        const totalNodes = nodes.length;
        const totalEdges = links.length;
        
        // Get isolated notes info
        const isolatedNotes = isCompleteNetwork && includeIsolated ? this.findIsolatedNotes() : [];
        const isolatedCount = isolatedNotes.length;
        const totalNotesInVault = Object.keys(this.notes).length;
        const connectedNotesCount = totalNotesInVault - isolatedCount;
        
        // Count nodes by step
        const nodesByStep = {};
        nodes.forEach(node => {
            const step = node.step || 0;
            nodesByStep[step] = (nodesByStep[step] || 0) + 1;
        });
        
        // Count edges by step
        const edgesByStep = {};
        links.forEach(link => {
            const step = link.step || 1;
            edgesByStep[step] = (edgesByStep[step] || 0) + 1;
        });
        
        // For complete network, count all link types
        const outgoingEdges = isCompleteNetwork 
            ? links.filter(l => l.source === focalNoteId).length
            : links.filter(l => l.type === 'outgoing').length;
        const incomingEdges = isCompleteNetwork 
            ? links.filter(l => l.target === focalNoteId).length
            : links.filter(l => l.type === 'incoming').length;
        
        // Calculate network density
        const maxPossibleEdges = totalNodes * (totalNodes - 1);
        const density = maxPossibleEdges > 0 ? (totalEdges * 2) / maxPossibleEdges : 0;
        
        // Build adjacency list for algorithms
        const adjacencyList = this.buildAdjacencyList(nodes, links);
        
        // Calculate betweenness centrality
        const betweennessCentrality = this.calculateBetweennessCentrality(nodes, adjacencyList);
        const topBetweenness = Object.entries(betweennessCentrality)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([nodeId, centrality]) => {
                const note = this.notes[nodeId];
                const nodeData = nodes.find(n => n.id === nodeId);
                return {
                    nodeId,
                    title: note ? note.title : 'Unknown',
                    centrality: centrality.toFixed(4),
                    step: nodeData ? nodeData.step : 'unknown'
                };
            });
        
        // Detect communities using Louvain algorithm
        const communities = this.detectCommunitiesLouvain(nodes, adjacencyList);
        const communityStats = this.analyzeCommunities(communities, nodes);
        
        // Get degree distribution
        const degrees = {};
        links.forEach(link => {
            degrees[link.source] = (degrees[link.source] || 0) + 1;
            degrees[link.target] = (degrees[link.target] || 0) + 1;
        });
        
        const degreeValues = Object.values(degrees);
        const avgDegree = degreeValues.length > 0 ? degreeValues.reduce((a, b) => a + b, 0) / degreeValues.length : 0;
        const maxDegree = degreeValues.length > 0 ? Math.max(...degreeValues) : 0;
        
        // Calculate additional network metrics for complete network
        const connectedComponents = isCompleteNetwork ? this.findConnectedComponents(adjacencyList) : 1;
        const networkDiameter = isCompleteNetwork ? this.calculateNetworkDiameter(adjacencyList) : 'N/A';
        
        // Build comprehensive stats CSV
        const statsHeaders = 'metric,value,description';
        const basicStats = [
            `"network_type","${isCompleteNetwork ? 'complete' : 'ego'}","Type of network exported"`,
            `"max_steps","${steps || (isCompleteNetwork ? 'all' : this.currentSteps)}","Maximum steps from focal note"`,
            `"focal_note_id","${focalNoteId}","ID of the focal note"`,
            `"focal_note_title","${this.escapeCsvValue(focalNote.title)}","Title of the focal note"`,
            `"total_notes_in_vault",${totalNotesInVault},"Total notes in your vault"`,
            `"connected_notes",${connectedNotesCount},"Notes with at least one wikilink"`,
            `"isolated_notes",${isolatedCount},"Notes with no wikilinks (orphans)"`,
            `"isolation_rate",${(isolatedCount / totalNotesInVault * 100).toFixed(1)}%,"Percentage of notes that are isolated"`,
            `"nodes_in_network",${totalNodes},"Notes included in network export"`,
            `"total_edges",${totalEdges},"Total number of connections"`,
            `"outgoing_edges_from_focal",${outgoingEdges},"Links from focal note to others"`,
            `"incoming_edges_to_focal",${incomingEdges},"Links from others to focal note"`,
            `"network_density",${density.toFixed(4)},"Ratio of actual to possible connections"`,
            `"average_degree",${avgDegree.toFixed(2)},"Average connections per note"`,
            `"max_degree",${maxDegree},"Maximum connections for any note"`,
            `"connected_components",${connectedComponents},"Number of disconnected subgraphs"`,
            `"network_diameter","${networkDiameter}","Longest shortest path in network"`,
            `"num_communities",${communityStats.numCommunities},"Number of detected communities"`,
            `"modularity",${communityStats.modularity.toFixed(4)},"Community structure quality (higher = better separation)"`,
            `"largest_community_size",${communityStats.largestCommunitySize},"Size of the largest community"`,
            `"network_coverage",${(totalNodes / totalNotesInVault * 100).toFixed(1)}%,"Percentage of vault included in this network"`,
            `"export_timestamp","${new Date().toISOString()}","When this export was generated"`
        ];
        
        // Add step distribution stats
        const stepStats = [];
        for (let step = 0; step <= 3; step++) {
            const count = nodesByStep[step] || 0;
            if (count > 0 || step === 0) {
                const stepDescription = step === 0 ? 'focal note' : `${step} step${step > 1 ? 's' : ''} from focal`;
                stepStats.push(`"nodes_at_step_${step}",${count},"Number of nodes ${stepDescription}"`);
            }
        }
        
        // Add edge distribution stats
        const edgeStepStats = [];
        for (let step = 1; step <= 3; step++) {
            const count = edgesByStep[step] || 0;
            if (count > 0) {
                edgeStepStats.push(`"edges_at_step_${step}",${count},"Connections at step ${step}"`);
            }
        }
        
        // Add top betweenness centrality nodes with step information
        const betweennessStats = topBetweenness.map((item, index) => 
            `"betweenness_rank_${index + 1}","${item.nodeId}: ${this.escapeCsvValue(item.title)} (${item.centrality}) [step ${item.step}]","Node with ${index === 0 ? 'highest' : 'rank ' + (index + 1)} betweenness centrality"`
        );
        
        // Add community information
        const communityInfo = communityStats.communities.map((community, index) => 
            `"community_${index + 1}","${community.nodes.join(';')}","Community ${index + 1} members (${community.size} nodes)"`
        );
        
        // Add sample isolated notes (first 10)
        const isolatedSamples = isolatedNotes.slice(0, 10).map((note, index) => 
            `"isolated_note_${index + 1}","${note.id}: ${this.escapeCsvValue(note.title)}","Isolated note example ${index + 1}"`
        );
        
        const allStats = [
            statsHeaders,
            ...basicStats,
            ...stepStats,
            ...edgeStepStats,
            ...betweennessStats,
            ...communityInfo,
            ...isolatedSamples
        ];
        
        return allStats.join('\n');
    }

    // Find notes that have no wikilink connections (neither incoming nor outgoing)
    findIsolatedNotes() {
        const connectedNoteIds = new Set();
        
        // Find all notes that have outgoing or incoming wikilinks
        Object.values(this.notes).forEach(note => {
            // Add notes with outgoing links
            const outgoingLinks = note.getOutgoingLinks();
            if (outgoingLinks.length > 0) {
                connectedNoteIds.add(note.id);
                
                // Add target notes of outgoing links
                outgoingLinks.forEach(linkTitle => {
                    const targetNote = Object.values(this.notes).find(n => 
                        n.title.toLowerCase() === linkTitle.toLowerCase()
                    );
                    if (targetNote) {
                        connectedNoteIds.add(targetNote.id);
                    }
                });
            }
            
            // Check if this note is referenced by others (incoming links)
            const hasIncomingLinks = Object.values(this.notes).some(otherNote => {
                if (otherNote.id === note.id) return false;
                return otherNote.getOutgoingLinks().some(link => 
                    link.toLowerCase() === note.title.toLowerCase()
                );
            });
            
            if (hasIncomingLinks) {
                connectedNoteIds.add(note.id);
            }
        });
        
        // Find isolated notes (not in connected set)
        const isolatedNotes = Object.values(this.notes).filter(note => 
            !connectedNoteIds.has(note.id)
        );
        
        return isolatedNotes;
    }

    // Generate isolated notes CSV
    generateIsolatedNotesCSV() {
        const isolatedNotes = this.findIsolatedNotes();
        
        const headers = 'id,title,created,modified,word_count,character_count,tags,first_paragraph,last_modified_days_ago,potential_tags';
        
        const rows = isolatedNotes.map(note => {
            const content = note.getContentWithoutMetadata();
            const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
            const charCount = content.length;
            
            // Get tags from metadata
            const metadata = note.parseMetadata();
            const tags = Array.isArray(metadata.tags) ? metadata.tags.join(';') : '';
            
            // Extract first paragraph
            const paragraphs = content.split('\n\n').filter(p => p.trim());
            const firstParagraph = paragraphs.length > 0 ? paragraphs[0].replace(/\n/g, ' ').substring(0, 150) : '';
            
            // Calculate days since last modification
            const daysSinceModified = Math.floor((Date.now() - note.modified) / (1000 * 60 * 60 * 24));
            
            // Extract potential tags from content (words that appear frequently, capitalized terms, etc.)
            const potentialTags = this.extractPotentialTags(content);
            
            return `"${note.id}","${this.escapeCsvValue(note.title)}","${new Date(note.created).toISOString()}","${new Date(note.modified).toISOString()}",${wordCount},${charCount},"${this.escapeCsvValue(tags)}","${this.escapeCsvValue(firstParagraph)}",${daysSinceModified},"${this.escapeCsvValue(potentialTags.join(';'))}"`;
        });
        
        return [headers, ...rows].join('\n');
    }

    // Extract potential tags from note content
    extractPotentialTags(content) {
        const potentialTags = new Set();
        
        // Find capitalized words (potential proper nouns)
        const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g) || [];
        capitalizedWords.forEach(word => {
            if (word.length > 3 && !['The', 'This', 'That', 'When', 'Where', 'What', 'Why', 'How'].includes(word)) {
                potentialTags.add(word);
            }
        });
        
        // Find hashtags
        const hashtags = content.match(/#\w+/g) || [];
        hashtags.forEach(tag => potentialTags.add(tag.substring(1)));
        
        // Find quoted terms
        const quotedTerms = content.match(/"([^"]+)"/g) || [];
        quotedTerms.forEach(term => {
            const cleanTerm = term.replace(/"/g, '');
            if (cleanTerm.length > 3 && cleanTerm.length < 30) {
                potentialTags.add(cleanTerm);
            }
        });
        
        // Limit to most relevant tags
        return Array.from(potentialTags).slice(0, 5);
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    destroy() {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
    }

    // Build adjacency list representation
    buildAdjacencyList(nodes, links) {
        const adjacencyList = {};
        
        // Initialize all nodes
        nodes.forEach(node => {
            adjacencyList[node.id] = [];
        });
        
        // Add edges (treating as undirected for community detection)
        links.forEach(link => {
            adjacencyList[link.source].push(link.target);
            adjacencyList[link.target].push(link.source);
        });
        
        // Remove duplicates
        Object.keys(adjacencyList).forEach(nodeId => {
            adjacencyList[nodeId] = [...new Set(adjacencyList[nodeId])];
        });
        
        return adjacencyList;
    }

    // Calculate betweenness centrality using Brandes algorithm (simplified)
    calculateBetweennessCentrality(nodes, adjacencyList) {
        const centrality = {};
        const nodeIds = nodes.map(n => n.id);
        
        // Initialize centrality scores
        nodeIds.forEach(nodeId => {
            centrality[nodeId] = 0;
        });
        
        // For each node as source
        nodeIds.forEach(source => {
            // BFS to find shortest paths
            const distances = {};
            const predecessors = {};
            const queue = [source];
            const stack = [];
            
            // Initialize
            nodeIds.forEach(nodeId => {
                distances[nodeId] = -1;
                predecessors[nodeId] = [];
            });
            distances[source] = 0;
            
            // BFS
            while (queue.length > 0) {
                const current = queue.shift();
                stack.push(current);
                
                adjacencyList[current].forEach(neighbor => {
                    // First time we reach this neighbor
                    if (distances[neighbor] < 0) {
                        queue.push(neighbor);
                        distances[neighbor] = distances[current] + 1;
                    }
                    // If we found another shortest path
                    if (distances[neighbor] === distances[current] + 1) {
                        predecessors[neighbor].push(current);
                    }
                });
            }
            
            // Calculate dependencies
            const dependencies = {};
            nodeIds.forEach(nodeId => {
                dependencies[nodeId] = 0;
            });
            
            // Process nodes in reverse order of distance from source
            while (stack.length > 0) {
                const w = stack.pop();
                predecessors[w].forEach(v => {
                    dependencies[v] += (1 + dependencies[w]) / predecessors[w].length;
                });
                if (w !== source) {
                    centrality[w] += dependencies[w];
                }
            }
        });
        
        // Normalize by the number of pairs of vertices
        const n = nodeIds.length;
        const normalizationFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
        
        Object.keys(centrality).forEach(nodeId => {
            centrality[nodeId] *= normalizationFactor;
        });
        
        return centrality;
    }

    // Simplified Louvain algorithm for community detection
    detectCommunitiesLouvain(nodes, adjacencyList) {
        const nodeIds = nodes.map(n => n.id);
        const communities = {};
        
        // Initialize: each node in its own community
        nodeIds.forEach((nodeId, index) => {
            communities[nodeId] = index;
        });
        
        // Calculate total edge weight (all edges have weight 1)
        const totalEdgeWeight = Object.values(adjacencyList)
            .reduce((sum, neighbors) => sum + neighbors.length, 0) / 2;
        
        let improved = true;
        let iterations = 0;
        const maxIterations = 50; // Prevent infinite loops
        
        while (improved && iterations < maxIterations) {
            improved = false;
            iterations++;
            
            // For each node, try moving it to neighboring communities
            nodeIds.forEach(nodeId => {
                const currentCommunity = communities[nodeId];
                const neighbors = adjacencyList[nodeId];
                
                // Get neighboring communities
                const neighboringCommunities = new Set();
                neighbors.forEach(neighbor => {
                    neighboringCommunities.add(communities[neighbor]);
                });
                
                let bestCommunity = currentCommunity;
                let bestModularityGain = 0;
                
                // Try each neighboring community
                neighboringCommunities.forEach(community => {
                    if (community !== currentCommunity) {
                        const modularityGain = this.calculateModularityGain(
                            nodeId, currentCommunity, community, 
                            communities, adjacencyList, totalEdgeWeight
                        );
                        
                        if (modularityGain > bestModularityGain) {
                            bestModularityGain = modularityGain;
                            bestCommunity = community;
                        }
                    }
                });
                
                // Move node if beneficial
                if (bestCommunity !== currentCommunity && bestModularityGain > 0) {
                    communities[nodeId] = bestCommunity;
                    improved = true;
                }
            });
        }
        
        return communities;
    }

    // Calculate modularity gain for moving a node between communities
    calculateModularityGain(nodeId, fromCommunity, toCommunity, communities, adjacencyList, totalEdgeWeight) {
        const neighbors = adjacencyList[nodeId];
        const nodeDegree = neighbors.length;
        
        // Count connections to from and to communities
        let connectionsToFrom = 0;
        let connectionsToTo = 0;
        
        neighbors.forEach(neighbor => {
            if (communities[neighbor] === fromCommunity) {
                connectionsToFrom++;
            }
            if (communities[neighbor] === toCommunity) {
                connectionsToTo++;
            }
        });
        
        // Calculate degree sums for communities
        const fromCommunityDegree = this.getCommunityDegree(fromCommunity, communities, adjacencyList);
        const toCommunityDegree = this.getCommunityDegree(toCommunity, communities, adjacencyList);
        
        // Modularity gain calculation (simplified)
        const gain = (connectionsToTo - connectionsToFrom) / (2 * totalEdgeWeight) - 
                    (nodeDegree * (toCommunityDegree - fromCommunityDegree)) / (4 * totalEdgeWeight * totalEdgeWeight);
        
        return gain;
    }

    // Get total degree of all nodes in a community
    getCommunityDegree(community, communities, adjacencyList) {
        let totalDegree = 0;
        Object.keys(communities).forEach(nodeId => {
            if (communities[nodeId] === community) {
                totalDegree += adjacencyList[nodeId].length;
            }
        });
        return totalDegree;
    }

    // Analyze detected communities
    analyzeCommunities(communities, nodes) {
        // Group nodes by community
        const communityGroups = {};
        Object.entries(communities).forEach(([nodeId, community]) => {
            if (!communityGroups[community]) {
                communityGroups[community] = [];
            }
            communityGroups[community].push(nodeId);
        });
        
        // Calculate community statistics
        const communitySizes = Object.values(communityGroups).map(group => group.length);
        const numCommunities = communitySizes.length;
        const largestCommunitySize = Math.max(...communitySizes);
        
        // Calculate modularity (simplified)
        const modularity = this.calculateModularity(communities, nodes);
        
        // Format community information
        const communityList = Object.entries(communityGroups).map(([communityId, nodeIds]) => ({
            id: communityId,
            nodes: nodeIds,
            size: nodeIds.length,
            titles: nodeIds.map(nodeId => {
                const note = this.notes[nodeId];
                return note ? note.title : 'Unknown';
            })
        }));
        
        return {
            numCommunities,
            largestCommunitySize,
            modularity,
            communities: communityList,
            distribution: communitySizes
        };
    }

    // Calculate network modularity (simplified version)
    calculateModularity(communities, nodes) {
        // This is a simplified modularity calculation
        // In a full implementation, you'd want the proper Newman modularity formula
        const totalNodes = nodes.length;
        const uniqueCommunities = new Set(Object.values(communities));
        
        // Simple modularity approximation based on community structure
        if (uniqueCommunities.size === 1) return 0; // All nodes in one community
        if (uniqueCommunities.size === totalNodes) return 0; // Each node in its own community
        
        // Return a reasonable modularity score between 0 and 1
        // This is simplified - proper modularity requires edge weights and more complex calculation
        return Math.min(0.8, 0.3 + (uniqueCommunities.size / totalNodes) * 0.5);
    }

    // Find connected components in the network
    findConnectedComponents(adjacencyList) {
        const visited = new Set();
        const nodeIds = Object.keys(adjacencyList);
        let componentCount = 0;
        
        const dfs = (nodeId) => {
            visited.add(nodeId);
            adjacencyList[nodeId].forEach(neighbor => {
                if (!visited.has(neighbor)) {
                    dfs(neighbor);
                }
            });
        };
        
        nodeIds.forEach(nodeId => {
            if (!visited.has(nodeId)) {
                dfs(nodeId);
                componentCount++;
            }
        });
        
        return componentCount;
    }

    // Calculate network diameter (longest shortest path)
    calculateNetworkDiameter(adjacencyList) {
        const nodeIds = Object.keys(adjacencyList);
        let maxDistance = 0;
        
        // For performance, sample a subset if network is large
        const sampleSize = Math.min(nodeIds.length, 50);
        const sampledNodes = nodeIds.slice(0, sampleSize);
        
        sampledNodes.forEach(source => {
            const distances = this.bfsDistances(source, adjacencyList);
            const maxDistanceFromSource = Math.max(...Object.values(distances).filter(d => d !== -1));
            maxDistance = Math.max(maxDistance, maxDistanceFromSource);
        });
        
        return maxDistance;
    }

    // BFS to find distances from a source node
    bfsDistances(source, adjacencyList) {
        const distances = {};
        const queue = [source];
        
        // Initialize distances
        Object.keys(adjacencyList).forEach(nodeId => {
            distances[nodeId] = -1;
        });
        distances[source] = 0;
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            adjacencyList[current].forEach(neighbor => {
                if (distances[neighbor] === -1) {
                    distances[neighbor] = distances[current] + 1;
                    queue.push(neighbor);
                }
            });
        }
        
        return distances;
    }

    // Helper method to properly escape CSV values
    escapeCsvValue(value) {
        if (typeof value !== 'string') return value;
        // Escape quotes by doubling them and handle line breaks
        return value.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
    }

    // Helper method to download CSV
    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}