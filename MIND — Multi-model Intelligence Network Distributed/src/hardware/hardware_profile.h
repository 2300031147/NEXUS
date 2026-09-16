#pragma once

#include "memory_topology.h"
#include <string>
#include <vector>

enum class HardwareProfileType {
    DISCRETE_GPU,   // NVIDIA / AMD discrete GPU with dedicated VRAM + Host RAM + NVMe
    UNIFIED_MEMORY, // Apple Silicon, ARM64 UMA, AMD APU, Intel iGPU (shared physical DRAM)
    ACCELERATOR,    // Snapdragon X Elite / Qualcomm NPU / Hexagon DSP with unified memory
    CPU_ONLY        // Standard CPU host memory + NVMe
};

class HardwareProfile {
public:
    static HardwareProfileType determine_profile(const MemoryTopology & topo);
    static std::string profile_to_string(HardwareProfileType type);

    // Build the concrete logical cache tiers according to the hardware profile
    static std::vector<CacheTier> build_cache_tiers(
            const MemoryTopology & topo,
            size_t hot_capacity,
            size_t warm_ram_capacity,
            size_t cold_ssd_capacity);

    // Determines if moving from HOT to WARM requires a physical copy or is zero-copy
    static bool requires_physical_copy_for_warm(const MemoryTopology & topo);
};
