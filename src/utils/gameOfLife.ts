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

// A period-3 pulsar, with fourfold symmetry.
export const PULSAR: readonly Cell[] = [2, 3, 4, 8, 9, 10].flatMap((offset) =>
    [0, 5, 7, 12].flatMap((axis): Cell[] => [[offset, axis], [axis, offset]])
);

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

export function seedLife(board: LifeBoard): void {
    const { columns, rows } = board;
    // Separate southeast-facing streams keep the guns from hitting each other.
    board.stamp(GLIDER_GUN, Math.max(1, Math.floor(columns * 0.1)), Math.max(2, rows - 24));
    if (columns >= 85 && rows >= 45) {
        board.stamp(GLIDER_GUN, columns - 41, 7);
    }
    if (columns >= 100 && rows >= 65) {
        board.stamp(PULSAR, columns - 20, rows - 20);
    }
    board.stamp([[0, 0], [1, 0], [2, 0]], 3, Math.floor(rows * 0.4));
    board.stamp([[0, 0], [1, 0], [0, 1], [3, 2], [2, 3], [3, 3]], 3, 5);

    // Start with a few gliders already in flight.
    for (let generation = 0; generation < 90; generation++) board.step();
}
