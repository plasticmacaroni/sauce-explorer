// Global variables
let graph;
let simulation;
let svg;
let width;
let height;
let zoomHandler;
let tooltip;
let ingredientMode = false;
let selectedNode = null;
let selectedIngredients = new Set();
let searchTerm = '';
let imageCache = {}; // Cache for Wikipedia images

// Initialize the visualization
document.addEventListener('DOMContentLoaded', () => {
    // Set up the SVG container
    const container = document.getElementById('graph-container');
    width = container.clientWidth;
    height = container.clientHeight || 600;

    // Create SVG element
    svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Add zoom capabilities
    const g = svg.append('g');
    zoomHandler = d3.zoom()
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    svg.call(zoomHandler);

    // Create tooltip
    tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);

    // Load data
    loadData();

    // Event listeners
    document.getElementById('reset-view').addEventListener('click', resetView);
    document.getElementById('show-ingredients').addEventListener('change', (e) => {
        ingredientMode = e.target.checked;
        updateVisualization();
    });
    document.getElementById('search').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        updateVisualization();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        width = container.clientWidth;
        height = container.clientHeight || 600;
        svg.attr('width', width).attr('height', height);
        updateVisualization();
    });
});

// Load data from JSON file
function loadData() {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            graph = data;
            processData();
            createVisualization();
        })
        .catch(error => console.error('Error loading data:', error));
}

// Process the loaded data
function processData() {
    // Ensure all nodes have a type
    graph.nodes.forEach(node => {
        if (!node.type) node.type = 'sauce';
    });

    // Extract all unique ingredients from the sauces
    const allIngredients = new Set();
    graph.nodes.forEach(sauce => {
        if (sauce.ingredients) {
            sauce.ingredients.forEach(ingredient => {
                // Skip sauce ingredients (those that match existing sauce names)
                const isSauce = graph.nodes.some(node => node.name === ingredient);
                if (!isSauce) {
                    allIngredients.add(ingredient);
                }
            });
        }
    });

    // Create ingredient nodes
    const ingredientNodes = Array.from(allIngredients).map(ingredientName => ({
        id: ingredientName.toLowerCase().replace(/\s+/g, '_'),
        name: ingredientName,
        type: 'ingredient',
        country: null
    }));

    // Add to nodes array
    graph.allNodes = [...graph.nodes, ...ingredientNodes];

    // Create links between sauces and their ingredients
    const ingredientLinks = [];
    graph.nodes.forEach(sauce => {
        if (sauce.ingredients) {
            sauce.ingredients.forEach(ingredient => {
                // Skip sauce-to-sauce ingredient links when drawing
                const isSauce = graph.nodes.some(node => node.name === ingredient);
                if (!isSauce) {
                    const ingredientId = ingredient.toLowerCase().replace(/\s+/g, '_');
                    ingredientLinks.push({
                        source: ingredientId,
                        target: sauce.id,
                        type: 'ingredient'
                    });
                }
            });
        }
    });

    // Create parent-child relationships from parent field
    const parentLinks = [];
    graph.nodes.forEach(sauce => {
        if (sauce.parent) {
            parentLinks.push({
                source: sauce.parent,
                target: sauce.id,
                type: 'parent',
                relationship: sauce.relationshipToParent
            });
        }
    });

    // Add to links array
    graph.allLinks = [...parentLinks, ...ingredientLinks];
}

// Create the visualization
function createVisualization() {
    const g = svg.select('g');

    // Clear previous elements
    g.selectAll('*').remove();

    // Create arrow markers for parent links
    svg.append('defs').selectAll('marker')
        .data(['parent'])
        .enter().append('marker')
        .attr('id', d => d)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#999');

    updateVisualization();

    // Apply initial zoom to fit the graph
    resetView();
}

