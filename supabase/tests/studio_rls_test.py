"""
studio_rls_test.py - prove the Studio's security rules over the real API, as real users.

Creates throwaway users (author A, author B, an admin), signs each in with a password (test
only: the Studio itself uses magic links), runs the checks, then deletes everything it made
(users, plans, audit rows). Uses the service role key from admin/.env ONLY to create and
clean up the test users.

Usage (repo root, venv active):  python supabase/tests/studio_rls_test.py
"""
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import supa  # noqa: E402

from supabase import create_client  # noqa: E402

supa.load_env()
URL = os.environ["SUPABASE_URL"]
ANON = next(l.split("'")[1] for l in (ROOT / "web" / "config.js").read_text().splitlines() if "supabaseAnonKey" in l)
service = supa.client()

passed = failed = 0


def check(cond, name):
    global passed, failed
    print(("PASS " if cond else "FAIL ") + name)
    passed, failed = passed + bool(cond), failed + (not cond)


def refused(fn):
    """True if the call raises (RLS / trigger / check refused it)."""
    try:
        r = fn()
        # PostgREST returns 200 with no rows when RLS silently filters an update/delete.
        return getattr(r, "data", None) in ([], None)
    except Exception:  # noqa: BLE001
        return True


def new_user(tag):
    email = f"zz-studio-test-{tag}-{secrets.token_hex(3)}@example.com"
    password = secrets.token_urlsafe(16)
    user = service.auth.admin.create_user({"email": email, "password": password, "email_confirm": True}).user
    c = create_client(URL, ANON)
    c.auth.sign_in_with_password({"email": email, "password": password})
    return user, c


