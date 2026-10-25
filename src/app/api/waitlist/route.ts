import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Each sign-up is one private file in the Vercel Blob store, named by a hash
// of the email. Concurrent sign-ups never overwrite each other, and signing up
// again just updates that person's entry. Browse them in the Vercel dashboard
// under Storage → dream-waitlist.
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

  const id = createHash("sha256").update(email).digest("hex").slice(0, 32);
  try {
    await put(
      `waitlist/${id}.json`,
      JSON.stringify({ email, word, submittedAt: new Date().toISOString() }),
      { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true },
    );
  } catch (error) {
    console.error("Waitlist save failed", error);
    return Response.json({ error: "Your place wasn't saved. Try again in a moment." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
