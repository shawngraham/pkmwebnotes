---
title: R Code Execution in PKM WebNotes
created: 2025-08-22T13:41:18.682Z
tags: []
---

# R Code Execution in PKM WebNotes

PKM WebNotes includes powerful R code execution capabilities powered by WebR, allowing you to run R code directly in your browser with real-time output, visualizations, and data analysis.

## Quick Start

Simply create R code blocks in your notes using triple backticks with the `r` language identifier:

```r
# Your R code here
print("Hello from R!")
```

Click the "▶ Run" button to execute the code and see results instantly.

## Core Features

### ✅ Data Analysis & Statistics
- Full R statistical computing environment
- Built-in support for common statistical functions
- Data manipulation and transformation

### ✅ Visualization with ggplot2
- Create publication-quality plots
- Interactive data visualization
- Automatic plot rendering in preview

### ✅ Data Processing with dplyr
- Efficient data manipulation
- Pipe operators for clean code
- Group operations and summaries

### ✅ Real-time Output
- Execution counter for tracking runs
- Separate display of output and results
- Error handling with clear messages

## Basic Examples

### Simple Calculations
```r
# Basic arithmetic and statistics
numbers <- c(1, 2, 3, 4, 5, 10, 15, 20)
mean(numbers)
sd(numbers)
summary(numbers)
```

### Data Creation
```r
# Create a simple dataset
data <- data.frame(
  x = 1:10,
  y = rnorm(10, mean = 5, sd = 2),
  category = rep(c("A", "B"), 5)
)
head(data)
```

### Basic Plotting
```r
# Simple scatter plot
plot(1:10, rnorm(10), 
     main = "Random Data", 
     xlab = "Index", 
     ylab = "Value",
     col = "blue", 
     pch = 16)
```

## Advanced Data Visualization

### ggplot2 Examples
```r
library(ggplot2)

# Create sample data
df <- data.frame(
  x = rnorm(100),
  y = rnorm(100),
  group = sample(c("Group A", "Group B", "Group C"), 100, replace = TRUE)
)

# Create a beautiful scatter plot
ggplot(df, aes(x = x, y = y, color = group)) +
  geom_point(size = 3, alpha = 0.7) +
  theme_minimal() +
  labs(title = "Sample Scatter Plot",
       subtitle = "Demonstrating ggplot2 capabilities",
       x = "X Variable",
       y = "Y Variable") +
  theme(plot.title = element_text(hjust = 0.5),
        plot.subtitle = element_text(hjust = 0.5))
```

### Distribution Plots
```r
library(ggplot2)

# Generate sample data
set.seed(42)
data <- data.frame(
  values = c(rnorm(200, mean = 10, sd = 2),
             rnorm(200, mean = 15, sd = 3)),
  group = rep(c("Distribution A", "Distribution B"), each = 200)
)

# Create overlapping density plot
ggplot(data, aes(x = values, fill = group)) +
  geom_density(alpha = 0.6) +
  scale_fill_manual(values = c("#FF6B6B", "#4ECDC4")) +
  theme_minimal() +
  labs(title = "Overlapping Density Distributions",
       x = "Values",
       y = "Density",
       fill = "Group") +
  theme(legend.position = "bottom")
```

## Data Manipulation with dplyr

### Data Pipeline Example
```r
library(dplyr)

# Create sample sales data
sales_data <- data.frame(
  product = rep(c("A", "B", "C", "D"), each = 50),
  quarter = rep(c("Q1", "Q2", "Q3", "Q4"), 50),
  sales = round(runif(200, min = 100, max = 1000), 2),
  region = sample(c("North", "South", "East", "West"), 200, replace = TRUE)
)

# Data analysis pipeline
summary_stats <- sales_data %>%
  group_by(product, quarter) %>%
  summarise(
    avg_sales = mean(sales),
    total_sales = sum(sales),
    count = n(),
    .groups = 'drop'
  ) %>%
  arrange(desc(total_sales))

print(summary_stats)
```

