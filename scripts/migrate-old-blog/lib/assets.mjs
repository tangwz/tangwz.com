import { access, copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, parse } from "node:path";

const RESIZE_DERIVATIVE_PATTERN = /_hu[0-9a-f]+_\d+x\d+_resize(?:_[^.]+)*\.[^.]+$/i;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeImagePath(imageUrl, postSlug) {
  const value = String(imageUrl ?? "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.hostname !== "tangwz.com") return "";
    return url.pathname;
  } catch {
    if (value.startsWith("/")) {
      return value.split(/[?#]/, 1)[0];
    }
  }

  return `/posts/${postSlug}/${value.split(/[?#]/, 1)[0].replace(/^\.?\//, "")}`;
}

function sourcePathForImage({ sourceRoot, postSlug, imagePath }) {
  const expectedPrefix = `/posts/${postSlug}/`;
  if (!imagePath.startsWith(expectedPrefix)) return "";

  const relativePath = imagePath.slice(1);
  return join(sourceRoot, relativePath);
}

function collisionFreeName(fileName, usedNames) {
  if (!usedNames.has(fileName)) return fileName;

  const parsed = parse(fileName);
  let index = 2;
  let candidate = `${parsed.name}-${index}${parsed.ext}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${parsed.name}-${index}${parsed.ext}`;
  }

  return candidate;
}

export function isResizeDerivative(fileName) {
  return RESIZE_DERIVATIVE_PATTERN.test(basename(fileName));
}

export function originalNameForDerivative(fileName) {
  const name = basename(fileName);
  if (!isResizeDerivative(name)) return name;

  const ext = extname(name);
  return name.replace(/_hu[0-9a-f]+_\d+x\d+_resize(?:_[^.]+)*\.[^.]+$/i, ext);
}

export async function copyReferencedAsset({
  sourceRoot,
  outputPostDir,
  postSlug,
  imageUrl,
  usedNames = new Set(),
  copiedBySource = new Map(),
}) {
  const imagePath = normalizeImagePath(imageUrl, postSlug);
  const referencedSource = sourcePathForImage({ sourceRoot, postSlug, imagePath });
  if (!referencedSource) {
    return { markdownPath: "", missing: imageUrl };
  }

  const referencedName = basename(referencedSource);
  const originalName = originalNameForDerivative(referencedName);
  const originalSource = join(dirname(referencedSource), originalName);
  const copiedFrom =
    isResizeDerivative(referencedName) && (await exists(originalSource))
      ? originalSource
      : referencedSource;

  if (!(await exists(copiedFrom))) {
    return { markdownPath: "", missing: imageUrl };
  }

  const previousCopy = copiedBySource.get(copiedFrom);
  if (previousCopy) {
    return { ...previousCopy, reused: true };
  }

  const outputName = collisionFreeName(basename(copiedFrom), usedNames);
  const copiedTo = join(outputPostDir, "assets", outputName);
  const markdownPath = `./assets/${outputName}`;

  await mkdir(dirname(copiedTo), { recursive: true });
  await copyFile(copiedFrom, copiedTo);

  usedNames.add(outputName);
  const result = { markdownPath, copiedFrom, copiedTo };
  copiedBySource.set(copiedFrom, result);

  return result;
}
