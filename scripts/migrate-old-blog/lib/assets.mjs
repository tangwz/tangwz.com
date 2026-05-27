import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

const RESIZE_DERIVATIVE_PATTERN = /_hu[0-9a-f]+_(?:\d+_)?\d+x\d+_resize(?:_[^.]+)*\.[^.]+$/i;
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeImageReference(imageUrl, postSlug) {
  const value = String(imageUrl ?? "").trim();
  if (!value) return { imagePath: "", externalUrl: "" };

  let pathName = "";
  try {
    const url = new URL(value);
    if (url.hostname !== "tangwz.com") return { imagePath: "", externalUrl: value };
    pathName = url.pathname;
  } catch {
    const withoutQuery = value.split(/[?#]/, 1)[0];
    const malformedAbsoluteUrl = withoutQuery.match(/^\/(https?:\/\/.+)$/i);
    if (malformedAbsoluteUrl) {
      return { imagePath: "", externalUrl: malformedAbsoluteUrl[1] };
    }

    if (withoutQuery.startsWith("/")) {
      pathName = withoutQuery;
    } else {
      const relativePath = withoutQuery.replace(/^\.?\//, "");
      pathName = `/posts/${postSlug}/${relativePath}`;
    }
  }

  try {
    return { imagePath: decodeURIComponent(pathName), externalUrl: "" };
  } catch {
    return { imagePath: "", externalUrl: "" };
  }
}

function isInsideDir(parentDir, targetPath) {
  const child = relative(parentDir, targetPath);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function sourcePathForImage({ sourceRoot, postSlug, imagePath }) {
  const expectedPrefix = `/posts/${postSlug}/`;
  const mediaPrefix = "/media/";

  let allowedDir = "";
  if (imagePath.startsWith(expectedPrefix)) {
    allowedDir = resolve(sourceRoot, "posts", postSlug);
  } else if (imagePath.startsWith(mediaPrefix)) {
    allowedDir = resolve(sourceRoot, "media");
  } else {
    return "";
  }

  const sourcePath = resolve(sourceRoot, imagePath.slice(1));
  if (!isInsideDir(allowedDir, sourcePath)) return "";
  return sourcePath;
}

async function alternateImageSource(sourcePath) {
  const parsed = parse(sourcePath);
  try {
    const entries = await readdir(parsed.dir, { withFileTypes: true });
    const match = entries.find(entry => {
      if (!entry.isFile()) return false;
      const candidate = parse(entry.name);
      return candidate.name === parsed.name && IMAGE_EXTENSIONS.has(candidate.ext.toLowerCase());
    });
    return match ? join(parsed.dir, match.name) : "";
  } catch {
    return "";
  }
}

async function collisionFreeName(fileName, usedNames, outputAssetDir) {
  if (!usedNames.has(fileName) && !(await exists(join(outputAssetDir, fileName)))) {
    return fileName;
  }

  const parsed = parse(fileName);
  let index = 2;
  let candidate = `${parsed.name}-${index}${parsed.ext}`;

  while (usedNames.has(candidate) || (await exists(join(outputAssetDir, candidate)))) {
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
  return name.replace(/_hu[0-9a-f]+_(?:\d+_)?\d+x\d+_resize(?:_[^.]+)*\.[^.]+$/i, ext);
}

export async function copyReferencedAsset({
  sourceRoot,
  outputPostDir,
  postSlug,
  imageUrl,
  usedNames = new Set(),
  copiedBySource = new Map(),
}) {
  const { imagePath, externalUrl } = normalizeImageReference(imageUrl, postSlug);
  if (externalUrl) {
    return { markdownPath: "", externalUrl };
  }

  const referencedSource = sourcePathForImage({ sourceRoot, postSlug, imagePath });
  if (!referencedSource) {
    return { markdownPath: "", missing: imageUrl };
  }

  const referencedName = basename(referencedSource);
  const originalName = originalNameForDerivative(referencedName);
  const originalSource = join(dirname(referencedSource), originalName);
  let copiedFrom = "";
  if (isResizeDerivative(referencedName) && (await exists(originalSource))) {
    copiedFrom = originalSource;
  } else if (await exists(referencedSource)) {
    copiedFrom = referencedSource;
  } else {
    copiedFrom = await alternateImageSource(referencedSource);
  }

  if (!copiedFrom) {
    return { markdownPath: "", missing: imageUrl };
  }

  const previousCopy = copiedBySource.get(copiedFrom);
  if (previousCopy) {
    return { ...previousCopy, reused: true };
  }

  const outputAssetDir = join(outputPostDir, "assets");
  const outputName = await collisionFreeName(basename(copiedFrom), usedNames, outputAssetDir);
  const copiedTo = join(outputAssetDir, outputName);
  const markdownPath = `./assets/${outputName}`;

  await mkdir(dirname(copiedTo), { recursive: true });
  await copyFile(copiedFrom, copiedTo);

  usedNames.add(outputName);
  const result = { markdownPath, copiedFrom, copiedTo };
  copiedBySource.set(copiedFrom, result);

  return result;
}
