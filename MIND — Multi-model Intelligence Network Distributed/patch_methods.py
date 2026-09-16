import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_CPP = os.path.join(_HERE, "src", "llama-kv-swap.cpp")

with open(_CPP, "r", encoding="utf-8") as f:
    content = f.read()
original = content

failures = []

# 1. Patch remove_seq fractured block
old_remove = """        else if ((p1 < 0 && block_end > p0) || (it->first.pos_start < p1 && block_end > p0)) {
            if (it->second.loc == llama_kv_block_loc::COLD_SSD) {
                store->free_slot(it->second.swap_slot);
            }
            auto lru_it = lru_map.find(it->first);"""

new_remove = """        else if ((p1 < 0 && block_end > p0) || (it->first.pos_start < p1 && block_end > p0)) {
            if (it->second.loc == llama_kv_block_loc::COLD_SSD) {
                store->free_slot(it->second.swap_slot);
            } else if (it->second.loc == llama_kv_block_loc::WARM_RAM) {
                if (it->second.ram_ptr) {
                    free(it->second.ram_ptr);
                    it->second.ram_ptr = nullptr;
                    used_ram_bytes -= block_bytes;
                }
                auto warm_it = warm_ram_map.find(it->first);
                if (warm_it != warm_ram_map.end()) {
                    warm_ram_list.erase(warm_it->second);
                    warm_ram_map.erase(warm_it);
                }
            }
            auto lru_it = lru_map.find(it->first);"""

if old_remove in content:
    # NOTE: old_div below is textually identical, so this one replace
    # patches both the remove_seq and div_seq sites.
    content = content.replace(old_remove, new_remove)
    print("Patched remove_seq + div_seq fractured blocks")
else:
    failures.append("old_remove")

# 2. Patch div_seq fractured block
old_div = """        else if ((p1 < 0 && block_end > p0) || (it->first.pos_start < p1 && block_end > p0)) {
            if (it->second.loc == llama_kv_block_loc::COLD_SSD) {
                store->free_slot(it->second.swap_slot);
            }
            auto lru_it = lru_map.find(it->first);"""

# The string is exactly the same as old_remove, so replace would do both. Let's make sure it replaces both.
# But wait, replace replaces all occurrences!

# 3. Patch cp_seq
old_cp = """            if (meta.loc == llama_kv_block_loc::COLD_SSD) {
                // We must duplicate the SSD slot to avoid double-free
                int64_t new_slot = store->alloc_slot();
                if (new_slot >= 0) {
                    if (store->read_block(it->second.swap_slot, io_buffer, block_bytes)) {
                        if (store->write_block(new_slot, io_buffer, block_bytes)) {
                            meta.swap_slot = new_slot;
                        } else {
                            store->free_slot(new_slot);
                            continue; // failed to write
                        }
                    } else {
                        store->free_slot(new_slot);
                        continue; // failed to read
                    }
                } else {
                    continue; // no space
                }
            }
            meta.access_ts = ++current_ts;"""

new_cp = """            if (meta.loc == llama_kv_block_loc::COLD_SSD) {
                // We must duplicate the SSD slot to avoid double-free
                int64_t new_slot = store->alloc_slot();
                if (new_slot >= 0) {
                    if (store->read_block(it->second.swap_slot, io_buffer, block_bytes)) {
                        if (store->write_block(new_slot, io_buffer, block_bytes)) {
                            meta.swap_slot = new_slot;
                        } else {
                            store->free_slot(new_slot);
                            continue; // failed to write
                        }
                    } else {
                        store->free_slot(new_slot);
                        continue; // failed to read
                    }
                } else {
                    continue; // no space
                }
            } else if (meta.loc == llama_kv_block_loc::WARM_RAM) {
                if (meta.ram_ptr) {
                    void * new_ram = malloc(block_bytes);
                    if (new_ram) {
                        memcpy(new_ram, meta.ram_ptr, block_bytes);
                        meta.ram_ptr = new_ram;
                        used_ram_bytes += block_bytes;
                    } else {
                        continue; // no space
                    }
                }
            }
            meta.access_ts = ++current_ts;"""

if old_cp in content:
    content = content.replace(old_cp, new_cp)
    print("Patched cp_seq")
else:
    failures.append("old_cp")

if failures:
    print(f"Could not find: {', '.join(failures)}")
    sys.exit(1)

if content != original:
    with open(_CPP, "w", encoding="utf-8") as f:
        f.write(content)
    print("Methods patched.")
else:
    print("No changes to write.")
