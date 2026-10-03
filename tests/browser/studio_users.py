"""
studio_users.py - throwaway Studio users for tests/browser/studio.mjs.

  python tests/browser/studio_users.py make  > tests/browser/.out/users.json
  python tests/browser/studio_users.py clean tests/browser/.out/users.json

`make` creates an author and an admin (service key from admin/.env; test only: real people
sign in by magic link), signs both in, and prints their sessions as JSON. `clean` deletes the
users, their plans, and the audit rows written since `make`.
"""
import json
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import supa  # noqa: E402

from supabase import create_client  # noqa: E402

supa.load_env()
service = supa.client()
ANON = next(l.split("'")[1] for l in (ROOT / "web" / "config.js").read_text().splitlines() if "supabaseAnonKey" in l)


def make():
    out = {"audit_start": service.table("audit_log").select("id").order("id", desc=True).limit(1).execute().data[0]["id"]}
    for role in ("author", "admin"):
        email = f"zz-studio-e2e-{role}-{secrets.token_hex(3)}@example.com"
        password = secrets.token_urlsafe(16)
        user = service.auth.admin.create_user({"email": email, "password": password, "email_confirm": True}).user
        if role == "admin":
            service.table("profiles").update({"role": "admin", "display_name": "ZZ Admin"}).eq("id", user.id).execute()
        else:
            service.table("profiles").update({"display_name": "ZZ Author"}).eq("id", user.id).execute()
        s = create_client(os.environ["SUPABASE_URL"], ANON).auth.sign_in_with_password({"email": email, "password": password}).session
        out[role] = {"id": user.id, "email": email, "session": json.loads(s.model_dump_json())}
    print(json.dumps(out))


def clean(path):
    data = json.loads(Path(path).read_text())
    for uid in {data["author"]["id"], data["admin"]["id"]}:
        service.table("study_plans").delete().eq("owner_id", uid).execute()
        service.auth.admin.delete_user(uid)
    service.table("study_plans").delete().like("title", "ZZ %").execute()
    service.table("audit_log").delete().gt("id", data["audit_start"]).execute()
    Path(path).unlink()
    print("cleaned up test users, plans and audit rows")


def link(base):
    """Two throwaway users: one gets a one-time LINK (landing on base/studio/), the other a one-time
    CODE, for signin.mjs. Generated server-side (no email is sent). Separate users because each new
    sign-in token replaces the user's previous one."""
    start = service.table("audit_log").select("id").order("id", desc=True).limit(1).execute().data[0]["id"]
    made = []
    for tag in ("link", "code"):
        email = f"zz-studio-signin-{tag}-{secrets.token_hex(3)}@example.com"
        user = service.auth.admin.create_user({"email": email, "email_confirm": True}).user
        props = service.auth.admin.generate_link({"type": "magiclink", "email": email,
                                                  "options": {"redirect_to": base + "studio/"}}).properties
        made.append((user, email, props))
    (lu, _, lp), (cu, cemail, cp) = made
    print(json.dumps({"link": lp.action_link, "email": cemail, "code": cp.email_otp,
                      "author": {"id": lu.id}, "admin": {"id": cu.id}, "audit_start": start}))


if __name__ == "__main__":
    {"make": lambda: make(), "link": lambda: link(sys.argv[2]), "clean": lambda: clean(sys.argv[2])}[sys.argv[1]]()
