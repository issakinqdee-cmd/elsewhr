import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return res.status(503).json({ error: "Account deletion is not configured yet." });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Authentication required." });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return res.status(401).json({ error: "Invalid session." });
  }

  const userId = userData.user.id;

  try {
    const { data: objects, error: listError } = await admin.storage
      .from("avatars")
      .list(userId, { limit: 1000 });

    if (listError) throw listError;

    if (objects?.length) {
      const paths = objects
        .filter((object) => object?.name)
        .map((object) => `${userId}/${object.name}`);

      if (paths.length) {
        const { error: removeError } = await admin.storage
          .from("avatars")
          .remove(paths);

        if (removeError) throw removeError;
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("ELSEWHR account deletion failed:", error);
    return res.status(500).json({ error: error.message || "Could not delete your account." });
  }
}
