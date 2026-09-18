const neuralBackground = document.querySelector<HTMLElement>('#neural-background');
const diagram = document.querySelector<HTMLElement>('#network-diagram');
const samples = document.querySelector<HTMLElement>('.mnist-samples');
const inputTarget = document.querySelector<HTMLElement>('#neural-input');
const links = document.querySelector<SVGSVGElement>('.neural-links');

interface MnistModelFile {
    format: string;
    architecture: {
        input: [number, number];
        convChannels: number;
        kernel: number;
        pooled: [number, number];
        hidden: number;
        output: number;
    };
    normalization: { mean: number; std: number };
    epochs: number;
    optimizer: string;
    trainAccuracy: number;
    testAccuracy: number;
    convW: string;
    convWScale: number;
    convB: number[];
    denseW: string;
    denseWScale: number;
    denseB: number[];
    outputW: string;
    outputWScale: number;
    outputB: number[];
    samples: { count: number; images: string; labels: string };
}

interface MnistModel extends Omit<MnistModelFile, 'convW' | 'denseW' | 'outputW' | 'samples'> {
    convW: Int8Array;
    denseW: Int8Array;
    outputW: Int8Array;
    sampleImages: Uint8Array;
    sampleLabels: Uint8Array;
}

let modelPromise: Promise<MnistModel | null> | null = null;
let cardPlaceholders = new WeakMap<HTMLButtonElement, HTMLElement>();
let interactionLocked = false;
const neuralReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const neuralMobile = window.matchMedia('(max-width: 768px)');
let neuralInitialized = false;

