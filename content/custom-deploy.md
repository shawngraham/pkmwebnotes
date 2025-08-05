---
title: Customize with your own default content
created: 2025-08-05T12:57:24.739Z
tags: [welcome, getting-started]
---

# Deploy with your own default content

- Fork the repo at [https://github.com/shawngraham/pkmwebnotes](https://github.com/shawngraham/pkmwebnotes)
- Add more content as .md files in the `content` subfolder
- Add the filenames to the `content/manifest.json` file, eg:

```json
{
  "defaultNotes": [
    "welcome.md",
    "python-in-notes.md",
    "custom-deploy.md"
  ]
}
```

- Use GH-Pages or Netlify Drop or another webhosting service to push it online (no builds, no Jekyll, etc etc!)