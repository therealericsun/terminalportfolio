import { LifeBoard, seedLife } from '../utils/gameOfLife';

const canvas = document.querySelector<HTMLCanvasElement>('#life-canvas');
const context = canvas?.getContext('2d');
const controls = document.querySelector<HTMLElement>('.life-controls');

if (canvas && context && controls) {
    const cellSize = window.innerWidth < 360 ? 6 : window.innerWidth < 600 ? 8 : 12;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const speedButtons = controls.querySelectorAll<HTMLButtonElement>('[data-life-speed]');
    let speed = reducedMotion.matches ? 0 : 1;
    let board: LifeBoard;
    let width = 0;
    let height = 0;
    let frame: number | undefined;
    let lastStep = 0;
    let hovered: { x: number; y: number } | null = null;
    let isLifeActive = document.body.dataset.background !== 'neural';

    function draw() {
        if (!canvas || !context) return;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#4eb3b5';
        for (let y = 0; y < board.rows; y++) {
            for (let x = 0; x < board.columns; x++) {
                if (board.get(x, y)) context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
            }
        }
        if (hovered) {
            context.fillStyle = 'rgba(231, 236, 239, 0.3)';
            context.fillRect(hovered.x * cellSize + 1, hovered.y * cellSize + 1, cellSize - 2, cellSize - 2);
            context.strokeStyle = '#e7ecef';
            context.strokeRect(hovered.x * cellSize + 0.5, hovered.y * cellSize + 0.5, cellSize - 1, cellSize - 1);
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
        hovered = null;
        draw();
    }

    function tick(now: number) {
        frame = undefined;
        if (speed === 0 || document.hidden || !isLifeActive) return;
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
        if (speed > 0 && !document.hidden && isLifeActive) frame = requestAnimationFrame(tick);
    }

    function setSpeed(value: number) {
        speed = value;
        speedButtons.forEach((button) => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.lifeSpeed) === speed));
        });
        schedule();
    }

    document.addEventListener('life:toggle', (event) => {
        const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
        const bounds = canvas.getBoundingClientRect();
        board.toggle(Math.floor((x - bounds.left) / cellSize), Math.floor((y - bounds.top) / cellSize));
        draw();
    });
    canvas.addEventListener('focus', () => {
        hovered ??= { x: Math.floor(board.columns / 2), y: Math.max(0, board.rows - 6) };
        draw();
    });
    canvas.addEventListener('blur', () => {
        hovered = null;
        draw();
    });
    canvas.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelector<HTMLInputElement>('#command-input')?.focus();
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        hovered ??= { x: Math.floor(board.columns / 2), y: Math.max(0, board.rows - 6) };
        if (event.key === 'ArrowLeft') hovered.x = Math.max(0, hovered.x - 1);
        if (event.key === 'ArrowRight') hovered.x = Math.min(board.columns - 1, hovered.x + 1);
        if (event.key === 'ArrowUp') hovered.y = Math.max(0, hovered.y - 1);
        if (event.key === 'ArrowDown') hovered.y = Math.min(board.rows - 1, hovered.y + 1);
        if (event.key === ' ' || event.key === 'Enter') board.toggle(hovered.x, hovered.y);
        draw();
    });

    controls.querySelector<HTMLButtonElement>('#life-reset')?.addEventListener('click', () => {
        board = new LifeBoard(board.columns, board.rows);
        seedLife(board);
        hovered = null;
        draw();
        schedule();
    });
    speedButtons.forEach((button) => {
        button.addEventListener('click', () => setSpeed(Number(button.dataset.lifeSpeed)));
    });
    reducedMotion.addEventListener('change', (event) => {
        if (event.matches) setSpeed(0);
    });
    document.addEventListener('background:mode', (event) => {
        isLifeActive = (event as CustomEvent<{ mode: string }>).detail.mode === 'life';
        canvas.tabIndex = isLifeActive ? 0 : -1;
        if (!isLifeActive) hovered = null;
        draw();
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
    setSpeed(speed);
    controls.hidden = false;
}
