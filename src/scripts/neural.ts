type BackgroundMode = 'life' | 'neural';

const neuralBackground = document.querySelector<HTMLElement>('#neural-background');
const diagram = document.querySelector<HTMLElement>('#network-diagram');
const samples = document.querySelector<HTMLElement>('.mnist-samples');
const inputTarget = document.querySelector<HTMLElement>('#neural-input');
const inputCanvas = inputTarget?.querySelector<HTMLCanvasElement>('canvas');
const status = document.querySelector<HTMLElement>('#network-status');
const links = document.querySelector<SVGSVGElement>('.neural-links');
const lifeControls = document.querySelector<HTMLElement>('.life-controls');
const neuralControls = document.querySelector<HTMLElement>('.neural-controls');
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-background-mode]');

const digitPaths: Record<number, number[][][]> = {
    0: [[[0.34, 0.12], [0.64, 0.09], [0.79, 0.27], [0.78, 0.67], [0.63, 0.88], [0.34, 0.87], [0.19, 0.68], [0.2, 0.3], [0.34, 0.12]]],
    1: [[[0.34, 0.28], [0.52, 0.11], [0.53, 0.88]], [[0.36, 0.87], [0.7, 0.87]]],
    2: [[[0.2, 0.27], [0.35, 0.1], [0.65, 0.12], [0.78, 0.3], [0.67, 0.48], [0.22, 0.87], [0.8, 0.86]]],
    3: [[[0.2, 0.2], [0.43, 0.1], [0.7, 0.16], [0.74, 0.34], [0.57, 0.47], [0.75, 0.59], [0.69, 0.8], [0.43, 0.9], [0.19, 0.79]]],
    4: [[[0.68, 0.9], [0.65, 0.1], [0.19, 0.62], [0.82, 0.61]]],
    5: [[[0.75, 0.13], [0.29, 0.13], [0.24, 0.47], [0.58, 0.44], [0.77, 0.57], [0.7, 0.81], [0.42, 0.9], [0.2, 0.77]]],
    6: [[[0.7, 0.15], [0.45, 0.1], [0.24, 0.34], [0.2, 0.67], [0.35, 0.88], [0.64, 0.87], [0.78, 0.69], [0.66, 0.5], [0.39, 0.47], [0.23, 0.6]]],
    7: [[[0.18, 0.14], [0.8, 0.14], [0.59, 0.43], [0.43, 0.88]]],
    8: [[[0.48, 0.48], [0.27, 0.38], [0.25, 0.19], [0.45, 0.09], [0.69, 0.18], [0.69, 0.36], [0.48, 0.48], [0.26, 0.61], [0.29, 0.82], [0.53, 0.91], [0.75, 0.78], [0.72, 0.58], [0.48, 0.48]]],
    9: [[[0.73, 0.48], [0.57, 0.55], [0.31, 0.48], [0.22, 0.29], [0.36, 0.1], [0.64, 0.12], [0.77, 0.35], [0.72, 0.7], [0.55, 0.89], [0.31, 0.86]]]
};

function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function drawDigit(canvas: HTMLCanvasElement, digit: number, seed: number) {
    const context = canvas.getContext('2d');
    if (!context) return;
    const random = seededRandom(seed);
    context.clearRect(0, 0, 28, 28);
    context.fillStyle = '#11131a';
    context.fillRect(0, 0, 28, 28);
    context.strokeStyle = '#eef8f8';
    context.lineWidth = 2.2 + random() * 1.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = 'rgba(120, 215, 217, 0.2)';
    context.shadowBlur = 1;

    const tilt = (random() - 0.5) * 3;
    const jitter = () => (random() - 0.5) * 1.7;
    for (const path of digitPaths[digit]) {
        const points = path.map(([x, y]) => [3 + x * 22 + tilt * (y - 0.5) + jitter(), 3 + y * 22 + jitter()]);
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length - 1; index++) {
            const current = points[index];
            const next = points[index + 1];
            context.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
        }
        const last = points[points.length - 1];
        context.lineTo(last[0], last[1]);
        context.stroke();
    }
}

function randomDigits() {
    const digits = Array.from({ length: 10 }, (_, index) => index);
    for (let index = digits.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [digits[index], digits[swap]] = [digits[swap], digits[index]];
    }
    return digits.slice(0, 3);
}

function makeSamples() {
    if (!samples) return;
    samples.replaceChildren();
    randomDigits().forEach((digit, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mnist-card';
        button.dataset.digit = String(digit);
        button.setAttribute('aria-label', `Use handwritten digit ${digit}`);
        button.style.setProperty('--float-delay', `${index * -1.4}s`);
        const canvas = document.createElement('canvas');
        canvas.width = 28;
        canvas.height = 28;
        canvas.setAttribute('aria-hidden', 'true');
        drawDigit(canvas, digit, Math.floor(Math.random() * 100000) + index * 97);
        button.append(canvas);
        samples.append(button);
        addSampleInteractions(button, canvas, digit);
    });
}

