import { LifeBoard, seedLife } from '../utils/gameOfLife';

const canvas = document.querySelector<HTMLCanvasElement>('#life-canvas');
const context = canvas?.getContext('2d');

if (canvas && context) {
    const cellSize = window.innerWidth < 360 ? 6 : window.innerWidth < 600 ? 8 : 12;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let speed = reducedMotion.matches ? 0 : 1;
    let board: LifeBoard;
    let width = 0;
    let height = 0;
    let frame: number | undefined;
    let lastStep = 0;

    function draw() {
        if (!canvas || !context) return;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#4eb3b5';
        for (let y = 0; y < board.rows; y++) {
            for (let x = 0; x < board.columns; x++) {
                if (board.get(x, y)) context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
            }
        }
    }

    function resize() {
        if (!canvas || !context) return;
        const bounds = canvas.getBoundingClientRect();
        width = bounds.width;
        height = bounds.height;
        const columns = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);
        if (board) {
            if (board.columns !== columns || board.rows !== rows) board.resize(columns, rows);
        } else {
            board = new LifeBoard(columns, rows);
            seedLife(board);
        }
        // Cap backing-store resolution to avoid oversized canvases on mobile.
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        draw();
    }

    function tick(now: number) {
        frame = undefined;
        if (speed === 0 || document.hidden) return;
        const interval = 1000 / (8 * speed);
        if (now - lastStep >= interval) {
            // No catch-up bursts after a suspended or busy tab.
            lastStep = now - ((now - lastStep) % interval);
            board.step();
            draw();
        }
        frame = requestAnimationFrame(tick);
    }

    function schedule() {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
        lastStep = performance.now();
        if (speed > 0 && !document.hidden) frame = requestAnimationFrame(tick);
    }

    reducedMotion.addEventListener('change', (event) => {
        speed = event.matches ? 0 : 1;
        schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pagehide', () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
    });
    window.addEventListener('pageshow', schedule);
    new ResizeObserver(resize).observe(canvas);
    resize();
    schedule();
}