function drawSample(canvas: HTMLCanvasElement, pixels: Uint8Array) {
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(28, 28);
    for (let index = 0; index < pixels.length; index++) {
        const offset = index * 4;
        image.data[offset] = pixels[index];
        image.data[offset + 1] = pixels[index];
        image.data[offset + 2] = pixels[index];
        image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
}

function randomSampleIndices(model: MnistModel) {
    const digits = Array.from({ length: 10 }, (_, index) => index);
    for (let index = digits.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [digits[index], digits[swap]] = [digits[swap], digits[index]];
    }
    return digits.slice(0, 6).map((digit) => {
        const candidates: number[] = [];
        model.sampleLabels.forEach((label, index) => {
            if (label === digit) candidates.push(index);
        });
        return candidates[Math.floor(Math.random() * candidates.length)];
    });
}

async function makeSamples() {
    if (!samples || interactionLocked) return;
    const model = await modelPromise;
    if (!model || interactionLocked) return;
    inputTarget?.querySelector('.mnist-card.is-docked')?.remove();
    inputTarget?.classList.remove('has-digit');
    samples.replaceChildren();
    cardPlaceholders = new WeakMap();
    resetNetworkVisual();
    randomSampleIndices(model).forEach((sampleIndex, index) => {
        const digit = model.sampleLabels[sampleIndex];
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
        const start = sampleIndex * 28 * 28;
        drawSample(canvas, model.sampleImages.subarray(start, start + 28 * 28));
        button.append(canvas);
        samples.append(button);
        addSampleInteractions(button, canvas);
    });
}

function addSampleInteractions(button: HTMLButtonElement, canvas: HTMLCanvasElement) {
    let startX = 0;
    let startY = 0;
    let pointerId = -1;
    let moved = false;
    let suppressClick = false;

    button.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') button.classList.add('is-hovered');
    });
    button.addEventListener('pointerleave', () => button.classList.remove('is-hovered'));

    button.addEventListener('click', () => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        if (button.classList.contains('is-docked')) void unselectCard(button);
        else void selectCard(button, canvas);
    });

    button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || interactionLocked) return;
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
            void selectCard(button, canvas);
        } else if (button.classList.contains('is-docked') && moved) {
            void unselectCard(button);
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

function reserveShelfSlot(button: HTMLButtonElement) {
    if (!samples) return null;
    let placeholder = cardPlaceholders.get(button);
    if (!placeholder?.isConnected && button.parentElement === samples) {
        const placeholder = document.createElement('span');
        placeholder.className = 'mnist-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        button.replaceWith(placeholder);
        cardPlaceholders.set(button, placeholder);
        return placeholder;
    }
    return placeholder ?? null;
}

function prepareFlight(button: HTMLButtonElement, bounds: DOMRect) {
    if (!neuralBackground) return;
    neuralBackground.append(button);
    button.classList.remove('is-docked', 'is-dragging', 'is-snapping', 'is-returning', 'is-hovered');
    button.classList.add('is-flight');
    button.style.setProperty('--drag-x', '0px');
    button.style.setProperty('--drag-y', '0px');
    button.style.left = `${bounds.left}px`;
    button.style.top = `${bounds.top}px`;
}

async function flyCard(button: HTMLButtonElement, from: DOMRect, to: DOMRect) {
    prepareFlight(button, from);
    const animation = button.animate([
        { left: `${from.left}px`, top: `${from.top}px` },
        { left: `${to.left + (to.width - from.width) / 2}px`, top: `${to.top + (to.height - from.height) / 2}px` }
    ], {
        duration: neuralReducedMotion.matches ? 0 : 320,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'forwards'
    });
    try {
        await animation.finished;
    } catch {
        // A superseded animation is simply finalized at its destination.
    }
    animation.cancel();
}

function finishFlight(button: HTMLButtonElement) {
    button.classList.remove('is-flight', 'is-dragging', 'is-snapping', 'is-returning');
    button.style.removeProperty('left');
    button.style.removeProperty('top');
    button.style.setProperty('--drag-x', '0px');
    button.style.setProperty('--drag-y', '0px');
}

async function returnCardHome(button: HTMLButtonElement) {
    const placeholder = cardPlaceholders.get(button);
    if (!samples || !placeholder?.isConnected) return;
    const from = button.getBoundingClientRect();
    const to = placeholder.getBoundingClientRect();
    await flyCard(button, from, to);
    placeholder.replaceWith(button);
    cardPlaceholders.delete(button);
    finishFlight(button);
}

async function selectCard(button: HTMLButtonElement, canvas: HTMLCanvasElement) {
    if (!inputTarget || !samples || interactionLocked || button.classList.contains('is-docked')) return;
    interactionLocked = true;
    const from = button.getBoundingClientRect();
    reserveShelfSlot(button);
    const target = inputTarget.getBoundingClientRect();
    const previous = inputTarget.querySelector<HTMLButtonElement>('.mnist-card.is-docked');
    inputTarget.classList.add('is-over');
    await Promise.all([
        flyCard(button, from, target),
        previous ? returnCardHome(previous) : Promise.resolve()
    ]);
    inputTarget.append(button);
    finishFlight(button);
    button.classList.add('is-docked');
    inputTarget.classList.add('has-digit');
    inputTarget.classList.remove('is-over');
    await loadDigit(canvas);
    interactionLocked = false;
}

async function unselectCard(button: HTMLButtonElement) {
    if (!inputTarget || interactionLocked || !button.classList.contains('is-docked')) return;
    interactionLocked = true;
    inputTarget.classList.remove('has-digit', 'is-over');
    await returnCardHome(button);
    resetNetworkVisual();
    interactionLocked = false;
}

function resetDraggedCard(button: HTMLButtonElement) {
    button.classList.remove('is-dragging', 'is-snapping');
    button.classList.add('is-returning');
    button.style.setProperty('--drag-x', '0px');
    button.style.setProperty('--drag-y', '0px');
    window.setTimeout(() => button.classList.remove('is-returning'), 340);
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
    const hidden1Nodes = Array.from(diagram.querySelectorAll<HTMLElement>('[data-node^="hidden1-"]'));
    const hidden2Nodes = Array.from(diagram.querySelectorAll<HTMLElement>('[data-node^="hidden2-"]'));
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

    connect([inputTarget], hidden1Nodes, 'input');
    connect(hidden1Nodes, hidden2Nodes, 'hidden');
    connect(hidden2Nodes, outputNodes, 'output');
}

function decodeUint8(encoded: string) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function decodeInt8(encoded: string) {
    return new Int8Array(decodeUint8(encoded).buffer);
}

async function loadModel(): Promise<MnistModel> {
    const response = await fetch('/mnist-model.json');
    if (!response.ok) throw new Error(`model request failed (${response.status})`);
    const file = await response.json() as MnistModelFile;
    const { convChannels, hidden, output } = file.architecture;
    const convW = decodeInt8(file.convW);
    const denseW = decodeInt8(file.denseW);
    const outputW = decodeInt8(file.outputW);
    const sampleImages = decodeUint8(file.samples.images);
    const sampleLabels = decodeUint8(file.samples.labels);
    if (
        file.format !== 'mnist-cnn-int8-v1'
        || file.architecture.input[0] !== 28
        || file.architecture.input[1] !== 28
        || file.architecture.kernel !== 3
        || file.architecture.pooled[0] !== 6
        || file.architecture.pooled[1] !== 6
        || output !== 10
        || convW.length !== 9 * convChannels
        || denseW.length !== 6 * 6 * convChannels * hidden
        || outputW.length !== hidden * output
        || sampleImages.length !== file.samples.count * 28 * 28
        || sampleLabels.length !== file.samples.count
    ) {
        throw new Error('model file has an unexpected shape');
    }
    const { samples: _samples, ...metadata } = file;
    return { ...metadata, convW, denseW, outputW, sampleImages, sampleLabels };
}

function maxPool2x2(values: Float32Array, width: number, channels: number) {
    const pooledWidth = Math.floor(width / 2);
    const pooled = new Float32Array(pooledWidth * pooledWidth * channels);
    for (let y = 0; y < pooledWidth; y++) {
        for (let x = 0; x < pooledWidth; x++) {
            for (let channel = 0; channel < channels; channel++) {
                let maximum = -Infinity;
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const index = (((y * 2 + dy) * width + x * 2 + dx) * channels) + channel;
                        maximum = Math.max(maximum, values[index]);
                    }
                }
                pooled[((y * pooledWidth + x) * channels) + channel] = maximum;
            }
        }
    }
    return { values: pooled, width: pooledWidth };
}

