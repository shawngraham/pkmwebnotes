# PKM Webnotes

A home-cooked app by [Shawn Graham](https://shawngraham.github.io). Basic markdown note making as you'd expect; integrated python (pyodide) kernel for gentle code/note experiments (for more substantial, use [JupyterLab Desktop PKM extension](https://pypi.org/project/jupyterlab-pkm/)). Full note export as individual .md files, a json file, or one big ol' markdown note, as well as csv files in edgelist, nodelist format for further visualization and analysis; the app does do community detection, calculate betweeness centrality, and identify isolated notes. 

## deploy
- `main` branch deploys the app; use Netlify or similar
- `content` in the `main` branch can be modified; just make sure to update manifest.json too.

## develop
- `source` branch contains source code
