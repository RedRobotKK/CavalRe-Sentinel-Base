/**
 * Walk-forward logistic regression baseline for residual toxicity.
 * Pure JS. No external ML deps. Verifiable.
 *
 * NEVER TRUST a model without the walk-forward report printed by the pipeline.
 */

import { featureNames } from "./features.js";

function sigmoid(z) {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

function standardize(trainX, testX) {
  const d = trainX[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  const n = trainX.length;

  for (const row of trainX) {
    for (let j = 0; j < d; j++) mean[j] += row[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  for (const row of trainX) {
    for (let j = 0; j < d; j++) {
      const dlt = row[j] - mean[j];
      std[j] += dlt * dlt;
    }
  }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;

  const transform = (X) =>
    X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));

  return { train: transform(trainX), test: transform(testX), mean, std };
}

export function fitLogistic(X, y, opts = {}) {
  const lr = opts.lr ?? 0.05;
  const epochs = opts.epochs ?? 400;
  const l2 = opts.l2 ?? 0.01;
  const d = X[0].length;
  let w = new Array(d).fill(0);
  let b = 0;

  for (let ep = 0; ep < epochs; ep++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, v, j) => s + v * w[j], b);
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    const n = X.length;
    for (let j = 0; j < d; j++) {
      gw[j] = gw[j] / n + l2 * w[j];
      w[j] -= lr * gw[j];
    }
    b -= lr * (gb / n);
  }
  return { w, b };
}

export function predictProba(model, X) {
  return X.map((row) => {
    const z = row.reduce((s, v, j) => s + v * model.w[j], model.b);
    return sigmoid(z);
  });
}

export function aucScore(yTrue, yScore) {
  const pairs = yTrue.map((y, i) => ({ y, s: yScore[i] }));
  pairs.sort((a, b) => a.s - b.s);
  let rankSum = 0;
  let nPos = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) {
      rankSum += i + 1;
      nPos += 1;
    }
  }
  const nNeg = pairs.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function classificationReport(yTrue, yScore, threshold = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = yScore[i] >= threshold ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 1 && yTrue[i] === 0) fp++;
    else if (pred === 0 && yTrue[i] === 0) tn++;
    else fn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const acc = (tp + tn) / yTrue.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, tn, fn, precision, recall, acc, f1 };
}

export function walkForward(matrix, labels, nFolds = 5) {
  const n = matrix.length;
  const foldSize = Math.floor(n / nFolds);
  const reports = [];

  for (let f = 1; f < nFolds; f++) {
    const trainEnd = f * foldSize;
    const testEnd = Math.min((f + 1) * foldSize, n);
    if (testEnd <= trainEnd) continue;

    const trainX = matrix.slice(0, trainEnd);
    const trainY = labels.slice(0, trainEnd);
    const testX = matrix.slice(trainEnd, testEnd);
    const testY = labels.slice(trainEnd, testEnd);

    const { train, test } = standardize(trainX, testX);
    const model = fitLogistic(train, trainY);
    const proba = predictProba(model, test);
    const auc = aucScore(testY, proba);
    const rep = classificationReport(testY, proba);

    reports.push({
      fold: f,
      trainN: trainX.length,
      testN: testX.length,
      auc: Math.round(auc * 1000) / 1000,
      acc: Math.round(rep.acc * 1000) / 1000,
      precision: Math.round(rep.precision * 1000) / 1000,
      recall: Math.round(rep.recall * 1000) / 1000,
      f1: Math.round(rep.f1 * 1000) / 1000,
      toxicRateTest: testY.reduce((a, b) => a + b, 0) / testY.length,
    });
  }

  const mean = (k) =>
    reports.length === 0
      ? 0
      : reports.reduce((s, r) => s + r[k], 0) / reports.length;

  return {
    folds: reports,
    summary: {
      meanAuc: Math.round(mean("auc") * 1000) / 1000,
      meanAcc: Math.round(mean("acc") * 1000) / 1000,
      meanF1: Math.round(mean("f1") * 1000) / 1000,
      featureNames: featureNames(),
    },
  };
}
