// Bonsai tree generator with animation - inspired by cbonsai

interface TreeCell {
    char: string;
    type: 'trunk' | 'branch' | 'leaf' | 'pot';
    layer: 'pot' | 'structure' | 'leaves';
}

// Seeded random number generator
class SeededRandom {
    private seed: number;
    
    constructor(seed: number) {
        this.seed = seed;
    }
    
    next(): number {
        // Simple LCG algorithm
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

export async function generateBonsai(seed: number): Promise<void> {
    const rng = new SeededRandom(seed);
    const width = 60;
    const height = 14;
    const grid: (TreeCell | null)[][] = Array(height).fill(null).map(() => Array(width).fill(null));
    
    // Tree configuration - much shorter trunk, wider canopy
    const trunkHeight = 2 + Math.floor(rng.next() * 2);
    const trunkX = Math.floor(width / 2);
    
    // Draw very short trunk
    for (let y = height - 3; y >= height - trunkHeight - 2; y--) {
        const offset = Math.floor((rng.next() - 0.5) * 0.5);
        grid[y][trunkX + offset] = { char: '|', type: 'trunk', layer: 'structure' };
    }
    
    // Generate branches recursively with cbonsai style
    function drawBranch(x: number, y: number, length: number, angle: number, depth: number) {
        if (depth <= 0 || length < 1.5) {
            // Add leaves at branch ends
            const leafChars = ['&', '&', '&', '&', '&', '@', '*'];
            const leaf = leafChars[Math.floor(rng.next() * leafChars.length)];
            if (y >= 0 && y < height && x >= 0 && x < width) {
                grid[y][x] = { char: leaf, type: 'leaf', layer: 'leaves' };
            }
            return;
        }
        
        const endX = Math.round(x + length * Math.cos(angle));
        const endY = Math.round(y - length * Math.sin(angle));
        
        // Draw branch line
        const steps = Math.max(Math.abs(endX - x), Math.abs(endY - y));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = Math.round(x + (endX - x) * t);
            const by = Math.round(y + (endY - y) * t);
            
            if (by >= 0 && by < height && bx >= 0 && bx < width) {
                if (!grid[by][bx]) {
                    let char = '~';
                    if (angle > Math.PI / 3 && angle < 2 * Math.PI / 3) {
                        char = '/';
                    } else if (angle < -Math.PI / 6 || angle > 7 * Math.PI / 6) {
                        char = '\\';
                    } else {
                        char = ['~', '_'][Math.floor(rng.next() * 2)];
                    }
                    grid[by][bx] = { char, type: 'branch', layer: 'structure' };
                    
                    // Add leaves along branches for fuller look
                    if (depth < 3 && rng.next() > 0.6) {
                        const leafChars = ['&', '&', '&', '&', '@'];
                        const leaf = leafChars[Math.floor(rng.next() * leafChars.length)];
                        const leafOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                        const offset = leafOffsets[Math.floor(rng.next() * leafOffsets.length)];
                        const lx = bx + offset[0];
                        const ly = by + offset[1];
                        if (ly >= 0 && ly < height && lx >= 0 && lx < width && !grid[ly][lx]) {
                            grid[ly][lx] = { char: leaf, type: 'leaf', layer: 'leaves' };
                        }
                    }
                }
            }
        }
        
        // Recursively draw sub-branches
        const newLength = length * (0.7 + rng.next() * 0.2);
        const angleVariation = (rng.next() - 0.5) * Math.PI / 2.5;
        const numBranches = depth > 3 ? 3 + Math.floor(rng.next() * 2) : 2;
        
        for (let i = 0; i < numBranches; i++) {
            if (rng.next() > 0.1) {
                const baseAngle = (i === 0 ? 1 : -1) * (Math.PI / 4 + rng.next() * Math.PI / 6);
                const branchAngle = angle + baseAngle + angleVariation;
                drawBranch(endX, endY, newLength, branchAngle, depth - 1);
            }
        }
        
        // Add extra leaves near branch ends
        if (depth <= 2) {
            const leafChars = ['&', '&', '&', '@'];
            for (let j = 0; j < 2; j++) {
                const lx = endX + Math.floor((rng.next() - 0.5) * 3);
                const ly = endY + Math.floor((rng.next() - 0.5) * 2);
                if (ly >= 0 && ly < height && lx >= 0 && lx < width && !grid[ly][lx]) {
                    grid[ly][lx] = { char: leafChars[Math.floor(rng.next() * leafChars.length)], type: 'leaf', layer: 'leaves' };
                }
            }
        }
    }
    
    // Start branches from top of trunk
    const branchStartY = height - trunkHeight - 2;
    const initialBranches = 4 + Math.floor(rng.next() * 2);
    
    for (let i = 0; i < initialBranches; i++) {
        // Keep initial branches more horizontal
        const angle = Math.PI / 2 + (rng.next() - 0.5) * Math.PI / 1.2;
        const length = 5 + rng.next() * 3;
        drawBranch(trunkX, branchStartY, length, angle, 3 + Math.floor(rng.next() * 2));
    }
    
    // Draw pot
    const potWidth = 12;
    const potLeft = trunkX - Math.floor(potWidth / 2);
    grid[height - 2][potLeft] = { char: '(', type: 'pot', layer: 'pot' };
    for (let i = 1; i < potWidth - 1; i++) {
        grid[height - 2][potLeft + i] = { char: '_', type: 'pot', layer: 'pot' };
    }
    grid[height - 2][potLeft + potWidth - 1] = { char: ')', type: 'pot', layer: 'pot' };
    
    grid[height - 1][potLeft] = { char: '\\', type: 'pot', layer: 'pot' };
    for (let i = 1; i < potWidth - 1; i++) {
        grid[height - 1][potLeft + i] = { char: '_', type: 'pot', layer: 'pot' };
    }
    grid[height - 1][potLeft + potWidth - 1] = { char: '/', type: 'pot', layer: 'pot' };
    
    // Create output container
    const treeId = 'bonsai-' + Date.now();
    const outputDiv = document.createElement('div');
    outputDiv.id = treeId;
    outputDiv.style.fontFamily = 'monospace';
    outputDiv.style.lineHeight = '1.2';
    outputDiv.style.whiteSpace = 'pre';
    
    const outputElement = document.getElementById('output');
    if (outputElement) {
        outputElement.appendChild(outputDiv);
    }
    
    // Find leftmost content for padding
    let minX = width;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x]) {
                minX = Math.min(minX, x);
            }
        }
    }
    const startX = Math.max(0, minX - 2);
    
    // Pre-render all lines as empty space first
    const treeDiv = document.getElementById(treeId);
    if (treeDiv) {
        for (let y = 0; y < height; y++) {
            const lineDiv = document.createElement('div');
            lineDiv.innerHTML = ' ';
            lineDiv.id = `${treeId}-line-${y}`;
            treeDiv.appendChild(lineDiv);
        }
    }
    
    // Animate drawing from bottom to top, filling in the pre-rendered lines
    for (let y = height - 1; y >= 0; y--) {
        await new Promise(resolve => setTimeout(resolve, 60));
        
        let line = '';
        for (let x = startX; x < width; x++) {
            const cell = grid[y][x];
            if (cell) {
                const color = cell.type === 'trunk' || cell.type === 'branch' 
                    ? '#ba7747ff' 
                    : cell.type === 'leaf' 
                    ? '#37c53eff' 
                    : '#b9b9b9ff';
                line += `<span style="color: ${color}">${cell.char}</span>`;
            } else {
                line += ' ';
            }
        }
        
        const trimmedLine = line.trimEnd();
        const lineDiv = document.getElementById(`${treeId}-line-${y}`);
        if (lineDiv) {
            lineDiv.innerHTML = trimmedLine || ' ';
        }
        
        // Keep the growing tree visible inside the terminal.
        const terminal = document.querySelector<HTMLElement>('.terminal-scroll');
        terminal?.scrollTo({
            top: terminal.scrollHeight,
            behavior: 'smooth'
        });
    }
}