function addSampleInteractions(button: HTMLButtonElement, canvas: HTMLCanvasElement, digit: number) {
    let startX = 0;
    let startY = 0;
    let pointerId = -1;
    let moved = false;
    let suppressClick = false;

    button.addEventListener('click', () => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        loadDigit(digit, canvas);
        button.classList.add('is-selected');
        window.setTimeout(() => button.classList.remove('is-selected'), 420);
    });

    button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        moved = false;
        button.setPointerCapture(pointerId);
        button.classList.add('is-dragging');
    });

    button.addEventListener('pointermove', (event) => {
        if (event.pointerId !== pointerId) return;
        const x = event.clientX - startX;
        const y = event.clientY - startY;
        moved ||= Math.hypot(x, y) > 4;
        button.style.setProperty('--drag-x', `${x}px`);
        button.style.setProperty('--drag-y', `${y}px`);
        if (!inputTarget) return;
        const target = inputTarget.getBoundingClientRect();
        inputTarget.classList.toggle('is-over', event.clientX >= target.left - 18 && event.clientX <= target.right + 18 && event.clientY >= target.top - 18 && event.clientY <= target.bottom + 18);
    });

    const finishDrag = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        pointerId = -1;
        const target = inputTarget?.getBoundingClientRect();
        const card = button.getBoundingClientRect();
        const dropped = Boolean(target && event.clientX >= target.left - 18 && event.clientX <= target.right + 18 && event.clientY >= target.top - 18 && event.clientY <= target.bottom + 18);
        inputTarget?.classList.remove('is-over');
        suppressClick = moved;

        if (dropped && target) {
            const currentX = Number.parseFloat(button.style.getPropertyValue('--drag-x')) || 0;
            const currentY = Number.parseFloat(button.style.getPropertyValue('--drag-y')) || 0;
            button.classList.add('is-snapping');
            button.style.setProperty('--drag-x', `${currentX + target.left + target.width / 2 - (card.left + card.width / 2)}px`);
            button.style.setProperty('--drag-y', `${currentY + target.top + target.height / 2 - (card.top + card.height / 2)}px`);
            window.setTimeout(() => {
                loadDigit(digit, canvas);
                resetDraggedCard(button);
            }, 220);
        } else {
            resetDraggedCard(button);
        }
    };

    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== pointerId) return;
        pointerId = -1;
        inputTarget?.classList.remove('is-over');
        resetDraggedCard(button);
    });
}

function resetDraggedCard(button: HTMLButtonElement) {
    button.classList.remove('is-dragging', 'is-snapping');
    button.classList.add('is-returning');
    button.style.setProperty('--drag-x', '0px');
    button.style.setProperty('--drag-y', '0px');
    window.setTimeout(() => button.classList.remove('is-returning'), 280);
}

function centerOf(element: Element, bounds: DOMRect) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
}

function buildConnections() {
    if (!diagram || !links || !inputTarget) return;
    links.replaceChildren();
    const bounds = diagram.getBoundingClientRect();
    links.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const featureNodes = Array.from(diagram.querySelectorAll<HTMLElement>('[data-node^="feature-"]'));
    const hiddenNodes = Array.from(diagram.querySelectorAll<HTMLElement>('[data-node^="hidden-"]'));
    const outputNodes = Array.from(diagram.querySelectorAll<HTMLElement>('[data-output] .neural-node'));

    const connect = (from: Element[], to: Element[], group: string) => {
        from.forEach((source, sourceIndex) => {
            to.forEach((destination, targetIndex) => {
                const a = centerOf(source, bounds);
                const b = centerOf(destination, bounds);
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', String(a.x));
                line.setAttribute('y1', String(a.y));
                line.setAttribute('x2', String(b.x));
                line.setAttribute('y2', String(b.y));
                line.dataset.group = group;
                line.dataset.source = String(sourceIndex);
                line.dataset.target = String(targetIndex);
                links.append(line);
            });
        });
    };

    connect([inputTarget], featureNodes, 'input');
    connect(featureNodes, hiddenNodes, 'feature');
    connect(hiddenNodes, outputNodes, 'output');
}

function featureValuesFor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) return Array(6).fill(0.1);
    const pixels = context.getImageData(0, 0, 28, 28).data;
    const regions = [
        { x0: 0, x1: 28, y0: 0, y1: 28, scale: 5.1 },
        { x0: 0, x1: 28, y0: 0, y1: 10, scale: 4.2 },
        { x0: 0, x1: 28, y0: 9, y1: 19, scale: 4.2 },
        { x0: 0, x1: 28, y0: 18, y1: 28, scale: 4.2 },
        { x0: 0, x1: 11, y0: 0, y1: 28, scale: 4.2 },
        { x0: 17, x1: 28, y0: 0, y1: 28, scale: 4.2 }
    ];
    return regions.map(({ x0, x1, y0, y1, scale }) => {
        let ink = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) ink += Math.max(0, pixels[(y * 28 + x) * 4] - 17) / 238;
        }
        return Math.min(1, 0.08 + ink / ((x1 - x0) * (y1 - y0)) * scale);
    });
}

