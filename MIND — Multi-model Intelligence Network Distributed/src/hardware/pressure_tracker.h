#pragma once

#include <cstddef>
#include <cstdint>
#include <chrono>

struct MemoryPressureStats {
    size_t total_bytes = 0;
    size_t available_bytes = 0;
    size_t used_bytes = 0;
    size_t process_rss_bytes = 0;
    size_t other_process_bytes = 0;
    float  pressure_ratio = 0.0f; // 0.0 to 1.0 (e.g. 0.75 = 75%)
};

enum class MemoryPressureAction : uint8_t {
    KEEP_HOT          = 0, // < 60%: plenty of headroom, keep all context hot
    DEMOTE_TO_WARM    = 1, // 60-80%: moderate pressure, move older blocks out of hot set
    AGGRESSIVE_EVICT  = 2, // 80-90%: high pressure, aggressively evict warm blocks to NVMe
    CRITICAL_SPILL    = 3, // > 90%: critical pressure, spill immediately to disk to prevent OOM
};

struct MemoryPressureConfig {
    float threshold_demote_warm      = 0.60f; // 60%
    float threshold_aggressive_evict = 0.80f; // 80%
    float threshold_critical_spill   = 0.90f; // 90%
    uint32_t sample_interval_ms      = 250;   // min interval between OS queries
};

class MemoryPressureTracker {
public:
    explicit MemoryPressureTracker(MemoryPressureConfig config = MemoryPressureConfig());

    // Query OS and return current memory pressure statistics (rate-limited)
    MemoryPressureStats sample();

    // Directly evaluate the pressure action for a given stats snapshot
    MemoryPressureAction evaluate(const MemoryPressureStats & stats) const;

    const MemoryPressureConfig & get_config() const { return config; }
    void set_config(const MemoryPressureConfig & cfg) { config = cfg; }

private:
    MemoryPressureConfig config;
    MemoryPressureStats last_stats;
    std::chrono::steady_clock::time_point last_sample_time;

    static MemoryPressureStats query_os_memory();
};
