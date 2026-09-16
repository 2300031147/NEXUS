import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CPP = os.path.join(_HERE, "src", "llama-kv-swap.cpp")

with open(_CPP, "r", encoding="utf-8") as f:
    content = f.read()

# Do not clobber the full WARM_RAM tiering installed by patch_manager.py
# with this one-line change.
if "WARM_RAM Tiering Logic" in content:
    print("Full WARM_RAM tiering already present; skipping one-line patch.")
    sys.exit(0)

# Replace COLD_SSD with WARM_RAM in evict_lru_block
old = "out_evicted.loc = llama_kv_block_loc::COLD_SSD;"
new = "out_evicted.loc = llama_kv_block_loc::WARM_RAM;"

if old not in content:
    print("Pattern not found; nothing to patch.")
    sys.exit(1)

content = content.replace(old, new)

with open(_CPP, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched evict path to WARM_RAM.")

# Actually, the user wants: "vram to ram, ram to ssd, ssd to vram, and model will first check the ram for old context if not found then it will comes to ssd and vram over flow to ram, ram overflow to ssd"
# Currently the swap manager only swaps from VRAM (HOT_VRAM) to SSD (COLD_SSD). We need to implement WARM_RAM caching as a middle layer.