function hiddenValuesFor(features: number[], digit: number) {
    return Array.from({ length: 8 }, (_, hiddenIndex) => {
        let weighted = 0;
        let totalWeight = 0;
        features.forEach((feature, featureIndex) => {
            const weight = 0.2 + Math.abs(Math.sin((hiddenIndex + 1) * (featureIndex + 2) * 1.17 + digit * 0.31));
            weighted += feature * weight;
            totalWeight += weight;
        });
        return Math.min(1, 0.08 + weighted / totalWeight);
    });
}

function probabilitiesFor(digit: number) {
    const confusions: Record<number, number> = { 0: 6, 1: 7, 2: 7, 3: 5, 4: 9, 5: 3, 6: 8, 7: 1, 8: 6, 9: 4 };
    const logits = Array.from({ length: 10 }, (_, index) => 0.1 + Math.abs(Math.sin(digit * 4.17 + index * 2.31)) * 0.65);
    logits[confusions[digit]] = 1.85;
    logits[digit] = 4.15;
    const exponents = logits.map((value) => Math.exp(value));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return exponents.map((value) => value / total);
}

function setNodeActivation(selector: string, values: number[]) {
    document.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
        const activation = values[index] ?? 0;
        node.style.setProperty('--activation', activation.toFixed(3));
    });
}

function loadDigit(digit: number, source: HTMLCanvasElement) {
    if (!inputCanvas || !status || !diagram) return;
    const context = inputCanvas.getContext('2d');
    context?.clearRect(0, 0, 28, 28);
    context?.drawImage(source, 0, 0);
    inputTarget?.classList.add('has-digit');

    const featureValues = featureValuesFor(source);
    const hiddenValues = hiddenValuesFor(featureValues, digit);
    const probabilities = probabilitiesFor(digit);
    setNodeActivation('[data-node^="feature-"]', featureValues);
    setNodeActivation('[data-node^="hidden-"]', hiddenValues);
    setNodeActivation('[data-output] .neural-node', probabilities.map((value) => Math.min(1, value * 1.45 + 0.06)));

    document.querySelectorAll<HTMLElement>('[data-output]').forEach((output, index) => {
        output.classList.toggle('is-prediction', index === digit);
        const value = output.querySelector<HTMLElement>('small');
        if (value) value.textContent = `${Math.round(probabilities[index] * 100)}%`;
    });

    links?.querySelectorAll<SVGLineElement>('line').forEach((line) => {
        const sourceIndex = Number(line.dataset.source);
        const targetIndex = Number(line.dataset.target);
        const group = line.dataset.group;
        let activation = 0;
        if (group === 'input') activation = featureValues[targetIndex];
        if (group === 'feature') activation = (featureValues[sourceIndex] + hiddenValues[targetIndex]) / 2;
        if (group === 'output') activation = (hiddenValues[sourceIndex] + probabilities[targetIndex]) / 2;
        line.style.setProperty('--activation', activation.toFixed(3));
    });

    status.innerHTML = `classified as <strong>${digit}</strong> <span>${Math.round(probabilities[digit] * 100)}% confidence</span>`;
    diagram.classList.remove('has-result');
    requestAnimationFrame(() => diagram.classList.add('has-result'));
}

function setMode(mode: BackgroundMode) {
    document.body.dataset.background = mode;
    modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.backgroundMode === mode)));
    if (neuralBackground) neuralBackground.setAttribute('aria-hidden', String(mode !== 'neural'));
    if (lifeControls) lifeControls.hidden = mode !== 'life';
    if (neuralControls) neuralControls.hidden = mode !== 'neural';
    document.dispatchEvent(new CustomEvent('background:mode', { detail: { mode } }));
    try {
        localStorage.setItem('portfolio-background', mode);
    } catch {
        // The mode remains usable when storage is unavailable.
    }
    if (mode === 'neural') requestAnimationFrame(buildConnections);
}

if (neuralBackground && diagram && samples && inputTarget && links) {
    makeSamples();
    modeButtons.forEach((button) => {
        button.addEventListener('click', () => setMode(button.dataset.backgroundMode as BackgroundMode));
    });
    document.querySelector<HTMLButtonElement>('#neural-new-samples')?.addEventListener('click', makeSamples);
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(buildConnections));
    resizeObserver.observe(diagram);
    let initialMode: BackgroundMode = 'life';
    try {
        if (localStorage.getItem('portfolio-background') === 'neural') initialMode = 'neural';
    } catch {
        // Default to Life when storage is unavailable.
    }
    setMode(initialMode);
}