function infer(canvas: HTMLCanvasElement, model: MnistModel) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('could not read digit pixels');
    const pixels = context.getImageData(0, 0, 28, 28).data;
    const { convChannels, hidden: hiddenSize, output: outputSize } = model.architecture;
    const input = new Float32Array(28 * 28);
    for (let index = 0; index < input.length; index++) {
        input[index] = (pixels[index * 4] / 255 - model.normalization.mean) / model.normalization.std;
    }

    const convWidth = 26;
    const conv = new Float32Array(convWidth * convWidth * convChannels);
    for (let y = 0; y < convWidth; y++) {
        for (let x = 0; x < convWidth; x++) {
            for (let channel = 0; channel < convChannels; channel++) {
                let value = model.convB[channel];
                for (let kernelY = 0; kernelY < 3; kernelY++) {
                    for (let kernelX = 0; kernelX < 3; kernelX++) {
                        const inputValue = input[(y + kernelY) * 28 + x + kernelX];
                        const weightIndex = ((kernelY * 3 + kernelX) * convChannels) + channel;
                        value += inputValue * model.convW[weightIndex] * model.convWScale;
                    }
                }
                conv[((y * convWidth + x) * convChannels) + channel] = Math.max(0, value);
            }
        }
    }

    const pool1 = maxPool2x2(conv, convWidth, convChannels);
    const pool2 = maxPool2x2(pool1.values, pool1.width, convChannels);
    const hidden1 = new Float32Array(convChannels);
    for (let channel = 0; channel < convChannels; channel++) {
        let maximum = 0;
        for (let position = 0; position < pool2.width * pool2.width; position++) {
            maximum = Math.max(maximum, pool2.values[position * convChannels + channel]);
        }
        hidden1[channel] = maximum;
    }

    const hidden2 = new Float32Array(hiddenSize);
    for (let hiddenIndex = 0; hiddenIndex < hiddenSize; hiddenIndex++) {
        let value = model.denseB[hiddenIndex];
        for (let featureIndex = 0; featureIndex < pool2.values.length; featureIndex++) {
            value += pool2.values[featureIndex] * model.denseW[featureIndex * hiddenSize + hiddenIndex] * model.denseWScale;
        }
        hidden2[hiddenIndex] = Math.max(0, value);
    }

    const logits = new Float32Array(outputSize);
    for (let outputIndex = 0; outputIndex < outputSize; outputIndex++) {
        let value = model.outputB[outputIndex];
        for (let hiddenIndex = 0; hiddenIndex < hiddenSize; hiddenIndex++) {
            value += hidden2[hiddenIndex] * model.outputW[hiddenIndex * outputSize + outputIndex] * model.outputWScale;
        }
        logits[outputIndex] = value;
    }
    const maximum = Math.max(...logits);
    const probabilities = Array.from(logits, (value) => Math.exp(value - maximum));
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    return { hidden1, hidden2, features: pool2.values, probabilities: probabilities.map((value) => value / total) };
}

function displayHiddenLayer(selector: string, values: Float32Array, label: string) {
    const indices = Array.from(values.keys()).sort((a, b) => values[b] - values[a]).slice(0, 8);
    const maximum = Math.max(...values, 0.001);
    diagram?.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
        const modelIndex = indices[index];
        const activation = values[modelIndex];
        node.dataset.hiddenIndex = String(modelIndex);
        node.title = `${label} unit ${modelIndex}: ${activation.toFixed(2)}`;
        node.setAttribute('aria-label', node.title);
        node.style.setProperty('--activation', (activation / maximum).toFixed(3));
    });
    return { indices, maximum };
}

