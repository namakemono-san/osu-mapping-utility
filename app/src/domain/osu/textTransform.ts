function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

function isSectionHeader(s: string): boolean {
  return /^\s*\[[A-Za-z]+\]\s*$/i.test(s);
}

export function rewriteCenter(content: string, x = 256, y = 192): string {
  const lines = content.split(/\r?\n/);
  let inHit = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
      inHit = true;
      continue;
    }
    if (isSectionHeader(raw)) {
      inHit = false;
      continue;
    }
    if (!inHit) continue;
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;
    const a = line.split(",");
    if (a.length < 5) continue;
    a[0] = String(x);
    a[1] = String(y);
    lines[i] = a.join(",");
  }
  return lines.join(detectEol(content));
}

export function removeEditorBookmarks(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let inEditor = false;
  for (const raw of lines) {
    if (/^\s*\[Editor\]\s*$/i.test(raw)) {
      inEditor = true;
      out.push(raw);
      continue;
    }
    if (isSectionHeader(raw)) {
      inEditor = false;
      out.push(raw);
      continue;
    }
    if (inEditor && /^\s*Bookmarks\s*:/i.test(raw)) continue;
    out.push(raw);
  }
  return out.join(detectEol(content));
}

export function removeNewComboExceptFirst(content: string): string {
  const lines = content.split(/\r?\n/);
  let inHit = false;
  let seenFirst = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
      inHit = true;
      continue;
    }
    if (isSectionHeader(raw)) {
      inHit = false;
      continue;
    }
    if (!inHit) continue;
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;
    const a = line.split(",");
    if (a.length < 4) continue;
    if (!seenFirst) {
      seenFirst = true;
      continue;
    }
    if (a[3] === "5") {
      a[3] = "1";
      lines[i] = a.join(",");
    }
  }
  return lines.join(detectEol(content));
}

export function whistleToClap_2to8(content: string): string {
  const lines = content.split(/\r?\n/);
  let inHit = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*\[HitObjects\]\s*$/i.test(raw)) {
      inHit = true;
      continue;
    }
    if (isSectionHeader(raw)) {
      inHit = false;
      continue;
    }
    if (!inHit) continue;
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;
    const a = line.split(",");
    if (a.length < 5) continue;
    if (a[4] === "2") {
      a[4] = "8";
      lines[i] = a.join(",");
    }
    if (a[4] === "6") {
      a[4] = "12";
      lines[i] = a.join(",");
    }
  }
  return lines.join(detectEol(content));
}
