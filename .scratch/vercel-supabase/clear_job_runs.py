import json
import os
import urllib.request

secrets = {}
with open(r"C:\Users\bit-it.helpdesk\Desktop\claude\portfolio-tracker\.scratch\vercel-supabase\secrets.env") as f:
    for ln in f:
        if "=" in ln and not ln.startswith("#"):
            k, v = ln.strip().split("=", 1)
            secrets[k] = v

query = "delete from job_runs;"
body = json.dumps({"query": query}).encode()
req = urllib.request.Request(
    "https://api.supabase.com/v1/projects/mujxregicbbabemlwgrs/database/query",
    data=body,
    headers={"Authorization": f"Bearer {secrets['SUPABASE_ACCESS_TOKEN']}",
             "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=60) as r:
    print("STATUS:", r.status, r.read().decode()[:200])