### Advanced Visualization Pipeline
```r
library(ggplot2)
library(dplyr)

# Create and visualize the data in one pipeline
sales_data %>%
  group_by(product) %>%
  summarise(total_sales = sum(sales), .groups = 'drop') %>%
  ggplot(aes(x = reorder(product, total_sales), y = total_sales)) +
  geom_col(fill = "steelblue", alpha = 0.8) +
  geom_text(aes(label = paste0("$", round(total_sales/1000, 1), "K")), 
            hjust = -0.1) +
  coord_flip() +
  theme_minimal() +
  labs(title = "Total Sales by Product",
       x = "Product",
       y = "Total Sales ($)")
```

## Working with Time Series

```r
# Create time series data
dates <- seq(as.Date("2023-01-01"), as.Date("2023-12-31"), by = "day")
ts_data <- data.frame(
  date = dates,
  value = cumsum(rnorm(length(dates))) + 100
)

# Plot time series
library(ggplot2)
ggplot(ts_data, aes(x = date, y = value)) +
  geom_line(color = "darkblue", size = 1) +
  geom_smooth(method = "loess", se = TRUE, alpha = 0.3) +
  theme_minimal() +
  labs(title = "Time Series Example",
       subtitle = "Daily values with trend line",
       x = "Date",
       y = "Value") +
  theme(axis.text.x = element_text(angle = 45, hjust = 1))
```

## Statistical Analysis Examples

### Correlation Analysis
```r
# Generate correlated data
set.seed(123)
n <- 100
x1 <- rnorm(n)
x2 <- 0.7 * x1 + 0.3 * rnorm(n)
x3 <- -0.5 * x1 + 0.8 * rnorm(n)

# Create correlation matrix
cor_data <- data.frame(x1, x2, x3)
correlation_matrix <- cor(cor_data)
print(round(correlation_matrix, 3))
```

### Regression Analysis
```r
# Simple linear regression
set.seed(42)
x <- rnorm(50)
y <- 2 * x + 1 + rnorm(50, sd = 0.5)

model <- lm(y ~ x)
summary(model)

# Visualization with regression line
plot(x, y, pch = 16, col = "steelblue",
     main = "Linear Regression Example",
     xlab = "X Variable", ylab = "Y Variable")
abline(model, col = "red", lwd = 2)
```

## Interactive Features

### Plot Actions
- **Copy Image**: Copy plots directly to clipboard
- **Download**: Save plots as PNG files
- **Multiple Plots**: Handle multiple visualizations per code block

### Execution Management
- **Execution Counter**: Track code runs with `[n]` indicators
- **Output Separation**: Clear distinction between code output and results
- **Error Handling**: Informative error messages for debugging

### Copy Functionality
- **Copy Output**: Copy all text output to clipboard
- **Copy Images**: Copy plots directly for use in other applications

## Tips for Effective Use

### 1. Organize Your Analysis

```
# Use comments to structure your analysis
# Data Import and Cleaning
# Exploratory Data Analysis  
# Statistical Modeling
# Results and Visualization
```

### 2. Leverage R's Strengths
- Use vectorized operations for efficiency
- Take advantage of R's statistical functions
- Utilize ggplot2 for professional visualizations

### 3. Code Organization
- Break complex analyses into multiple code blocks
- Use meaningful variable names
- Comment your code for future reference

### 4. Integration with Notes
- Embed R analysis directly in your research notes
- Create reproducible research documents
- Link between different analyses using [[wikilinks]]

## Technical Details

- **Engine**: WebR (R compiled to WebAssembly)
- **Packages**: Pre-installed with ggplot2 and dplyr
- **Execution**: Client-side processing in browser
- **Output**: Real-time rendering with execution tracking
- **Plots**: Automatic conversion to base64 PNG format

## Getting Started

1. Create a new note or open an existing one
2. Add an R code block with triple backticks and `r`
3. Write your R code
4. Click the "▶ Run" button
5. View results, plots, and output instantly


