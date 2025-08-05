---
title: connecting-ideas
created: 2025-08-05T15:32:04.661Z
tags: ["getting started"]
---

# Connecting Ideas: Advanced PKM Techniques 

Now that you understand the basics of wikilinks and PKM principles, let's explore sophisticated techniques for building meaningful knowledge networks that support digital humanities research.

> The wikilinks below will show both red and blue links; blue for ones I have already created, red for ones that could _potentially_ exist. And imagine that every header below contains the rider, 'for instance'. Right now, we're focussing on thinking about our thinking more than the _content_ of 'digital archaeology'.

## Types of Connections

These examples draw on digital archaeology research in particular.

### 1. **Conceptual Links**
Connect archaeological theories with digital methods:
- [[landscape-archaeology]] ← → [[gis-analysis]]
- [[material-culture-theory]] ← → [[3d-modeling]]
- [[site-formation-processes]] ← → [[database-design]]

**Practice**: Think about how traditional archaeological concepts relate to digital methods.

### 2. **Methodological Links**  
Connect fieldwork approaches with computational techniques:
- [[stratigraphic-excavation]] ← → [[photogrammetry]]
- [[artifact-analysis]] ← → [[morphometric-analysis]]
- [[survey-methods]] ← → [[remote-sensing]]

**Practice**: For each traditional method you know, consider its digital counterpart.

### 3. **Temporal Links**
Connect across archaeological periods and methodological eras:
- [[ceramic-typology]] ← → [[statistical-seriation]]
- [[radiocarbon-dating]] ← → [[bayesian-chronological-modeling]]
- [[traditional-mapping]] ← → [[lidar-survey]]

**Practice**: Look for patterns and continuities across methodological developments.

### 4. **Evidence Links**
Connect interpretations to supporting data:
- [[settlement-pattern-argument]] ← → [[spatial-analysis-results]]
- [[cultural-change-hypothesis]] ← → [[quantitative-artifact-data]]
- [[site-interpretation]] ← → [[geophysical-survey-data]]

## Advanced Linking Strategies

### The MOC (Map of Contents) Pattern
Create hub notes that organize related concepts:

```markdown
# Digital Archaeology Methods MOC

## Spatial Analysis
- [[gis-modeling]]
- [[viewshed-analysis]]  
- [[cost-surface-analysis]]
- [[predictive-modeling]]

## 3D Documentation
- [[photogrammetry-techniques]]
- [[laser-scanning]]
- [[virtual-reconstruction]]

## Quantitative Analysis
- [[statistical-analysis]]
- [[morphometric-analysis]]
- [[network-analysis]]
```

### The Bridge Note Pattern
Create notes that explicitly connect different domains:

```markdown
# Bridging Landscape Theory and Spatial Analysis

How can [[phenomenological-approaches]] inform our use of 
[[viewshed-analysis]] in understanding ancient landscapes?

Both approaches focus on human experience of space, but one 
emphasizes embodied perception while the other reveals 
quantifiable visibility patterns.

## Synthesis Questions
- What would [[Christopher Tilley]] think about [[GIS]] [[viewsheds]]?
- How might [[sensory-archaeology]] help us interpret [[least-cost-path]] results?
```

### The Question Cascade Pattern
Let questions generate more questions:

```markdown
# Why do digital archives matter for archaeology?

## Initial Question
How do [[digital-repositories]] change archaeological practice?

## Generated Questions  
- [[data-accessibility]] - Does open data change interpretation?
- [[scale-vs-resolution]] - What's lost when we aggregate site data?
- [[preservation-standards]] - Who decides metadata schemas?
- [[algorithmic-bias]] - How do search algorithms shape research?

## Meta-Question
How do [[computational-tools]] change the questions we ask about the past?
```

## Embedding for Synthesis

### Block Embedding Strategies

**Gather evidence across notes into a single note**:
```markdown
# Settlement Patterns in Bronze Age Landscapes

## Spatial Analysis Results
![[gis-analysis.py#viewshed-results]]

## Traditional Site Reports
![[excavation-reports#settlement-evidence]]

## Environmental Data
![[paleoenvironmental-database#bronze-age-climate]]
```

