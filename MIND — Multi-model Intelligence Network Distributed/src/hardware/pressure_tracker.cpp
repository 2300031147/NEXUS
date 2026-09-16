#include "pressure_tracker.h"

#include <fstream>
#include <sstream>
#include <string>
#include <algorithm>

#if defined(_WIN32)
    #define WIN32_LEAN_AND_MEAN
    #ifndef NOMINMAX
        #define NOMINMAX
    #endif
    #include <windows.h>
    #include <psapi.h>
#elif defined(__APPLE__)
    #include <unistd.h>
    #include <sys/types.h>
    #include <sys/sysctl.h>
    #include <mach/mach.h>
    #include <sys/resource.h>
#else
    #include <unistd.h>
    #include <sys/resource.h>
#endif

MemoryPressureTracker::MemoryPressureTracker(MemoryPressureConfig config)
    : config(config),
      last_sample_time(std::chrono::steady_clock::time_point::min()) {
}

MemoryPressureStats MemoryPressureTracker::sample() {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_sample_time).count();

    if (elapsed >= (long long)config.sample_interval_ms || last_stats.total_bytes == 0) {
        last_stats = query_os_memory();
        last_sample_time = now;
    }
    return last_stats;
}

MemoryPressureAction MemoryPressureTracker::evaluate(const MemoryPressureStats & stats) const {
    if (stats.pressure_ratio >= config.threshold_critical_spill) {
        return MemoryPressureAction::CRITICAL_SPILL;
    }
    if (stats.pressure_ratio >= config.threshold_aggressive_evict) {
        return MemoryPressureAction::AGGRESSIVE_EVICT;
    }
    if (stats.pressure_ratio >= config.threshold_demote_warm) {
        return MemoryPressureAction::DEMOTE_TO_WARM;
    }
    return MemoryPressureAction::KEEP_HOT;
}

MemoryPressureStats MemoryPressureTracker::query_os_memory() {
    MemoryPressureStats stats;

#if defined(__linux__)
    std::ifstream meminfo("/proc/meminfo");
    if (meminfo.is_open()) {
        std::string line;
        size_t mem_total_kb = 0;
        size_t mem_avail_kb = 0;
        size_t mem_free_kb = 0;
        size_t buffers_kb = 0;
        size_t cached_kb = 0;

        while (std::getline(meminfo, line)) {
            if (line.compare(0, 9, "MemTotal:") == 0) {
                std::istringstream iss(line.substr(9));
                iss >> mem_total_kb;
            } else if (line.compare(0, 13, "MemAvailable:") == 0) {
                std::istringstream iss(line.substr(13));
                iss >> mem_avail_kb;
            } else if (line.compare(0, 8, "MemFree:") == 0) {
                std::istringstream iss(line.substr(8));
                iss >> mem_free_kb;
            } else if (line.compare(0, 8, "Buffers:") == 0) {
                std::istringstream iss(line.substr(8));
                iss >> buffers_kb;
            } else if (line.compare(0, 7, "Cached:") == 0) {
                std::istringstream iss(line.substr(7));
                iss >> cached_kb;
            }
        }

        stats.total_bytes = mem_total_kb * 1024;
        if (mem_avail_kb > 0) {
            stats.available_bytes = mem_avail_kb * 1024;
        } else {
            stats.available_bytes = (mem_free_kb + buffers_kb + cached_kb) * 1024;
        }
        if (stats.total_bytes > stats.available_bytes) {
            stats.used_bytes = stats.total_bytes - stats.available_bytes;
        }
    }

    // Query process RSS from /proc/self/statm
    std::ifstream statm("/proc/self/statm");
    if (statm.is_open()) {
        size_t size_pages = 0, resident_pages = 0;
        if (statm >> size_pages >> resident_pages) {
            long page_size = sysconf(_SC_PAGESIZE);
            if (page_size > 0) {
                stats.process_rss_bytes = resident_pages * (size_t)page_size;
            }
        }
    }

#elif defined(__APPLE__)
    int mib[2] = { CTL_HW, HW_MEMSIZE };
    uint64_t total_ram = 0;
    size_t length = sizeof(total_ram);
    if (sysctl(mib, 2, &total_ram, &length, NULL, 0) == 0) {
        stats.total_bytes = (size_t)total_ram;
    }

    vm_size_t page_size = 0;
    mach_port_t mach_port = mach_host_self();
    vm_statistics64_data_t vm_stat;
    mach_msg_type_number_t count = sizeof(vm_stat) / sizeof(natural_t);
    if (host_page_size(mach_port, &page_size) == KERN_SUCCESS &&
        host_statistics64(mach_port, HOST_VM_INFO64, (host_info64_t)&vm_stat, &count) == KERN_SUCCESS) {
        size_t free_bytes = (size_t)vm_stat.free_count * page_size;
        size_t inactive_bytes = (size_t)vm_stat.inactive_count * page_size;
        stats.available_bytes = free_bytes + inactive_bytes;
        if (stats.total_bytes > stats.available_bytes) {
            stats.used_bytes = stats.total_bytes - stats.available_bytes;
        }
    }

    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        stats.process_rss_bytes = (size_t)usage.ru_maxrss; // in bytes on macOS
    }

#elif defined(_WIN32)
    MEMORYSTATUSEX mem_status;
    mem_status.dwLength = sizeof(mem_status);
    if (GlobalMemoryStatusEx(&mem_status)) {
        stats.total_bytes = mem_status.ullTotalPhys;
        stats.available_bytes = mem_status.ullAvailPhys;
        stats.used_bytes = stats.total_bytes - stats.available_bytes;
    }

    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        stats.process_rss_bytes = pmc.WorkingSetSize;
    }
#endif

    if (stats.used_bytes > stats.process_rss_bytes) {
        stats.other_process_bytes = stats.used_bytes - stats.process_rss_bytes;
    } else {
        stats.other_process_bytes = 0;
    }

    if (stats.total_bytes > 0) {
        stats.pressure_ratio = (float)stats.used_bytes / (float)stats.total_bytes;
    } else {
        stats.pressure_ratio = 0.0f;
    }

    return stats;
}
