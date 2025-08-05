---
title: Python in Notes
created: 2025-08-05T12:57:24.739Z
tags: [python, code, tutorial]
---

# 🐍 Executing Python in Your Notes

You can run Python code blocks directly in your notes. This is powered by [Pyodide](https://pyodide.org/), which brings a full Python environment to your browser. The status of the Python environment is shown in the header.

## Basic Example

Here's a simple Python code block. Click the "▶ Run" button in the preview pane to execute it. The output will be numbered.

```python
import sys
print(f"Hello from Python {sys.version}!")

# The last expression in a cell is automatically displayed as the result
a = 10
b = 20
a + b
```

## Data Analysis with Pandas

The environment comes with \`pandas\` and \`numpy\` pre-installed. You can perform data analysis right here.

```python
import pandas as pd
from io import StringIO

# Create a sample dataset
csv_data = """
fruit,quantity,color
apple,12,red
banana,18,yellow
grape,30,purple
"""

# Read it into a DataFrame
df = pd.read_csv(StringIO(csv_data))

# Display the DataFrame
df
```

## Creating Plots

You can also generate plots using \`matplotlib\`. Any plots created will be displayed as images below the code cell.

```python
import matplotlib.pyplot as plt
import numpy as np

# Generate some data
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create a plot
fig, ax = plt.subplots()
ax.plot(x, y)
ax.set_title("A Simple Sine Wave")
ax.set_xlabel("x")
ax.set_ylabel("sin(x)")

# The plot will be captured and displayed automatically
plt.show()
```

## Loading External Data

You can load data from URLs using the special \`#data_url:\` directive:

```python
# The fetched data is available in the 'fetched_data' variable
df = pd.read_csv(StringIO(fetched_data))
print(f"Loaded {len(df)} rows of data")
print("\nFirst 5 rows:")
df.head()
```

## Important Notes

- Each note maintains its own Python environment
- Variables persist between code cells in the same note
- The execution counter [n] shows the order of execution
- First execution may take a few seconds while Pyodide loads
- Check the Python status indicator in the header (🐍)

## Available Libraries

The following libraries are pre-installed:
- pandas
- numpy  
- matplotlib
- json
- csv
- micropip (for installing additional packages)

You can install with micropip like this:

```python
await micropip.install("networkx")
```

Happy coding! 🐍