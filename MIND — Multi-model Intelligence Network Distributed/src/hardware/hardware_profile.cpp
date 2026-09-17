#include "hardware_profile.h"

HardwareProfileType HardwareProfile::determine_profile(const MemoryTopology & topo) {
    if (topo.accelerator == "qualcomm" || topo.accelerator == "snapdragon" ||
        topo.device_model.find("Snapdragon") != std::string::npos ||
        topo.device_model.find("Adreno") != std::string::npos) {
        return HardwareProfileType::ACCELERATOR;
    }

    if (topo.unified_memory) {
        return HardwareProfileType::UNIFIED_MEMORY;
    }

    if (topo.accelerator == "cuda" || topo.accelerator == "rocm" ||
        topo.accelerator == "vulkan" || topo.accelerator_memory > 0) {
        return HardwareProfileType::DISCRETE_GPU;
    }

    return HardwareProfileType::CPU_ONLY;
}

std::string HardwareProfile::profile_to_string(HardwareProfileType type) {
    switch (type) {
        case HardwareProfileType::DISCRETE_GPU:   return "discrete_gpu";
        case HardwareProfileType::UNIFIED_MEMORY: return "unified_memory";
        case HardwareProfileType::ACCELERATOR:    return "accelerator";
        case HardwareProfileType::CPU_ONLY:       return "cpu_only";
    }
    return "unknown";
}

