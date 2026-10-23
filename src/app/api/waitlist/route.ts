import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Entry = { email: string; word: string; joinedAt: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Local file storage for development. Swap this for a real store (database or
// email platform) before deploying; serverless file systems are read-only.
const FILE = path.join(process.cwd(), "data", "waitlist.json");

async function load(): Promise<Entry[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let body: { email?: unknown; word?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the form as JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) {
    return Response.json({ error: "Add your full email address, like name@domain.com." }, { status: 422 });
  }
  const word = typeof body.word === "string" ? body.word.trim().slice(0, 24) : "";

  const list = await load();
  const existing = list.find((entry) => entry.email === email);
  if (existing) {
    if (word) existing.word = word;
  } else {
    list.push({ email, word, joinedAt: new Date().toISOString() });
  }

  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(list, null, 2));
  return Response.json({ ok: true });
}
