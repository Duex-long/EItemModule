import { ConfigurationError } from './errors.js';

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

const VERSION_TEXT = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(input: string): VersionParts {
  const matched = VERSION_TEXT.exec(input);
  if (!matched) {
    throw new ConfigurationError(`无法解析版本: ${input}`);
  }
  return {
    major: Number(matched[1]),
    minor: Number(matched[2]),
    patch: Number(matched[3]),
  };
}

function compare(left: VersionParts, right: VersionParts): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

/**
 * 支持本协议使用的范围写法：`^x.y.z`，以及由 `>` `<` `>=` `<=` `=` 组成的比较器列表。
 * `^` 在主版本大于 0 时锁定主版本；`^0.y.z` 锁定次版本。
 */
export function versionSatisfies(version: string, range: string): boolean {
  const current = parseVersion(version);
  const parts = range.trim().split(/\s+/);
  if (parts.length === 1 && parts[0].startsWith('^')) {
    const base = parseVersion(parts[0].slice(1));
    if (compare(current, base) < 0) {
      return false;
    }
    if (base.major === 0) {
      return current.major === 0 && current.minor === base.minor;
    }
    return current.major === base.major;
  }
  return parts.every((part) => {
    const matched = /^(>=|<=|>|<|=)(\d+\.\d+\.\d+)$/.exec(part);
    if (!matched) {
      throw new ConfigurationError(`无法解析版本范围: ${range}`);
    }
    const order = compare(current, parseVersion(matched[2]));
    switch (matched[1]) {
      case '>=':
        return order >= 0;
      case '<=':
        return order <= 0;
      case '>':
        return order > 0;
      case '<':
        return order < 0;
      default:
        return order === 0;
    }
  });
}