**Compare approaches across notes into a single note**:
```markdown
# Traditional vs. Digital Site Recording

## Harris Matrix Approach
![[stratigraphy-notes#harris-principles]]

## Digital Workflows  
![[digital-recording#database-schemas]]

## My Synthesis
The debate assumes [[recording-is-either-or]] when we might think about 
[[integrated-documentation]] instead.
```

## Building Network Density

### The 3-Link Rule
Every new note should connect to at least 3 existing notes. This creates:
- **Redundant pathways** for rediscovering site connections
- **Methodological triangulation** that strengthens interpretations
- **Serendipitous discovery** through unexpected archaeological parallels

### The Orphan Hunt
Regularly search for "orphan" notes with few connections by using the Link Graph Export CSV Button:
1. In PKM Webnotes, the Graph Export button in the right sidebar will list orphan or 'isolated' notes
2. The nodes and edges csvs can be loaded into Gephi or other network analysis software
3. The statistics will show you clusters of related ideas, notes that bridge, which might be useful candidates for linking for your orphans 
4. Consciously work to integrate isolated ideas

### The Weekly Review
Spend 15 minutes each week:
1. **Browsing recent notes** for connection opportunities
2. **Following random links** to rediscover forgotten sites
3. **Updating older notes** with new connections
4. **Creating bridge notes** between separate areas of study

## Common Connection Patterns

### The Hub and Spoke
Central site or method with many connections:
```
[[tell-site-excavation]] connects to:
- [[ceramic-analysis]]
- [[radiocarbon-dating]]  
- [[spatial-analysis]]
- [[geophysical-survey]]
- [[environmental-archaeology]]
```

### The Chain
Sequential development of archaeological understanding:
```
[[surface-survey]] → [[geophysical-prospection]] → 
[[targeted-excavation]] → [[post-excavation-analysis]] → 
[[site-interpretation]]
```

### The Web
Mutual interconnection without hierarchy:
```
[[ceramics]] ↔ [[lithics]] ↔ [[architecture]] ↔ [[burials]] ↔ 
[[environmental-remains]] ↔ [[dating-evidence]] (contextual analysis)
```

## Practical Exercises

These are suggestions, if you have time.

### Exercise 1: Method Bridging
1. Pick two dh methods that seem unrelated
2. Create a note exploring their potential integration
3. Link to case studies or examples
4. Ask: "What would happen if we combined these approaches?"

### Exercise 2: Research Question Mapping
1. Start with an dh research question that interests you
2. Create a note for the question
3. Generate 5 sub-questions and link to them
4. For each sub-question, ask what methods might address it
5. Link methods to relevant theoretical frameworks

### Exercise 3: Multi-Proxy Evidence Gathering
1. Choose an dh interpretation you find compelling
2. Create a note summarizing the interpretation
3. Use embedding to gather supporting evidence from multiple sources
4. Include both traditional analysis and computational methods
5. Reflect on how different types of evidence interact

### Exercise 4: Visualize Connections
Explore and use the Link Graph Export to better understand the structure of your thinking.

## Troubleshooting Connection Problems

### "I can't think of connections"
- Start with obvious site relationships, then push further
- Ask: "What caused this pattern?" "What's the regional context?" "What's similar?"
- Use temporal, spatial, and cultural reasoning
- Consider contrasts between sites and periods

### "My network feels chaotic"
- Chaos often precedes insight - don't organize too quickly
- Create MOC notes for regions or periods to provide structure
- Use the backlinks panel to discover emergent site clusters
- Trust that meaningful patterns will develop over time

### "Connections feel forced"
- Quality over quantity - better to have fewer meaningful links
- Some sites genuinely are more isolated - that's archaeological reality
- Focus on connections that generate new research questions
- Revisit and revise links as excavations and analysis progress

---

**Remember**: The goal isn't to connect every note to every other note, but to build a network that supports your thinking and reveals unexpected patterns in your thought. The best connections are those that generate new research questions or challenge existing interpretations.



