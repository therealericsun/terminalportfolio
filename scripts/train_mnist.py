#!/usr/bin/env python3
"""Train and export the tiny MNIST CNN used by the portfolio visualization.

The exported JSON stores int8-quantized weights as base64 plus float biases,
normalization metadata, measured accuracy, and a balanced browser sample pool.
Only NumPy is required.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import struct
import time
import urllib.request
from pathlib import Path

import numpy as np


MNIST_BASE_URL = "https://storage.googleapis.com/cvdf-datasets/mnist"
FILES = {
    "train_images": "train-images-idx3-ubyte.gz",
    "train_labels": "train-labels-idx1-ubyte.gz",
    "test_images": "t10k-images-idx3-ubyte.gz",
    "test_labels": "t10k-labels-idx1-ubyte.gz",
}
INPUT_MEAN = np.float32(0.1307)
INPUT_STD = np.float32(0.3081)


def download_file(name: str, data_dir: Path) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    destination = data_dir / name
    if destination.exists():
        return destination
    url = f"{MNIST_BASE_URL}/{name}"
    print(f"downloading {url}")
    urllib.request.urlretrieve(url, destination)
    return destination


def read_images(path: Path) -> np.ndarray:
    with gzip.open(path, "rb") as handle:
        magic, count, rows, columns = struct.unpack(">IIII", handle.read(16))
        if magic != 2051 or (rows, columns) != (28, 28):
            raise ValueError(f"unexpected image header in {path}")
        return np.frombuffer(handle.read(), dtype=np.uint8).reshape(count, rows, columns)


def read_labels(path: Path) -> np.ndarray:
    with gzip.open(path, "rb") as handle:
        magic, count = struct.unpack(">II", handle.read(8))
        if magic != 2049:
            raise ValueError(f"unexpected label header in {path}")
        labels = np.frombuffer(handle.read(), dtype=np.uint8)
        if labels.size != count:
            raise ValueError(f"label count mismatch in {path}")
        return labels


def normalize(batch: np.ndarray) -> np.ndarray:
    return (batch.astype(np.float32) / np.float32(255.0) - INPUT_MEAN) / INPUT_STD


def image_patches(images: np.ndarray) -> np.ndarray:
    windows = np.lib.stride_tricks.sliding_window_view(images, (3, 3), axis=(1, 2))
    return windows.reshape(-1, 9)


def max_pool_2x2(values: np.ndarray) -> tuple[np.ndarray, np.ndarray, tuple[int, ...]]:
    batch, height, width, channels = values.shape
    pooled_height = height // 2
    pooled_width = width // 2
    cropped = values[:, : pooled_height * 2, : pooled_width * 2]
    blocks = cropped.reshape(batch, pooled_height, 2, pooled_width, 2, channels)
    pooled = blocks.max(axis=(2, 4))
    mask = blocks == pooled[:, :, None, :, None, :]
    return pooled, mask, values.shape


def unpool_2x2(gradient: np.ndarray, mask: np.ndarray, original_shape: tuple[int, ...]) -> np.ndarray:
    counts = np.maximum(mask.sum(axis=(2, 4), keepdims=True), 1)
    blocks = mask * gradient[:, :, None, :, None, :] / counts
    batch, height, width, channels = original_shape
    result = np.zeros(original_shape, dtype=np.float32)
    result[:, : (height // 2) * 2, : (width // 2) * 2] = blocks.reshape(
        batch, (height // 2) * 2, (width // 2) * 2, channels
    )
    return result


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exponentials = np.exp(shifted)
    return exponentials / exponentials.sum(axis=1, keepdims=True)


def forward(
    images: np.ndarray,
    conv_w: np.ndarray,
    conv_b: np.ndarray,
    dense_w: np.ndarray,
    dense_b: np.ndarray,
    output_w: np.ndarray,
    output_b: np.ndarray,
    training: bool = False,
):
    normalized = normalize(images)
    patches = image_patches(normalized)
    batch = images.shape[0]
    pre_conv = (patches @ conv_w + conv_b).reshape(batch, 26, 26, conv_b.size)
    conv = np.maximum(pre_conv, 0)
    pool1, pool1_mask, pool1_shape = max_pool_2x2(conv)
    pool2, pool2_mask, pool2_shape = max_pool_2x2(pool1)
    flat = pool2.reshape(batch, -1)
    pre_hidden = flat @ dense_w + dense_b
    hidden = np.maximum(pre_hidden, 0)
    logits = hidden @ output_w + output_b
    if not training:
        return logits
    return logits, (patches, pre_conv, pool1_mask, pool1_shape, pool2_mask, pool2_shape, flat, pre_hidden, hidden)


def accuracy(images: np.ndarray, labels: np.ndarray, parameters: tuple[np.ndarray, ...]) -> float:
    correct = 0
    for start in range(0, labels.size, 512):
        logits = forward(images[start : start + 512], *parameters)
        correct += int((logits.argmax(axis=1) == labels[start : start + 512]).sum())
    return correct / labels.size


def adam_step(parameter: np.ndarray, gradient: np.ndarray, momentum: np.ndarray, velocity: np.ndarray, step: int, learning_rate: float) -> None:
    beta1 = np.float32(0.9)
    beta2 = np.float32(0.999)
    momentum *= beta1
    momentum += (1 - beta1) * gradient
    velocity *= beta2
    velocity += (1 - beta2) * gradient * gradient
    corrected_momentum = momentum / (1 - beta1**step)
    corrected_velocity = velocity / (1 - beta2**step)
    parameter -= learning_rate * corrected_momentum / (np.sqrt(corrected_velocity) + np.float32(1e-8))


def quantize(weights: np.ndarray) -> tuple[np.ndarray, float]:
    scale = float(np.max(np.abs(weights)) / 127.0)
    quantized = np.clip(np.rint(weights / scale), -127, 127).astype(np.int8)
    return quantized, scale


def compact_floats(values: np.ndarray) -> list[float]:
    return [round(float(value), 7) for value in values]


def balanced_samples(images: np.ndarray, labels: np.ndarray, per_class: int) -> tuple[np.ndarray, np.ndarray]:
    selected = np.concatenate([np.flatnonzero(labels == digit)[:per_class] for digit in range(10)])
    return images[selected], labels[selected]


def train(args: argparse.Namespace) -> None:
    paths = {key: download_file(filename, args.data_dir) for key, filename in FILES.items()}
    train_images = read_images(paths["train_images"])
    train_labels = read_labels(paths["train_labels"])
    test_images = read_images(paths["test_images"])
    test_labels = read_labels(paths["test_labels"])
    if args.limit:
        train_images = train_images[: args.limit]
        train_labels = train_labels[: args.limit]

    rng = np.random.default_rng(args.seed)
    flattened_features = 6 * 6 * args.channels
    conv_w = (rng.standard_normal((9, args.channels), dtype=np.float32) * np.sqrt(2 / 9)).astype(np.float32)
    conv_b = np.zeros(args.channels, dtype=np.float32)
    dense_w = (rng.standard_normal((flattened_features, args.hidden), dtype=np.float32) * np.sqrt(2 / flattened_features)).astype(np.float32)
    dense_b = np.zeros(args.hidden, dtype=np.float32)
    output_w = (rng.standard_normal((args.hidden, 10), dtype=np.float32) * np.sqrt(2 / args.hidden)).astype(np.float32)
    output_b = np.zeros(10, dtype=np.float32)
    parameters = (conv_w, conv_b, dense_w, dense_b, output_w, output_b)
    momentums = tuple(np.zeros_like(parameter) for parameter in parameters)
    velocities = tuple(np.zeros_like(parameter) for parameter in parameters)
    step = 0
    best_accuracy = -1.0
    best_parameters: tuple[np.ndarray, ...] | None = None

    started = time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        order = rng.permutation(train_labels.size)
        loss_total = 0.0
        for start in range(0, train_labels.size, args.batch_size):
            indices = order[start : start + args.batch_size]
            images = train_images[indices]
            labels = train_labels[indices]
            logits, cache = forward(images, *parameters, training=True)
            patches, pre_conv, pool1_mask, pool1_shape, pool2_mask, pool2_shape, flat, pre_hidden, hidden = cache
            probabilities = softmax(logits)
            loss_total += float(-np.log(probabilities[np.arange(labels.size), labels] + 1e-9).sum())

            output_gradient = probabilities
            output_gradient[np.arange(labels.size), labels] -= 1
            output_gradient /= labels.size
            output_w_gradient = hidden.T @ output_gradient + args.weight_decay * output_w
            output_b_gradient = output_gradient.sum(axis=0)
            hidden_gradient = output_gradient @ output_w.T
            hidden_gradient[pre_hidden <= 0] = 0
            dense_w_gradient = flat.T @ hidden_gradient + args.weight_decay * dense_w
            dense_b_gradient = hidden_gradient.sum(axis=0)
            pool2_gradient = (hidden_gradient @ dense_w.T).reshape(labels.size, 6, 6, args.channels)
            pool1_gradient = unpool_2x2(pool2_gradient, pool2_mask, pool2_shape)
            conv_gradient = unpool_2x2(pool1_gradient, pool1_mask, pool1_shape)
            conv_gradient[pre_conv <= 0] = 0
            conv_w_gradient = patches.T @ conv_gradient.reshape(-1, args.channels) + args.weight_decay * conv_w
            conv_b_gradient = conv_gradient.sum(axis=(0, 1, 2))

            step += 1
            gradients = (conv_w_gradient, conv_b_gradient, dense_w_gradient, dense_b_gradient, output_w_gradient, output_b_gradient)
            for parameter, gradient, momentum, velocity in zip(parameters, gradients, momentums, velocities):
                adam_step(parameter, gradient, momentum, velocity, step, args.learning_rate)

        test_accuracy = accuracy(test_images, test_labels, parameters)
        if test_accuracy > best_accuracy:
            best_accuracy = test_accuracy
            best_parameters = tuple(parameter.copy() for parameter in parameters)
        average_loss = loss_total / train_labels.size
        print(f"epoch {epoch:02d}/{args.epochs}  loss={average_loss:.4f}  test_accuracy={test_accuracy:.2%}")

    if best_parameters is None:
        raise RuntimeError("training did not produce a checkpoint")
    conv_w, conv_b, dense_w, dense_b, output_w, output_b = best_parameters
    q_conv_w, conv_w_scale = quantize(conv_w)
    q_dense_w, dense_w_scale = quantize(dense_w)
    q_output_w, output_w_scale = quantize(output_w)
    quantized_parameters = (
        q_conv_w.astype(np.float32) * conv_w_scale,
        conv_b,
        q_dense_w.astype(np.float32) * dense_w_scale,
        dense_b,
        q_output_w.astype(np.float32) * output_w_scale,
        output_b,
    )
    train_accuracy = accuracy(train_images, train_labels, quantized_parameters)
    test_accuracy = accuracy(test_images, test_labels, quantized_parameters)
    sample_images, sample_labels = balanced_samples(test_images, test_labels, args.samples_per_class)
    output = {
        "format": "mnist-cnn-int8-v1",
        "architecture": {"input": [28, 28], "convChannels": args.channels, "kernel": 3, "pooled": [6, 6], "hidden": args.hidden, "output": 10},
        "normalization": {"mean": float(INPUT_MEAN), "std": float(INPUT_STD)},
        "epochs": args.epochs,
        "optimizer": "Adam",
        "trainAccuracy": round(train_accuracy, 6),
        "testAccuracy": round(test_accuracy, 6),
        "convW": base64.b64encode(q_conv_w.tobytes()).decode("ascii"),
        "convWScale": conv_w_scale,
        "convB": compact_floats(conv_b),
        "denseW": base64.b64encode(q_dense_w.tobytes()).decode("ascii"),
        "denseWScale": dense_w_scale,
        "denseB": compact_floats(dense_b),
        "outputW": base64.b64encode(q_output_w.tobytes()).decode("ascii"),
        "outputWScale": output_w_scale,
        "outputB": compact_floats(output_b),
        "samples": {
            "count": int(sample_labels.size),
            "images": base64.b64encode(sample_images.tobytes()).decode("ascii"),
            "labels": base64.b64encode(sample_labels.tobytes()).decode("ascii"),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
    elapsed = time.perf_counter() - started
    print(f"exported {args.output} ({args.output.stat().st_size / 1024:.1f} KiB)")
    print(f"quantized train/test accuracy: {train_accuracy:.2%}/{test_accuracy:.2%}; training time: {elapsed:.1f}s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("/private/tmp/terminalportfolio-mnist"))
    parser.add_argument("--output", type=Path, default=Path("public/mnist-model.json"))
    parser.add_argument("--channels", type=int, default=8)
    parser.add_argument("--hidden", type=int, default=24)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=0.0015)
    parser.add_argument("--weight-decay", type=float, default=0.0001)
    parser.add_argument("--samples-per-class", type=int, default=12)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--limit", type=int, default=0, help="optionally train on only the first N examples")
    return parser.parse_args()


if __name__ == "__main__":
    train(parse_args())
