---
title: What is PKM?
created: 2025-08-05T15:31:07.487Z
tags: ["getting started"]
---

# What is Personal Knowledge Management?

Personal Knowledge Management (PKM) is a practice and philosophy for organizing, connecting, and growing your understanding over time. For digital humanists, PKM provides a bridge between traditional scholarly practices and computational methods.

## Why PKM Matters for Digital Humanities

### The Information Problem
Modern scholars face unprecedented challenges:
- **Information overload**: Too much to read and process
- **Siloed knowledge**: Ideas trapped in separate documents/disciplines  
- **Lost connections**: Insights forgotten or difficult to relocate
- **Linear constraints**: Traditional writing forces artificial sequences

### PKM as Solution
PKM systems like this one address these challenges by:
- **Connecting ideas** across time and contexts
- **Reducing cognitive load** through external memory systems
- **Enabling serendipity** through unexpected link discovery
- **Supporting non-linear thinking** natural to research

---

## Core PKM Principles

### 1. **Links Over Hierarchies**
Traditional organization uses folders and categories:

```files
Research/
  ├── Medieval Pottery/
  ├── Digital Methods/
  └── Theory/
```

PKM uses networks of connections (note that these links are in red because the note doesn't exist yet: but in this way we can start mapping the things we will want to know):
- [[medieval-pottery]] connects to [[digital-imaging]]
- [[network-analysis]] relates to [[social-history]]  
- [[computational-methods]] informs [[close-reading]]

**Why this matters**: Humanities knowledge is inherently interconnected. Medieval literature connects to gender studies, which relates to digital archives, which informs computational analysis.

### 2. **Atomic Notes**
Each note focuses on **one idea** or **atom of thought** that can be:
- **Understood independently** 
- **Connected to multiple contexts**
- **Reused across projects**
- **Built upon over time**
- Literature review: use the @ symbol to indicate a note that contains the precis for an academic article, referenced by the author and year

**Example**: Instead of "Research Notes on Amazonian Archaeology," create:
- [[terra-preta]]
- [[orinoco-rock-art]]
- [[@riris-oliver-2024]]
- [[lidar-and-remote-sensing]]

### 3. **Progressive Development**
Knowledge builds incrementally:
- Start with **simple observations**
- Add **connections** as you discover them
- **Revisit and expand** notes over time
- Let **complex ideas emerge** from simple building blocks

### 4. **Externalized Thinking**
Your PKM system becomes a **second brain**:
- **Offload memory** to focus on thinking
- **Make implicit connections explicit**
- **Track your intellectual development**
- **Build on past insights**

## PKM in Academic Context

### Traditional Academic Writing
1. Research → 2. Outline → 3. Write → 4. Revise

**Problems**: 
- Ideas emerge during writing but can't reshape early research
- Connections between projects are lost
- Knowledge stays locked in finished papers

### PKM-Enhanced Scholarship
**Continuous cycle**:
- **Collect** → **Connect** → **Create** → **Reflect** → **Revise**

**Benefits**:
- Ideas compound across projects
- Unexpected connections generate new insights  
- Research becomes cumulative rather than project-based
- Writing emerges from network of developed ideas

## PKM and Computational Thinking

Digital humanities combines interpretive and computational approaches. PKM bridges these by:

### Supporting Both Modes
- **Interpretive work**: Connect themes, build arguments, trace influences
- **Computational work**: Document methods, link code to questions, embed results

### Linking Analysis to Argument
Instead of separate "analysis" and "writing" phases:
- Embed [[computational-results]] directly in interpretive notes
- Link [[methodology-notes]] to specific research questions
- Connect [[code-experiments]] to theoretical frameworks

### Example Integration

The text below shows a (very minimal) example of how your writing can integrate networked ways of representing knowledge. Notice the ! which embeds the output from cell 3 of the point-pattern-analysis computational notebook.

```markdown
# Terra Preta and its co-occurence with Rock Art

## Computational Analysis
![[point-pattern-analysis.ipynb#cell:3:output]]

## Interpretive Framework  
The analysis above supports [[separate-spheres-of-influence]] 
by showing limited clustering across time and space.

## Related Concepts
- [[spatial-analysis-clustering]]
- [[remote-sensing-aerial]]
- [[terra-preta]]
```

## Building Your PKM Practice

### Start Simple
1. **Create atomic notes** about concepts you're learning
2. **Link generously** - when in doubt, make the connection
3. **Review regularly** - revisit notes to discover new patterns
4. **Don't over-organize** - let structure emerge

### Develop Gradually
- **Week 1**: Focus on creating notes and basic links
- **Week 2**: Start using backlinks to discover connections  
- **Week 3**: Begin embedding content and building synthesis notes
- **Ongoing**: Let your system evolve with your thinking

### Make it Sustainable
- **Regular review**: Spend 10 minutes weekly exploring your network
- **Capture quickly**: Don't let perfect organization prevent good note-taking
- **Connect actively**: Always ask "What does this relate to?"
- **Trust emergence**: Complex insights arise from simple, consistent practices

## PKM Tools and Philosophy

This PKM WebNotes environment combines:
- **Computational capabilities** (data analysis)
- **Networked thinking** (wikilinks, backlinks) 
- **Academic writing** (markdown, embedding)

**Why this combination works**: Digital humanities requires moving fluidly between computational analysis and interpretive synthesis. PKM provides the connective tissue.

There are many platforms that enable this kind of workflow, including [Obsidian](https://obsidian.md), [Tangent](https://www.tangentnotes.com/), [Joplin](https://joplinapp.org/), and others.
## Common Misconceptions

**"PKM is just fancy note-taking"**
→ PKM transforms how you think, not just how you store information

**"I need to organize everything perfectly first"**  
→ Organization emerges from use, not upfront planning

**"This is too much overhead for my research"**
→ PKM reduces cognitive overhead by externalizing connections

**"I should wait until I have more content"**
→ Start immediately - networks become valuable quickly

## Next Steps

Ready to put PKM principles into practice? Continue with:

- [[connecting-ideas]] - Practical techniques for building knowledge networks

---

**Reflection Question**: How might your current research practices change if you could easily discover connections between projects, remember insights across semesters, and build cumulative understanding rather than starting fresh each time?