// Filter nodes and links based on current settings
function getFilteredGraph() {
    let nodes, links;
    const hasSearch = searchTerm && searchTerm.trim() !== '';
    const hasIngredientFilter = selectedIngredients.size > 0;

    // Start with all nodes
    if (ingredientMode) {
        nodes = graph.allNodes;
        links = graph.allLinks;
    } else {
        nodes = graph.nodes;
        links = graph.allLinks.filter(link => link.type === 'parent');
    }

    // Apply search filtering if needed
    if (hasSearch) {
        const lowerSearch = searchTerm.toLowerCase();

        // Get nodes that match search
        const matchingNodeIds = nodes
            .filter(node => node.name.toLowerCase().includes(lowerSearch))
            .map(node => node.id);

        // For ingredient mode, also include connected sauces/ingredients
        if (ingredientMode) {
            // Find connections (sauces that use matching ingredients or ingredients used by matching sauces)
            const connectedIds = new Set(matchingNodeIds);

            // Add ingredients of matching sauces
            nodes.forEach(node => {
                if (matchingNodeIds.includes(node.id) && node.type === 'sauce' && node.ingredients) {
                    node.ingredients.forEach(ing => {
                        // Check if the ingredient is another sauce
                        const isSauce = graph.nodes.some(n => n.name === ing);
                        if (!isSauce) {
                            const ingId = ing.toLowerCase().replace(/\s+/g, '_');
                            connectedIds.add(ingId);
                        } else {
                            const sauceNode = graph.nodes.find(n => n.name === ing);
                            if (sauceNode) connectedIds.add(sauceNode.id);
                        }
                    });
                }
            });

            // Add sauces that use matching ingredients
            links.forEach(link => {
                if (link.type === 'ingredient') {
                    if (matchingNodeIds.includes(link.source.id || link.source)) {
                        connectedIds.add(link.target.id || link.target);
                    }
                }
            });

            // Filter nodes to just those matching or connected
            nodes = nodes.filter(node => connectedIds.has(node.id));

            // Filter links to connections between remaining nodes
            links = links.filter(link =>
                connectedIds.has(link.source.id || link.source) &&
                connectedIds.has(link.target.id || link.target)
            );
        } else {
            // In sauce-only mode, just show exact matches and parent/child relationships
            const directRelationships = new Set();

            // Add parent and children
            nodes.forEach(node => {
                if (matchingNodeIds.includes(node.id)) {
                    // Add parent if exists
                    if (node.parent) directRelationships.add(node.parent);

                    // Add children (sauces that have this node as parent)
                    const children = graph.nodes.filter(n => n.parent === node.id);
                    children.forEach(child => directRelationships.add(child.id));
                }
            });

            // Final set of nodes to include
            const finalNodeIds = new Set([...matchingNodeIds, ...directRelationships]);

            nodes = nodes.filter(node => finalNodeIds.has(node.id));
            links = links.filter(link =>
                finalNodeIds.has(link.source.id || link.source) &&
                finalNodeIds.has(link.target.id || link.target)
            );
        }
    }
    // Apply ingredient filtering if needed
    else if (hasIngredientFilter) {
        // Find sauces that use all selected ingredients
        const filteredSauceIds = graph.nodes
            .filter(sauce =>
                sauce.ingredients &&
                Array.from(selectedIngredients).every(ingName => {
                    const normalizedIngName = ingName.toLowerCase();
                    return sauce.ingredients.some(i => i.toLowerCase() === normalizedIngName);
                })
            )
            .map(sauce => sauce.id);

        // Get ingredient IDs from names
        const selectedIngredientIds = Array.from(selectedIngredients).map(
            name => name.toLowerCase().replace(/\s+/g, '_')
        );

        // Include the selected ingredients and sauces that use them
        const nodesToInclude = new Set([
            ...selectedIngredientIds,
            ...filteredSauceIds
        ]);

        // Filter nodes to only include selected ingredients and related sauces
        nodes = nodes.filter(node => nodesToInclude.has(node.id));

        // Filter links to only include connections between these nodes
        links = links.filter(link =>
            nodesToInclude.has(link.source.id || link.source) &&
            nodesToInclude.has(link.target.id || link.target)
        );
    }

    return { nodes, links };
}

