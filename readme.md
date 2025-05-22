# Sauce Network Explorer

I want to explore various sauces for cooking and their ingredients. This is a network graph of parents, optional additions, and descendent sauces starting from the top.

This is an explorable webapp experience. All sauces have a tiny flag for country (or if disputed, countries) of origin. All sauces have their names hyperlinked to Wikipedia pages about them. You can view an ingredient (e.g. anchovies) as well as a sauce that includes them, and you can see all parents and descendents at once.

## Features

- Interactive network visualization of sauce relationships
- Toggle between showing only sauces or including ingredients
- Detailed information panel for each sauce including:
  - Country of origin with flag
  - Description
  - Wikipedia link
  - Ingredients list
- Search functionality to find specific sauces or ingredients
- Responsive design that works on different screen sizes

## How to Use

1. Open `index.html` in any modern web browser
2. Explore the sauce network:
   - Click and drag nodes to reposition them
   - Click on a node to see details in the right panel
   - Use the mouse wheel to zoom in/out
   - Toggle "Show Ingredients" to view ingredients in the network
   - Use the search box to find specific sauces or ingredients
   - Click "Reset View" to return to the original view

## Data Structure

The sauce data is stored in `data.json` and follows this structure:

- **nodes**: Array of sauce objects with:
  - id, name, type, country, description, wikipedia URL, ingredients
- **links**: Relationships between sauces (parent/child)
- **ingredients**: Detailed ingredient information

## Adding New Sauces

To add new sauces or ingredients, edit the `data.json` file following the existing format.

## Technical Details

This project uses:

- Vanilla JavaScript (no frameworks)
- D3.js for visualization
- Static HTML/CSS for the interface

All functionality is contained in three files:

- `index.html` - Structure
- `styles.css` - Styling
- `script.js` - Functionality
- `data.json` - Sauce data
