import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CPP = os.path.join(_HERE, "src", "llama-kv-swap.cpp")

with open(_CPP, "r", encoding="utf-8") as f:
    content = f.read()

old = "fwrite(&KVSW_MAGIC, sizeof(version), 1, fp);"
new = "uint32_t magic = KVSW_MAGIC; fwrite(&magic, sizeof(magic), 1, fp);"

if old not in content:
    print("Pattern not found; nothing to patch.")
    sys.exit(1)

content = content.replace(old, new)

with open(_CPP, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched KVSW_MAGIC fwrite.")