// Update the visualization based on current mode
function updateVisualization() {
    const g = svg.select('g');

    // Get filtered data
    const { nodes, links } = getFilteredGraph();

    // Check if anything filtered
    const isFiltered = searchTerm || selectedIngredients.size > 0;

    // Add a "Clear filters" button if filtering is active
    const filterInfo = document.getElementById('filter-info');
    if (isFiltered) {
        if (!filterInfo) {
            const filterDiv = document.createElement('div');
            filterDiv.id = 'filter-info';
            filterDiv.innerHTML = `
                <div class="active-filters">
                    ${searchTerm ? `<span class="filter-tag">Search: "${searchTerm}"</span>` : ''}
                    ${Array.from(selectedIngredients).map(ing =>
                `<span class="filter-tag">Ingredient: ${ing}</span>`
            ).join('')}
                </div>
                <button id="clear-filters">Clear All Filters</button>
            `;
            document.querySelector('.controls').appendChild(filterDiv);

            document.getElementById('clear-filters').addEventListener('click', () => {
                resetFilters();
            });
        } else {
            filterInfo.innerHTML = `
                <div class="active-filters">
                    ${searchTerm ? `<span class="filter-tag">Search: "${searchTerm}"</span>` : ''}
                    ${Array.from(selectedIngredients).map(ing =>
                `<span class="filter-tag">Ingredient: ${ing}</span>`
            ).join('')}
                </div>
                <button id="clear-filters">Clear All Filters</button>
            `;

            document.getElementById('clear-filters').addEventListener('click', () => {
                resetFilters();
            });
        }
    } else if (filterInfo) {
        filterInfo.remove();
    }

    // Create links
    const link = g.selectAll('.link')
        .data(links)
        .join('line')
        .attr('class', d => `link ${d.type}`)
        .attr('stroke-width', 1.5)
        .attr('marker-end', d => d.type === 'parent' ? 'url(#parent)' : null);

    // Create node groups
    const node = g.selectAll('.node')
        .data(nodes)
        .join('g')
        .attr('class', d => `node ${d.type}`)
        .call(drag(simulation))
        .on('click', (event, d) => {
            if (d.type === 'ingredient') {
                if (event.ctrlKey || event.metaKey) {
                    // Add to multi-select with Ctrl/Cmd key
                    if (selectedIngredients.has(d.name)) {
                        selectedIngredients.delete(d.name);
                    } else {
                        selectedIngredients.add(d.name);
                    }
                } else {
                    // Single select (clear others)
                    selectedIngredients.clear();
                    selectedIngredients.add(d.name);
                }

                // Clear search when filtering by ingredient
                searchTerm = '';
                document.getElementById('search').value = '';

                // Update visualization based on ingredient filter
                updateVisualization();
            } else {
                selectedNode = d;
                showSauceDetails(d);
            }
            event.stopPropagation();
        })
        .on('mouseover', (event, d) => {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);

            let html = `<strong>${d.name}</strong>`;
            if (d.country) {
                html += `<br>${getCountryFlag(d.country)} ${d.country}`;
            }

            if (d.type === 'ingredient') {
                html += `<br><em>Click to filter by this ingredient</em>`;
                html += `<br><em>(Hold Ctrl/Cmd to select multiple)</em>`;
            }

            tooltip.html(html)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', () => {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });

    // Add circles to nodes
    node.selectAll('circle')
        .data(d => [d])
        .join('circle')
        .attr('r', d => d.type === 'sauce' ? 10 : 5)
        .attr('fill', d => {
            if (d.type === 'ingredient') {
                return selectedIngredients.has(d.name) ? '#ff5252' : '#7fbbff';
            }

            // Color sauce nodes based on country
            const countryColors = {
                'FR': '#3498db', // French - blue
                'IT': '#27ae60', // Italian - green
                'ES': '#f1c40f', // Spanish - yellow
                'MX': '#e74c3c', // Mexican - red
                'JP': '#9b59b6', // Japanese - purple
                'CN': '#e67e22', // Chinese - orange
                'HK': '#e67e22', // Hong Kong - orange
                'KR': '#c0392b'  // Korean - dark red
            };

            return countryColors[d.country] || '#95a5a6'; // Default gray
        });

    // Add labels to nodes
    node.selectAll('text')
        .data(d => [d])
        .join('text')
        .attr('dx', 12)
        .attr('dy', '.35em')
        .text(d => d.name)
        .style('font-size', d => d.type === 'sauce' ? '10px' : '8px')
        .style('fill', d => d.type === 'sauce' ? '#000' : '#666');

    // Add flags for sauce nodes
    node.filter(d => d.type === 'sauce' && d.country)
        .selectAll('.flag')
        .data(d => [d])
        .join('text')
        .attr('class', 'flag')
        .attr('dx', -15)
        .attr('dy', -12)
        .text(d => getCountryFlag(d.country));

    // Set up the force simulation
    simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(80))
        .force('charge', d3.forceManyBody().strength(-150))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05))
        .on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

    // Update sauce details if a node is selected
    if (selectedNode) {
        // Check if selected node is still visible
        if (nodes.some(n => n.id === selectedNode.id)) {
            showSauceDetails(selectedNode);
        } else {
            // Clear selection if node is now hidden
            selectedNode = null;
            document.getElementById('sauce-details').innerHTML = '<p>Select a sauce to see details</p>';
        }
    }
}

// Reset filters and search
function resetFilters() {
    searchTerm = '';
    document.getElementById('search').value = '';
    selectedIngredients.clear();
    updateVisualization();
}