start_audit = service.table("audit_log").select("id").order("id", desc=True).limit(1).execute().data[0]["id"]
users = []
try:
    a_user, A = new_user("a")
    b_user, B = new_user("b")
    admin_user, ADMIN = new_user("admin")
    users = [a_user, b_user, admin_user]
    service.table("profiles").update({"role": "admin"}).eq("id", admin_user.id).execute()
    anon = create_client(URL, ANON)

    hymn = service.table("hymns").select("id,number").eq("status", "published").limit(1).execute().data[0]
    unpub = service.table("hymns").select("id,number").eq("status", "approved").limit(1).execute().data[0]
    prayer = service.table("prayers").select("id").eq("status", "published").limit(1).execute().data[0]

    # ---- public / tablets
    # Compare with the real data (admins publish/unpublish plans, so counts change over time).
    pub = anon.table("study_plans").select("id,title,status").execute().data
    want = service.table("study_plans").select("id").eq("status", "published").execute().data
    check(len(pub) == len(want) and all(p["status"] == "published" for p in pub),
          f"anon sees exactly the published plans ({len(pub)} of {len(want)} published)")
    # An imported plan (owner_id null) that is still published shows its three modules.
    imported = (service.table("study_plans").select("id").eq("status", "published")
                .is_("owner_id", "null").order("id").limit(1).execute().data)
    if imported:
        items = (anon.table("study_plan_items").select("module_type").eq("plan_id", imported[0]["id"])
                 .order("position").execute().data)
        check([i["module_type"] for i in items] == ["hymn", "scripture", "prayer"], "imported plan = hymn, scripture, prayer")
    else:
        print("SKIP imported plan shape (no imported plan is published right now)")
    check(refused(lambda: anon.rpc("save_study_plan", {"p_id": None, "p_title": "x", "p_description": None, "p_items": []}).execute()),
          "anon can't create plans")

    # ---- author creates a draft
    good_items = [
        {"type": "hymn", "config": {"hymn_id": hymn["id"]}},
        {"type": "scripture", "config": {"book": "PSA", "chapter": 23, "start": 1, "end": 3}},
        {"type": "note", "config": {"title": "ZZ test", "text": "ZZ test note"}},
        {"type": "hymn", "config": {"hymn_id": hymn["id"]}},
        {"type": "prayer", "config": {"prayer_id": prayer["id"]}},
    ]
    pid = A.rpc("save_study_plan", {"p_id": None, "p_title": "ZZ Studio test", "p_description": "test",
                                     "p_items": good_items}).execute().data
    check(isinstance(pid, int), f"author A saved a 5-module draft (id {pid})")
    row = A.table("study_plans").select("status,owner_id").eq("id", pid).execute().data[0]
    check(row["status"] == "draft" and row["owner_id"] == a_user.id, "new plan is A's draft")
    check(anon.table("study_plans").select("id").eq("id", pid).execute().data == [], "anon can't see the draft")
    check(B.table("study_plans").select("id").eq("id", pid).execute().data == [], "author B can't see A's draft")
    check(refused(lambda: B.rpc("save_study_plan", {"p_id": pid, "p_title": "hijack", "p_description": None,
                                                     "p_items": []}).execute()), "author B can't overwrite A's plan")
    check(refused(lambda: B.table("study_plan_items").insert({"plan_id": pid, "position": 9, "module_type": "note",
                                                              "config": {}}).execute()), "author B can't add modules to A's plan")

    # ---- content integrity enforced by the database
    check(refused(lambda: A.rpc("save_study_plan", {"p_id": pid, "p_title": "ZZ Studio test", "p_description": None,
                                                     "p_items": [{"type": "scripture", "config": {"book": "PSA", "chapter": 23, "text": "verse text"}}]}).execute()),
          "DB refuses Scripture text in a scripture module")
    check(refused(lambda: A.rpc("save_study_plan", {"p_id": pid, "p_title": "ZZ Studio test", "p_description": None,
                                                     "p_items": [{"type": "prayer", "config": {"prayer_id": prayer["id"], "text": "typed prayer"}}]}).execute()),
          "DB refuses typed-in prayer text in a prayer module")
    after = A.table("study_plan_items").select("id").eq("plan_id", pid).execute().data
    check(len(after) == 5, "a refused save changes nothing (still 5 modules)")

    # ---- status rules
    check(refused(lambda: A.table("study_plans").update({"status": "published"}).eq("id", pid).execute()),
          "author can't publish their own plan")
    A.table("study_plans").update({"status": "pending"}).eq("id", pid).execute()
    check(A.table("study_plans").select("status").eq("id", pid).execute().data[0]["status"] == "pending", "author submits for review")
    check(refused(lambda: A.table("study_plans").update({"title": "sneaky edit"}).eq("id", pid).execute()),
          "can't edit while pending")
    check(refused(lambda: A.rpc("review_study_plan", {"p_id": pid, "p_approve": True}).execute()), "author can't approve")

    # ---- admin review
    ADMIN.rpc("save_study_plan", {"p_id": pid, "p_title": "ZZ Studio test", "p_description": "test",
                                  "p_items": good_items + [{"type": "hymn", "config": {"hymn_id": unpub["id"]}}]}).execute()
    probs = ADMIN.rpc("study_plan_problems", {"p_id": pid}).execute().data
    check(any("isn't published" in p for p in probs), f"problems list flags unpublished hymn: {probs}")
    check(refused(lambda: ADMIN.rpc("review_study_plan", {"p_id": pid, "p_approve": True}).execute()),
          "admin can't approve a plan with unpublished content")
    ADMIN.rpc("review_study_plan", {"p_id": pid, "p_approve": False, "p_note": "Please remove the last hymn."}).execute()
    row = A.table("study_plans").select("status,review_note").eq("id", pid).execute().data[0]
    check(row["status"] == "draft" and row["review_note"] == "Please remove the last hymn.", "sent back to A with a note")
    check(refused(lambda: A.table("study_plans").update({"review_note": "approved!"}).eq("id", pid).execute()),
          "author can't change the review note")
    A.rpc("save_study_plan", {"p_id": pid, "p_title": "ZZ Studio test", "p_description": "test", "p_items": good_items}).execute()
    A.table("study_plans").update({"status": "pending"}).eq("id", pid).execute()
    ADMIN.rpc("review_study_plan", {"p_id": pid, "p_approve": True}).execute()
    check(len(anon.table("study_plans").select("id").eq("id", pid).execute().data) == 1, "approved plan is visible to tablets")
    check(len(anon.table("study_plan_items").select("id").eq("plan_id", pid).execute().data) == 5, "…with its 5 modules")
    check(refused(lambda: A.rpc("save_study_plan", {"p_id": pid, "p_title": "edit live", "p_description": None,
                                                     "p_items": []}).execute()), "author can't edit a published plan in place")

    # ---- libraries and admin-only functions
    check(refused(lambda: A.table("hymns").update({"is_familiar": False}).eq("id", hymn["id"]).execute()), "author can't change hymns")
    check(refused(lambda: A.table("prayers").insert({"slug": "zz", "title": "zz", "text": "zz", "source": "zz"}).execute()),
          "author can't add prayers")
    check(A.table("audit_log").select("id").limit(1).execute().data == [], "author can't read the audit log")
    check(len(ADMIN.table("audit_log").select("id").gt("id", start_audit).execute().data) > 0, "admin reads the audit log")
    check(refused(lambda: A.rpc("admin_list_users", {}).execute()), "author can't list users")
    check(len(ADMIN.rpc("admin_list_users", {}).execute().data) >= 3, "admin lists users")
    check(refused(lambda: A.table("profiles").update({"role": "admin"}).eq("id", a_user.id).execute()),
          "author can't make themselves admin")
    A.table("profiles").update({"display_name": "ZZ Tester"}).eq("id", a_user.id).execute()
    check(A.table("profiles").select("display_name").eq("id", a_user.id).execute().data[0]["display_name"] == "ZZ Tester",
          "author can set their display name")
    hid = ADMIN.table("hymns").update({"notes": "zz studio test"}).eq("id", hymn["id"]).execute().data
    check(len(hid) == 1, "admin can update a hymn")
    ADMIN.table("hymns").update({"notes": None}).eq("id", hymn["id"]).execute()
finally:
    # Clean up: plans owned by test users, the users (profiles cascade), audit rows.
    for u in users:
        service.table("study_plans").delete().eq("owner_id", u.id).execute()
        service.auth.admin.delete_user(u.id)
    service.table("audit_log").delete().gt("id", start_audit).execute()
    left = service.table("study_plans").select("id").like("title", "ZZ%").execute().data
    print(f"cleaned up ({len(users)} test users removed; leftover ZZ plans: {len(left)})")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
