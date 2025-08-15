---
title: Customize with your own default content
created: 2025-08-05T12:57:24.739Z
tags: [welcome, getting-started]
---

# Deploy with your own default content

- Fork the repo at [https://github.com/shawngraham/pkmwebnotes](https://github.com/shawngraham/pkmwebnotes)
- Add more content as .md files in the `content` subfolder
- Add the filenames to the `content/manifest.json` file (note that you can have subfolders), eg:

```json
{
  "defaultNotes": {
    "root": ["welcome.md", "custom-deploy.md"],
    "python": ["python-in-notes.md", "python-examples.md"],
    "projects": {
      "work": ["project1.md", "project2.md"],
      "personal": ["ideas.md"]
    }
  }
}
```

- Use [Netlify Drop](https://app.netlify.com/drop) to push it online (no builds, no Jekyll, etc etc!). Other services might work too. 

# Develop

The source code is in the repo under the `source` branch. You're welcome to develop how you like; attribution would be nice.