async function loadDigit(source: HTMLCanvasElement) {
    if (!diagram) return;

    const model = await modelPromise;
    if (!model) return;
    const { hidden1, hidden2, features, probabilities } = infer(source, model);
    const prediction = probabilities.indexOf(Math.max(...probabilities));
    const hidden1Display = displayHiddenLayer('[data-node^="hidden1-"]', hidden1, 'Convolution channel');
    const hidden2Display = displayHiddenLayer('[data-node^="hidden2-"]', hidden2, 'Dense layer');
    diagram.querySelectorAll<HTMLElement>('[data-output] .neural-node').forEach((node, index) => {
        node.style.setProperty('--activation', Math.min(1, probabilities[index] * 1.45 + 0.06).toFixed(3));
    });

    document.querySelectorAll<HTMLElement>('[data-output]').forEach((output, index) => {
        output.classList.toggle('is-prediction', index === prediction);
        const value = output.querySelector<HTMLElement>('small');
        if (value) value.textContent = `${Math.round(probabilities[index] * 100)}%`;
    });

    const maximumContribution = { hidden: 0, output: 0 };
    links?.querySelectorAll<SVGLineElement>('line[data-group="hidden"], line[data-group="output"]').forEach((line) => {
        const sourceIndex = Number(line.dataset.source);
        const targetIndex = Number(line.dataset.target);
        let contribution = 0;
        if (line.dataset.group === 'hidden') {
            const sourceModelIndex = hidden1Display.indices[sourceIndex];
            const targetModelIndex = hidden2Display.indices[targetIndex];
            for (let position = 0; position < 6 * 6; position++) {
                const featureIndex = position * model.architecture.convChannels + sourceModelIndex;
                contribution += features[featureIndex]
                    * model.denseW[featureIndex * model.architecture.hidden + targetModelIndex]
                    * model.denseWScale;
            }
        } else {
            const sourceModelIndex = hidden2Display.indices[sourceIndex];
            contribution = hidden2[sourceModelIndex]
                * model.outputW[sourceModelIndex * model.architecture.output + targetIndex]
                * model.outputWScale;
        }
        line.dataset.contribution = String(contribution);
        const group = line.dataset.group as 'hidden' | 'output';
        maximumContribution[group] = Math.max(maximumContribution[group], Math.abs(contribution));
    });
    links?.querySelectorAll<SVGLineElement>('line').forEach((line) => {
        if (line.dataset.group === 'input') {
            const modelIndex = hidden1Display.indices[Number(line.dataset.target)];
            line.style.setProperty('--activation', (hidden1[modelIndex] / hidden1Display.maximum).toFixed(3));
            return;
        }
        const contribution = Number(line.dataset.contribution);
        const group = line.dataset.group as 'hidden' | 'output';
        line.classList.toggle('is-inhibitory', contribution < 0);
        line.style.setProperty('--activation', (Math.abs(contribution) / Math.max(maximumContribution[group], 0.001)).toFixed(3));
    });

    diagram.classList.remove('has-result');
    requestAnimationFrame(() => diagram.classList.add('has-result'));
}

function resetNetworkVisual() {
    diagram?.classList.remove('has-result');
    diagram?.querySelectorAll<HTMLElement>('.neural-node').forEach((node) => {
        node.style.setProperty('--activation', '0');
    });
    diagram?.querySelectorAll<HTMLElement>('[data-output]').forEach((output) => {
        output.classList.remove('is-prediction');
        const value = output.querySelector<HTMLElement>('small');
        if (value) value.textContent = '0%';
    });
    links?.querySelectorAll<SVGLineElement>('line').forEach((line) => {
        line.style.setProperty('--activation', '0');
        line.classList.remove('is-inhibitory');
        delete line.dataset.contribution;
    });
}

function initializeNeuralNetwork() {
    if (neuralInitialized || neuralMobile.matches || !neuralBackground || !diagram || !samples || !inputTarget || !links) return;
    neuralInitialized = true;
    modelPromise = loadModel().catch(() => null);
    makeSamples();
    document.querySelector<HTMLButtonElement>('#neural-refresh-samples')?.addEventListener('click', makeSamples);
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(buildConnections));
    resizeObserver.observe(diagram);
    requestAnimationFrame(buildConnections);
}

initializeNeuralNetwork();
neuralMobile.addEventListener('change', initializeNeuralNetwork);