std::vector<CacheTier> HardwareProfile::build_cache_tiers(
        const MemoryTopology & topo,
        size_t hot_capacity,
        size_t warm_ram_capacity,
        size_t cold_ssd_capacity) {

    std::vector<CacheTier> tiers;
    HardwareProfileType ptype = determine_profile(topo);

    switch (ptype) {
        case HardwareProfileType::DISCRETE_GPU: {
            // HOT tier: Dedicated VRAM
            CacheTier hot;
            hot.type = CacheTierType::HOT;
            hot.capacity = hot_capacity > 0 ? hot_capacity : topo.accelerator_memory;
            hot.used = 0;
            hot.persistent = false;
            hot.shared = false;
            hot.unified = false;
            hot.backend = topo.accelerator + "_vram";
            tiers.push_back(hot);

            // WARM tier: Host System RAM (requires PCIe transfer / memcpy)
            CacheTier warm;
            warm.type = CacheTierType::WARM;
            warm.capacity = warm_ram_capacity;
            warm.used = 0;
            warm.persistent = false;
            warm.shared = false;
            warm.unified = false;
            warm.backend = "system_ram";
            tiers.push_back(warm);

            // COLD tier: NVMe / fast storage
            CacheTier cold;
            cold.type = CacheTierType::COLD;
            cold.capacity = cold_ssd_capacity > 0 ? cold_ssd_capacity : topo.storage_capacity;
            cold.used = 0;
            cold.persistent = true;
            cold.shared = true;
            cold.unified = false;
            cold.backend = "nvme";
            tiers.push_back(cold);
            break;
        }

        case HardwareProfileType::UNIFIED_MEMORY: {
            // HOT tier: Unified Memory (currently active KV cells)
            CacheTier hot;
            hot.type = CacheTierType::HOT;
            hot.capacity = hot_capacity;
            hot.used = 0;
            hot.persistent = false;
            hot.shared = false;
            hot.unified = true;
            hot.backend = "uma_hot";
            tiers.push_back(hot);

            // WARM tier: Unified Memory Logical Priority Class (ZERO physical copy from HOT)
            CacheTier warm;
            warm.type = CacheTierType::WARM;
            warm.capacity = warm_ram_capacity;
            warm.used = 0;
            warm.persistent = false;
            warm.shared = false;
            warm.unified = true; // Shares physical DRAM with HOT!
            warm.backend = "uma_warm";
            tiers.push_back(warm);

            // COLD tier: NVMe / fast storage
            CacheTier cold;
            cold.type = CacheTierType::COLD;
            cold.capacity = cold_ssd_capacity > 0 ? cold_ssd_capacity : topo.storage_capacity;
            cold.used = 0;
            cold.persistent = true;
            cold.shared = true;
            cold.unified = false;
            cold.backend = "nvme";
            tiers.push_back(cold);
            break;
        }

        case HardwareProfileType::ACCELERATOR: {
            // HOT tier: Accelerator-mapped Unified Memory
            CacheTier hot;
            hot.type = CacheTierType::HOT;
            hot.capacity = hot_capacity;
            hot.used = 0;
            hot.persistent = false;
            hot.shared = false;
            hot.unified = true;
            hot.backend = "uma_accelerator";
            tiers.push_back(hot);

            // WARM tier: Host Unified Memory (zero-copy priority shift)
            CacheTier warm;
            warm.type = CacheTierType::WARM;
            warm.capacity = warm_ram_capacity;
            warm.used = 0;
            warm.persistent = false;
            warm.shared = false;
            warm.unified = true;
            warm.backend = "uma_warm";
            tiers.push_back(warm);

            // COLD tier: NVMe
            CacheTier cold;
            cold.type = CacheTierType::COLD;
            cold.capacity = cold_ssd_capacity > 0 ? cold_ssd_capacity : topo.storage_capacity;
            cold.used = 0;
            cold.persistent = true;
            cold.shared = true;
            cold.unified = false;
            cold.backend = "nvme";
            tiers.push_back(cold);
            break;
        }

        case HardwareProfileType::CPU_ONLY: {
            // HOT tier: CPU Host RAM (GGML KV cells)
            CacheTier hot;
            hot.type = CacheTierType::HOT;
            hot.capacity = hot_capacity;
            hot.used = 0;
            hot.persistent = false;
            hot.shared = false;
            hot.unified = true;
            hot.backend = "system_ram";
            tiers.push_back(hot);

            // WARM tier: Logical WARM within system RAM
            CacheTier warm;
            warm.type = CacheTierType::WARM;
            warm.capacity = warm_ram_capacity;
            warm.used = 0;
            warm.persistent = false;
            warm.shared = false;
            warm.unified = true;
            warm.backend = "system_ram_warm";
            tiers.push_back(warm);

            // COLD tier: NVMe
            CacheTier cold;
            cold.type = CacheTierType::COLD;
            cold.capacity = cold_ssd_capacity > 0 ? cold_ssd_capacity : topo.storage_capacity;
            cold.used = 0;
            cold.persistent = true;
            cold.shared = true;
            cold.unified = false;
            cold.backend = "nvme";
            tiers.push_back(cold);
            break;
        }
    }

    if (ptype == HardwareProfileType::UNIFIED_MEMORY ||
        ptype == HardwareProfileType::ACCELERATOR ||
        ptype == HardwareProfileType::CPU_ONLY ||
        topo.unified_memory) {
        size_t budget = compute_uma_budget(topo);
        if (budget > 0) {
            enforce_uma_budget(tiers, budget);
        }
    }

    return tiers;
}

bool HardwareProfile::requires_physical_copy_for_warm(const MemoryTopology & topo) {
    // If memory is unified, HOT and WARM share the exact same physical DRAM.
    // Therefore, no physical memory-to-memory copying is required.
    return !topo.unified_memory;
}

size_t HardwareProfile::compute_uma_budget(const MemoryTopology & topo, float budget_ratio) {
    if (topo.uma_kv_budget > 0) {
        return topo.uma_kv_budget;
    }
    if (topo.system_memory > 0) {
        return static_cast<size_t>(static_cast<double>(topo.system_memory) * static_cast<double>(budget_ratio));
    }
    return 0;
}

void HardwareProfile::enforce_uma_budget(std::vector<CacheTier> & tiers, size_t uma_budget) {
    if (uma_budget == 0) {
        return;
    }
    size_t total_unified = 0;
    for (const auto & tier : tiers) {
        if (tier.unified) {
            total_unified += tier.capacity;
        }
    }
    if (total_unified > uma_budget && total_unified > 0) {
        double scale = static_cast<double>(uma_budget) / static_cast<double>(total_unified);
        for (auto & tier : tiers) {
            if (tier.unified) {
                tier.capacity = static_cast<size_t>(static_cast<double>(tier.capacity) * scale);
            }
        }
    }
}
