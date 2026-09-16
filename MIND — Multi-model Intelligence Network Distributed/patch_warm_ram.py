import os
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_H = os.path.join(_HERE, "src", "llama-kv-swap.h")

with open(_H, "r", encoding="utf-8") as f:
    h_content = f.read()
h_original = h_content

# Add to llama_kv_block_meta
meta_target = "    uint32_t            stream_id = 0;  // stream/device association\n"
if "void *              ram_ptr = nullptr;" not in h_content:
    h_content = h_content.replace(meta_target, meta_target + "    void *              ram_ptr = nullptr;\n")

# Add to llama_kv_tiered_manager private members
manager_target = "    uint32_t kv_size = 0;\n"
if "size_t   max_ram_bytes = 0;" not in h_content:
    h_content = h_content.replace(manager_target, manager_target + "    size_t   max_ram_bytes = 1024 * 1024 * 1024; // 1GB default\n    size_t   used_ram_bytes = 0;\n")

# Add map for ram blocks
map_target = "    std::unordered_map<llama_kv_block_id, llama_kv_block_meta, llama_kv_block_id_hash> blocks;\n"
if "std::list<llama_kv_block_id> warm_ram_list;" not in h_content:
    h_content = h_content.replace(map_target, map_target + "    std::list<llama_kv_block_id> warm_ram_list;\n    std::unordered_map<llama_kv_block_id, std::list<llama_kv_block_id>::iterator, llama_kv_block_id_hash> warm_ram_map;\n")

if h_content != h_original:
    with open(_H, "w", encoding="utf-8") as f:
        f.write(h_content)
    print("Headers patched")
else:
    print("Headers already patched; no changes.")