// Drag functionality for nodes
function drag(simulation) {
    function dragstarted(event) {
        if (!simulation) return;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!simulation) return;
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
}

// Reset view to fit the entire graph
function resetView() {
    const g = svg.select('g');

    // Reset zoom
    svg.transition()
        .duration(750)
        .call(zoomHandler.transform, d3.zoomIdentity.scale(0.8).translate(width / 2, height / 2));

    // Reset filters
    resetFilters();

    // Clear sauce details
    selectedNode = null;
    document.getElementById('sauce-details').innerHTML = '<p>Select a sauce to see details</p>';
}

// Fetch Wikipedia image for a sauce
async function fetchWikipediaImage(wikipediaUrl) {
    // Return cached image if available
    if (imageCache[wikipediaUrl]) {
        return imageCache[wikipediaUrl];
    }

    // Extract page title from URL
    const pageTitle = wikipediaUrl.split('/').pop();

    try {
        // Use Wikipedia API to fetch page information
        const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        // Get thumbnail or main image
        let imageUrl = null;
        if (data.thumbnail) {
            imageUrl = data.thumbnail.source;
        }

        // Cache the result
        imageCache[wikipediaUrl] = imageUrl;
        return imageUrl;
    } catch (error) {
        console.error('Error fetching Wikipedia image:', error);
        return null;
    }
}

// Show sauce or ingredient details
async function showSauceDetails(node) {
    const detailsContainer = document.getElementById('sauce-details');

    if (node.type === 'sauce') {
        // Show loading state
        detailsContainer.innerHTML = `
            <h3>${node.name}</h3>
            <p>Loading details...</p>
        `;

        // Fetch image from Wikipedia if available
        let imageHtml = '';
        if (node.wikipedia) {
            const imageUrl = await fetchWikipediaImage(node.wikipedia);
            if (imageUrl) {
                imageHtml = `<img src="${imageUrl}" alt="${node.name}" class="sauce-image">`;
            }
        }

        // Find parent sauce
        let parentHtml = '';
        if (node.parent) {
            const parentNode = graph.nodes.find(n => n.id === node.parent);
            if (parentNode) {
                parentHtml = `
                    <h4>Parent Sauce:</h4>
                    <p><strong>${parentNode.name}</strong> - ${node.relationshipToParent || 'Derivative'}</p>
                `;
            }
        }

        // Find child sauces
        const childSauces = graph.nodes.filter(n => n.parent === node.id);
        let derivativesHtml = '';
        if (childSauces.length > 0) {
            derivativesHtml = `
                <h4>Derivatives:</h4>
                <ul>
                    ${childSauces.map(sauce => `<li>${sauce.name}</li>`).join('')}
                </ul>
            `;
        }

        // Create HTML for sauce details
        let html = `
            <h3>${node.name}</h3>
            ${node.country ? `<p class="country">${getCountryFlag(node.country)} ${getCountryName(node.country)}</p>` : ''}
            ${imageHtml}
            <p>${node.description || 'No description available.'}</p>
            ${node.wikipedia ? `<p><a href="${node.wikipedia}" target="_blank">Wikipedia</a></p>` : ''}
            
            ${parentHtml}
            ${derivativesHtml}
            
            <h4>Ingredients:</h4>
            <ul class="ingredients-list">
                ${node.ingredients && node.ingredients.length > 0 ?
                node.ingredients.map(ingredient => {
                    // Check if this ingredient is another sauce
                    const sauceNode = graph.nodes.find(n => n.name === ingredient);
                    if (sauceNode) {
                        return `<li><span class="sauce-component" data-id="${sauceNode.id}">${ingredient}</span></li>`;
                    } else {
                        const isFiltered = selectedIngredients.has(ingredient);
                        return `<li>
                                <span class="ingredient">${ingredient}</span>
                                <button class="filter-btn" data-name="${ingredient}">
                                    ${isFiltered ? 'Unfilter' : 'Filter by this'}
                                </button>
                            </li>`;
                    }
                }).join('') :
                '<li>No ingredients listed</li>'}
            </ul>
        `;

        detailsContainer.innerHTML = html;

        // Add event listeners to ingredient filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name;
                if (selectedIngredients.has(name)) {
                    // If already filtered, remove the filter
                    selectedIngredients.delete(name);
                } else {
                    // If not filtered, add the filter
                    selectedIngredients.add(name);
                }

                // Clear search
                searchTerm = '';
                document.getElementById('search').value = '';

                updateVisualization();
            });
        });

        // Add click handlers for sauce components
        document.querySelectorAll('.sauce-component').forEach(elem => {
            elem.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const sauceNode = graph.nodes.find(n => n.id === id);
                if (sauceNode) {
                    selectedNode = sauceNode;
                    showSauceDetails(sauceNode);
                }
            });
        });
    } else if (node.type === 'ingredient') {
        // Find sauces that use this ingredient
        const sauces = graph.nodes.filter(sauce =>
            sauce.ingredients && sauce.ingredients.some(ing =>
                ing.toLowerCase() === node.name.toLowerCase()
            )
        );

        const isFiltered = selectedIngredients.has(node.name);
        let html = `
            <h3>${node.name}</h3>
            <button id="filter-by-ingredient" class="btn">
                ${isFiltered ? 'Unfilter' : 'Show Only Sauces With This Ingredient'}
            </button>
            <p>Used in ${sauces.length} sauce${sauces.length !== 1 ? 's' : ''}:</p>
            <ul class="sauces-list">
                ${sauces.length > 0 ?
                sauces.map(sauce => `<li><span class="sauce-link" data-id="${sauce.id}">${sauce.name}</span></li>`).join('') :
                '<li>No sauces found</li>'}
            </ul>
        `;

        detailsContainer.innerHTML = html;

        // Add event listeners
        document.getElementById('filter-by-ingredient').addEventListener('click', () => {
            if (selectedIngredients.has(node.name)) {
                // Clear the filter
                selectedIngredients.delete(node.name);
            } else {
                // Set this as the only filter
                selectedIngredients.clear();
                selectedIngredients.add(node.name);
            }
            updateVisualization();
        });

        // Add click handlers for sauce links
        document.querySelectorAll('.sauce-link').forEach(elem => {
            elem.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const sauceNode = graph.nodes.find(n => n.id === id);
                if (sauceNode) {
                    selectedNode = sauceNode;
                    showSauceDetails(sauceNode);
                }
            });
        });
    }

    // Highlight selected node
    d3.selectAll('.node').classed('selected', d => d.id === node.id);
}

