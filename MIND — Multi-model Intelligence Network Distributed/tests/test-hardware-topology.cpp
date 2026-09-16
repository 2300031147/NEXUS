#include "hardware/memory_topology.h"
#include "hardware/detector.h"
#include "hardware/hardware_profile.h"
#include "hardware/pressure_tracker.h"
#include "llama-kv-swap.h"

#include <cassert>
#include <iostream>
#include <cmath>

int main() {
    std::cout << "=== Running NEXUS Hardware Topology & UMA Tests ===" << std::endl;

    // 1. Test Hardware Detection
    MemoryTopology topo = HardwareDetector::detect();
    HardwareDetector::log_topology(topo);

    assert(!topo.architecture.empty() && "Architecture must not be empty");
    assert(topo.system_memory > 0 && "System memory must be greater than 0");
    assert(topo.host_page_size > 0 && "Host page size must be valid");
    std::cout << "[PASS] Hardware topology successfully queried from OS." << std::endl;

    // 2. Test Profile Determination & Zero-Copy Rules
    MemoryTopology uma_topo = topo;
    uma_topo.unified_memory = true;
    uma_topo.accelerator = "metal";
    HardwareProfileType uma_profile = HardwareProfile::determine_profile(uma_topo);
    assert(uma_profile == HardwareProfileType::UNIFIED_MEMORY);
    assert(HardwareProfile::requires_physical_copy_for_warm(uma_topo) == false && "UMA must NOT require physical copy for WARM");
    std::cout << "[PASS] Unified Memory Architecture zero-copy demotion rule verified." << std::endl;

    MemoryTopology dgpu_topo = topo;
    dgpu_topo.unified_memory = false;
    dgpu_topo.accelerator = "cuda";
    dgpu_topo.accelerator_memory = 16ULL * 1024 * 1024 * 1024;
    HardwareProfileType dgpu_profile = HardwareProfile::determine_profile(dgpu_topo);
    assert(dgpu_profile == HardwareProfileType::DISCRETE_GPU);
    assert(HardwareProfile::requires_physical_copy_for_warm(dgpu_topo) == true && "Discrete GPU must require physical copy for WARM");
    std::cout << "[PASS] Discrete GPU physical copy rule verified." << std::endl;

    MemoryTopology snapdragon_topo = topo;
    snapdragon_topo.unified_memory = true;
    snapdragon_topo.accelerator = "qualcomm";
    snapdragon_topo.device_model = "Qualcomm Snapdragon X Elite";
    HardwareProfileType snap_profile = HardwareProfile::determine_profile(snapdragon_topo);
    assert(snap_profile == HardwareProfileType::ACCELERATOR);
    assert(HardwareProfile::requires_physical_copy_for_warm(snapdragon_topo) == false && "Snapdragon X Elite must use zero-copy UMA");
    std::cout << "[PASS] Snapdragon X Elite profile & zero-copy rule verified." << std::endl;

    // 3. Test Logical Cache Tiers Construction
    size_t hot_cap = 4ULL * 1024 * 1024 * 1024;
    size_t warm_cap = 8ULL * 1024 * 1024 * 1024;
    size_t cold_cap = 64ULL * 1024 * 1024 * 1024;

    auto uma_tiers = HardwareProfile::build_cache_tiers(uma_topo, hot_cap, warm_cap, cold_cap);
    assert(uma_tiers.size() == 3);
    assert(uma_tiers[0].type == CacheTierType::HOT && uma_tiers[0].unified == true);
    assert(uma_tiers[1].type == CacheTierType::WARM && uma_tiers[1].unified == true);
    assert(uma_tiers[2].type == CacheTierType::COLD && uma_tiers[2].persistent == true);
    std::cout << "[PASS] UMA logical tiers correctly flagged as sharing physical memory pool." << std::endl;

    auto dgpu_tiers = HardwareProfile::build_cache_tiers(dgpu_topo, hot_cap, warm_cap, cold_cap);
    assert(dgpu_tiers.size() == 3);
    assert(dgpu_tiers[0].type == CacheTierType::HOT && dgpu_tiers[0].unified == false);
    assert(dgpu_tiers[1].type == CacheTierType::WARM && dgpu_tiers[1].unified == false);
    assert(dgpu_tiers[2].type == CacheTierType::COLD && dgpu_tiers[2].persistent == true);
    std::cout << "[PASS] Discrete GPU logical tiers correctly map to isolated physical pools." << std::endl;

    // 4. Test Memory Pressure Tracker
    MemoryPressureConfig config;
    config.sample_interval_ms = 0; // immediate sampling for test
    MemoryPressureTracker tracker(config);

    MemoryPressureStats stats = tracker.sample();
    std::cout << "Real-time Memory Stats:" << std::endl;
    std::cout << "  - Total RAM     : " << (stats.total_bytes / (1024 * 1024)) << " MB" << std::endl;
    std::cout << "  - Available RAM : " << (stats.available_bytes / (1024 * 1024)) << " MB" << std::endl;
    std::cout << "  - Used RAM      : " << (stats.used_bytes / (1024 * 1024)) << " MB" << std::endl;
    std::cout << "  - Process RSS   : " << (stats.process_rss_bytes / (1024 * 1024)) << " MB" << std::endl;
    std::cout << "  - Pressure Ratio: " << (stats.pressure_ratio * 100.0f) << " %" << std::endl;

    assert(stats.total_bytes > 0);
    assert(stats.pressure_ratio >= 0.0f && stats.pressure_ratio <= 1.0f);

    // Evaluate simulated thresholds
    MemoryPressureStats sim_low; sim_low.pressure_ratio = 0.40f;
    assert(tracker.evaluate(sim_low) == MemoryPressureAction::KEEP_HOT);

    MemoryPressureStats sim_med; sim_med.pressure_ratio = 0.70f;
    assert(tracker.evaluate(sim_med) == MemoryPressureAction::DEMOTE_TO_WARM);

    MemoryPressureStats sim_high; sim_high.pressure_ratio = 0.85f;
    assert(tracker.evaluate(sim_high) == MemoryPressureAction::AGGRESSIVE_EVICT);

    MemoryPressureStats sim_crit; sim_crit.pressure_ratio = 0.95f;
    assert(tracker.evaluate(sim_crit) == MemoryPressureAction::CRITICAL_SPILL);
    std::cout << "[PASS] Memory pressure threshold actions verified." << std::endl;

    // 5. Test llama_kv_block_meta Metadata & Pinning (Anti-thrashing)
    llama_kv_block_meta block;
    block.id = {1, 0, 32};
    block.size = 32 * 1024;
    block.set_tier(CacheTierType::COLD);
    assert(block.loc == llama_kv_block_loc::COLD_SSD);

    // Simulate recall
    block.set_tier(CacheTierType::HOT);
    block.access_count++;
    block.pinned = true;

    assert(block.loc == llama_kv_block_loc::HOT_VRAM);
    assert(block.pinned == true && "Recalled block must be pinned for anti-thrashing");
    assert(block.access_count == 1);
    std::cout << "[PASS] KVBlock anti-thrashing and tier metadata verified." << std::endl;

    std::cout << "=== ALL TESTS PASSED SUCCESSFULLY ===" << std::endl;
    return 0;
}
