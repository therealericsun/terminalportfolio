export type Cell = readonly [number, number];

// Gosper's period-30 glider gun, facing southeast (36 × 9 cells).
export const GLIDER_GUN: readonly Cell[] = [
    [24, 0], [22, 1], [24, 1],
    [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
    [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
    [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
    [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
    [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8],
];

const NORTHBOUND_GLIDER_GUN: readonly Cell[] = GLIDER_GUN.map(([x, y]) => [x, 8 - y]);

// Noam Elkies' period-104 B-52 bomber, a double-barrelled glider gun (39 × 21 cells).
export const B52_BOMBER: readonly Cell[] = [
    '.OO',
    '.OO.................O',
    '...................O.O............O.O',
    '....................O............O',
    'OO.......OO.......................O..O',
    'OO.O.....OO.......................O.O.O',
    '...O.......................O.......O..O',
    '...O.......................OO.......OO',
    'O..O.................OO.....O',
    '.OO..................O',
    '.....................OOO',
    '....................................OO',
    '....................................OO',
    '.OO',
    'O..O',
    'O.O.O................O.O....OO.....OO',
    '.O..O.................OO....OO.....OO.O',
    '.....O............O...O...............O',
    '..O.O............O.O..................O',
    '..................O................O..O',
    '....................................OO',
].flatMap((row, y) => Array.from(row).flatMap((cell, x): Cell[] => cell === 'O' ? [[x, y]] : []));

// A period-3 pulsar, with fourfold symmetry.
export const PULSAR: readonly Cell[] = [2, 3, 4, 8, 9, 10].flatMap((offset) =>
    [0, 5, 7, 12].flatMap((axis): Cell[] => [[offset, axis], [axis, offset]])
);

export const PENTADECATHLON: readonly Cell[] = [
    [2, 0], [7, 0],
    [0, 1], [1, 1], [3, 1], [4, 1], [5, 1], [6, 1], [8, 1], [9, 1],
    [2, 2], [7, 2],
];

const BEACON: readonly Cell[] = [[0, 0], [1, 0], [0, 1], [3, 2], [2, 3], [3, 3]];
export const TOAD: readonly Cell[] = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]];

// Robert Wainwright's Quasar: https://conwaylife.com/wiki/Quasar
export const QUASAR: readonly Cell[] = [
    '..........OOO...OOO..........',
    '.............................',
    '........O....O.O....O........',
    '........O....O.O....O........',
    '........O....O.O....O........',
    '..........OOO...OOO..........',
    '.............................',
    '........OOO.......OOO........',
    '..OOO..O....O...O....O..OOO..',
    '.......O....O...O....O.......',
    'O....O.O....O...O....O.O....O',
    'O....O.................O....O',
    'O....O..OOO.......OOO..O....O',
    '..OOO...................OOO..',
    '.............................',
    '..OOO...................OOO..',
    'O....O..OOO.......OOO..O....O',
    'O....O.................O....O',
    'O....O.O....O...O....O.O....O',
    '.......O....O...O....O.......',
    '..OOO..O....O...O....O..OOO..',
    '........OOO.......OOO........',
    '.............................',
    '..........OOO...OOO..........',
    '........O....O.O....O........',
    '........O....O.O....O........',
    '........O....O.O....O........',
    '.............................',
    '..........OOO...OOO..........',
].flatMap((row, y) => Array.from(row).flatMap((cell, x): Cell[] => cell === 'O' ? [[x, y]] : []));

/** A finite B3/S23 board. Cells beyond its edges are dead, not wrapped. */
export class LifeBoard {
    columns: number;
    rows: number;
    cells: Uint8Array;
    private buffer: Uint8Array;

    constructor(columns: number, rows: number) {
        this.columns = columns;
        this.rows = rows;
        this.cells = new Uint8Array(columns * rows);
        this.buffer = new Uint8Array(columns * rows);
    }

    get(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) return 0;
        return this.cells[y * this.columns + x];
    }

    toggle(x: number, y: number): void {
        if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) return;
        this.cells[y * this.columns + x] ^= 1;
    }

    stamp(pattern: readonly Cell[], x: number, y: number): void {
        for (const [px, py] of pattern) {
            const column = x + px;
            const row = y + py;
            if (column >= 0 && row >= 0 && column < this.columns && row < this.rows) {
                this.cells[row * this.columns + column] = 1;
            }
        }
    }

    step(): void {
        const { columns, rows, cells, buffer } = this;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                let neighbors = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const row = y + dy;
                    if (row < 0 || row >= rows) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const column = x + dx;
                        if ((dx === 0 && dy === 0) || column < 0 || column >= columns) continue;
                        neighbors += cells[row * columns + column];
                    }
                }
                const index = y * columns + x;
                buffer[index] = neighbors === 3 || (cells[index] === 1 && neighbors === 2) ? 1 : 0;
            }
        }
        this.cells = buffer;
        this.buffer = cells;
    }

    resize(columns: number, rows: number): void {
        const cells = new Uint8Array(columns * rows);
        for (let y = 0; y < Math.min(rows, this.rows); y++) {
            cells.set(this.cells.subarray(y * this.columns, y * this.columns + Math.min(columns, this.columns)), y * columns);
        }
        this.columns = columns;
        this.rows = rows;
        this.cells = cells;
        this.buffer = new Uint8Array(columns * rows);
    }
}

