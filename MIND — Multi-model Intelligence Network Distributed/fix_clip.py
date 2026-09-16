import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CLIP = os.path.join(_HERE, "tools", "mtmd", "clip.cpp")

with open(_CLIP, "r", encoding="utf-8") as f:
    lines = f.readlines()

START, END = 909, 1024
if len(lines) < END:
    print(f"clip.cpp has only {len(lines)} lines; expected at least {END}.")
    sys.exit(1)

changed = False
for i in range(START, END):
    if not lines[i].startswith("// "):
        lines[i] = "// " + lines[i]
        changed = True

if not changed:
    print("Lines already commented out; no changes.")
    sys.exit(0)

with open(_CLIP, "w", encoding="utf-8") as f:
    f.writelines(lines)
print(f"Commented out clip.cpp lines {START + 1}-{END}.")
