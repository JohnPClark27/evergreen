"""
studio_signin.py - a one-time Studio sign-in for someone, WITHOUT sending an email.

Useful when the free email sender's limit (about 2 emails an hour) blocks sign-in, and to make
the first admin. Uses the service key from .env, so only someone with that key can run it.

  python pipeline/studio_signin.py you@example.com                 # link + code, Studio on production
  python pipeline/studio_signin.py you@example.com --admin         # …and make them an admin
  python pipeline/studio_signin.py you@example.com --url https://studio.evergreen-ai.pages.dev/studio/

Prints a sign-in link (open it in any browser) and a one-time code (Studio → "I have a sign-in
code"). Both work once, for one hour. Treat them like a password: they sign in as that person.
"""
import argparse
import sys

import supa

DEFAULT_URL = "https://evergreen-ai.pages.dev/studio/"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("email")
    ap.add_argument("--url", default=DEFAULT_URL, help=f"where the link lands (default {DEFAULT_URL})")
    ap.add_argument("--admin", action="store_true", help="also make this person an admin")
    args = ap.parse_args()

    sb = supa.client()
    email = args.email.strip().lower()
    # Make sure the account exists (people who never finished signing up have one already).
    users = sb.auth.admin.list_users(per_page=1000)
    user = next((u for u in users if (u.email or "").lower() == email), None)
    if user is None:
        user = sb.auth.admin.create_user({"email": email, "email_confirm": True}).user
        print(f"Created an account for {email}.")

    if args.admin:
        sb.table("profiles").update({"role": "admin"}).eq("id", user.id).execute()
        sb.table("audit_log").insert({"actor": supa.actor("pipeline"), "action": "role", "table_name": "profiles",
                                      "row_id": str(user.id), "after": {"role": "admin", "via": "studio_signin.py"}}).execute()
        print(f"{email} is now an admin.")

    link = sb.auth.admin.generate_link({"type": "magiclink", "email": email, "options": {"redirect_to": args.url}})
    print("\nOne-time sign-in (works once, for 1 hour; don't share it):")
    print(f"  Link: {link.properties.action_link}")
    print(f"  Code: {link.properties.email_otp}   (Studio → \"I have a sign-in code\")")


if __name__ == "__main__":
    sys.exit(main())