export function seedLife(board: LifeBoard, warmupGenerations = 90): void {
    const { columns, rows } = board;
    const reserved = new Uint8Array(columns * rows);
    const reserve = (x: number, y: number, width: number, height: number) => {
        for (let row = Math.max(0, y); row < Math.min(rows, y + height); row++) {
            for (let column = Math.max(0, x); column < Math.min(columns, x + width); column++) {
                reserved[row * columns + column] = 1;
            }
        }
    };
    const available = (x: number, y: number, width: number, height: number) => {
        if (x < 0 || y < 0 || x + width > columns || y + height > rows) return false;
        for (let row = y; row < y + height; row++) {
            for (let column = x; column < x + width; column++) {
                if (reserved[row * columns + column]) return false;
            }
        }
        return true;
    };
    const narrowPortrait = columns < 70;
    const compactLandscape = columns >= 80 && columns < 105 && rows >= 40 && rows < 60;
    const textArea = narrowPortrait
        ? { left: 1, top: 14, right: columns - 1, bottom: Math.max(15, rows - 34) }
        : { left: 6, top: 6, right: Math.min(columns - 6, Math.ceil(columns * 0.7)), bottom: Math.floor(rows * 0.58) };
    const overlapsText = (x: number, y: number, width: number, height: number) =>
        x < textArea.right && x + width > textArea.left && y < textArea.bottom && y + height > textArea.top;
    const availableForDecoration = (x: number, y: number, width: number, height: number) =>
        available(x, y, width, height) && !overlapsText(x, y, width, height);
    const addGosperGun = (x: number, y: number, shootsNorth = false) => {
        board.stamp(shootsNorth ? NORTHBOUND_GLIDER_GUN : GLIDER_GUN, x, y);
        reserve(x - 3, y - 3, 42, 15);
        if (shootsNorth) return;
        // Leave the entire flight path clear, including the gliders' changing shapes.
        for (let offset = 0; x + 20 + offset < columns && y + 6 + offset < rows; offset++) {
            reserve(x + 20 + offset, y + 6 + offset, 12, 12);
        }
    };
    const addB52Bomber = (x: number, y: number) => {
        // Offset only this gun so the global warmup lands it back on the
        // supplied phase without changing any of the other patterns.
        const phaseBoard = new LifeBoard(100, 80);
        const phaseOrigin: Cell = [30, 30];
        phaseBoard.stamp(B52_BOMBER, ...phaseOrigin);
        const phaseOffset = (104 - (warmupGenerations % 104)) % 104;
        for (let generation = 0; generation < phaseOffset; generation++) phaseBoard.step();
        const phasedPattern: Cell[] = [];
        for (let row = 0; row < phaseBoard.rows; row++) {
            for (let column = 0; column < phaseBoard.columns; column++) {
                if (phaseBoard.get(column, row)) {
                    phasedPattern.push([column - phaseOrigin[0], row - phaseOrigin[1]]);
                }
            }
        }
        board.stamp(phasedPattern, x, y);
        reserve(x - 3, y - 3, 45, 27);
        // Its barrels alternate gliders toward the northwest and southeast.
        for (let offset = 0; x + 5 - offset >= 0 && y - offset >= 0; offset++) {
            reserve(x - 4 - offset, y - 12 - offset, 12, 12);
        }
        for (let offset = 0; x + 35 + offset < columns && y + 17 + offset < rows; offset++) {
            reserve(x + 35 + offset, y + 17 + offset, 12, 12);
        }
    };

    // Narrow and compact screens put their gun above the copy. Its gliders are
    // intentionally allowed to cross the otherwise quiet reading area.
    if (narrowPortrait) {
        addGosperGun(Math.max(1, Math.floor((columns - 36) / 2)), 3);
    } else if (compactLandscape) {
        addGosperGun(columns - 41, 3);
    } else {
        addB52Bomber(Math.max(1, Math.floor(columns * 0.1)), Math.max(2, rows - 24));
    }
    if (columns >= 105 && rows >= 60) {
        // Fire the upper gun off the top edge so the swapped Quasar slot below
        // it remains collision-free.
        addGosperGun(columns - 41, 7, true);
    }
    // Put the Quasar above the pulsar on wide screens. Smaller layouts keep the
    // earlier arrangement because the large Quasar has only one collision-free slot.
    const quasarPositions = [
        ...(narrowPortrait ? [[Math.max(1, Math.floor((columns - 29) / 2)), rows - 31]] : []),
        ...(compactLandscape ? [[3, 14]] : []),
        [columns - 47, 21],
        [columns - 35, rows - 34],
        [Math.floor((columns - 29) / 2), 5],
    ];
    let quasarPlaced = false;
    for (const [x, y] of quasarPositions) {
        const padding = narrowPortrait || compactLandscape ? 1 : 2;
        const primaryWidePosition = !narrowPortrait && !compactLandscape && x === columns - 47 && y === 21;
        const spaceAvailable = primaryWidePosition
            ? available(x - padding, y - padding, 29 + padding * 2, 29 + padding * 2)
            : availableForDecoration(x - padding, y - padding, 29 + padding * 2, 29 + padding * 2);
        if (!spaceAvailable) continue;
        board.stamp(QUASAR, x, y);
        reserve(x - padding, y - padding, 29 + padding * 2, 29 + padding * 2);
        quasarPlaced = true;
        break;
    }
    // Very short viewports cannot physically fit the Quasar outside the copy.
    if (!quasarPlaced) {
        for (const [x, y] of quasarPositions) {
            if (!available(x, y, 29, 29)) continue;
            board.stamp(QUASAR, x, y);
            reserve(x, y, 29, 29);
            break;
        }
    }

    // Put the pulsar in the lower-right slot formerly occupied by the Quasar.
    const pulsarPositions = [
        ...(narrowPortrait ? [[1, 16]] : []),
        ...(compactLandscape ? [[36, 17]] : []),
        [columns - 18, rows - 18],
        [columns - 18, 21],
        [3, 3],
        [3, Math.floor(rows / 2) - 6],
        [Math.floor(columns / 2) - 6, rows - 18],
    ];
    for (let y = 3; y + 17 < rows; y += 18) {
        for (let x = 3; x + 17 < columns; x += 18) pulsarPositions.push([x, y]);
    }
    let pulsarPlaced = false;
    for (const [x, y] of pulsarPositions) {
        const padding = narrowPortrait || compactLandscape ? 1 : 2;
        if (!availableForDecoration(x - padding, y - padding, 13 + padding * 2, 13 + padding * 2)) continue;
        board.stamp(PULSAR, x, y);
        reserve(x - padding, y - padding, 13 + padding * 2, 13 + padding * 2);
        pulsarPlaced = true;
        break;
    }
    if (!pulsarPlaced) {
        for (const [x, y] of pulsarPositions) {
            if (!available(x, y, 13, 13)) continue;
            board.stamp(PULSAR, x, y);
            reserve(x, y, 13, 13);
            break;
        }
    }

    // Place exactly two toads in the remaining gaps before filling larger tiles.
    // Prefer the quiet perimeter, with an inner-area fallback for narrow phones.
    const toadCandidates: Cell[] = [
        [Math.floor(columns * 0.55), rows - 10],
        [Math.floor(columns * 0.55), Math.floor(rows * 0.66)],
        [columns - 10, Math.floor(rows * 0.55)],
        [3, rows - 10],
        [columns - 10, 4],
    ];
    for (let y = 4; y + 6 < rows; y += 8) {
        for (let x = 4; x + 8 < columns; x += 10) toadCandidates.push([x, y]);
    }
    let toadsPlaced = 0;
    for (const avoidText of [true, false]) {
        for (const [x, y] of toadCandidates) {
            if (toadsPlaced === 2) break;
            const open = avoidText
                ? availableForDecoration(x - 2, y - 2, 8, 6)
                : available(x - 2, y - 2, 8, 6);
            if (!open) continue;
            board.stamp(TOAD, x, y);
            reserve(x - 2, y - 2, 8, 6);
            toadsPlaced++;
        }
        if (toadsPlaced === 2) break;
    }

    // Fill remaining open tiles with smaller oscillators only.
    for (let y = 3, tileRow = 0; y + 18 < rows; y += 18, tileRow++) {
        for (let x = 3, tileColumn = 0; x + 18 < columns; x += 18, tileColumn++) {
            if (!availableForDecoration(x, y, 18, 18)) continue;
            const variant = (tileColumn * 3 + tileRow * 2) % 3;
            if (variant === 1) {
                board.stamp(PENTADECATHLON, x + 4, y + 8);
            } else {
                board.stamp(BEACON, x + 7, y + 7);
            }
        }
    }

    // Two restrained blinkers keep the reading area alive without obscuring it.
    const blinker: readonly Cell[] = [[0, 0], [1, 0], [2, 0]];
    const blinkerCandidates = [
        [Math.max(2, Math.floor(textArea.right * 0.28)), Math.max(textArea.top + 3, Math.floor(textArea.bottom * 0.58))],
        [Math.max(2, Math.floor(textArea.right * 0.68)), Math.max(textArea.top + 6, Math.floor(textArea.bottom * 0.82))],
        [Math.max(2, Math.floor(textArea.right * 0.48)), Math.max(textArea.top + 3, Math.floor(textArea.bottom * 0.7))],
    ];
    let blinkersPlaced = 0;
    for (const [x, y] of blinkerCandidates) {
        if (blinkersPlaced === 2 || !available(x - 3, y - 3, 9, 7)) continue;
        board.stamp(blinker, x, y);
        reserve(x - 3, y - 3, 9, 7);
        blinkersPlaced++;
    }

    // Start with a few gliders already in flight.
    for (let generation = 0; generation < warmupGenerations; generation++) board.step();
}