// Get country flag emoji
function getCountryFlag(countryCode) {
    // Map country codes to flag emojis using Unicode regional indicator symbols
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));

    return String.fromCodePoint(...codePoints);
}

// Get country name from code
function getCountryName(code) {
    const countries = {
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'MX': 'Mexico',
        'JP': 'Japan',
        'CN': 'China',
        'HK': 'Hong Kong',
        'KR': 'Korea'
    };

    return countries[code] || code;
}

// Add CSS styles
document.head.insertAdjacentHTML('beforeend', `
<style>
    .tooltip {
        position: absolute;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 10px;
        pointer-events: none;
        font-size: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    
    .node.highlighted circle {
        stroke: #f39c12;
        stroke-width: 3px;
    }
    
    .node.faded {
        opacity: 0.3;
    }
    
    .node.selected circle {
        stroke: #e74c3c;
        stroke-width: 3px;
    }
    
    .node.ingredient circle {
        cursor: pointer;
    }
    
    .country {
        font-size: 14px;
        margin-bottom: 10px;
    }
    
    .sauce-image {
        max-width: 100%;
        max-height: 150px;
        display: block;
        margin: 10px 0;
        border-radius: 4px;
    }
    
    .ingredients-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3px;
    }
    
    .filter-btn {
        font-size: 10px;
        padding: 2px 5px;
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 3px;
        cursor: pointer;
    }
    
    .sauce-component, .sauce-link {
        color: #3498db;
        cursor: pointer;
        text-decoration: underline;
    }
    
    .link.parent {
        stroke: #999;
        stroke-width: 2px;
    }
    
    .link.ingredient {
        stroke: #ddd;
        stroke-width: 1px;
        stroke-dasharray: 3, 3;
    }
    
    #filter-by-ingredient {
        margin-bottom: 10px;
        padding: 5px 10px;
        background: #3498db;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    #filter-info {
        margin-top: 10px;
        background: #f8f9fa;
        padding: 5px 10px;
        border-radius: 4px;
        width: 100%;
    }
    
    .active-filters {
        margin-bottom: 5px;
    }
    
    .filter-tag {
        background: #e1f5fe;
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 12px;
        margin-right: 5px;
        display: inline-block;
        margin-bottom: 5px;
    }
    
    #clear-filters {
        background: #f44336;
        color: white;
        border: none;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
    }
</style>
`); 