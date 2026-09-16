#include "detector.h"
#include <cstdio>

MemoryTopology HardwareDetector::detect() {
#if defined(__APPLE__)
    return detect_macos_topology();
#elif defined(_WIN32)
    return detect_windows_topology();
#elif defined(__linux__)
    return detect_linux_topology();
#else
    MemoryTopology fallback;
    fallback.architecture = "unknown";
    fallback.profile_name = "cpu_only";
    return fallback;
#endif
}

void HardwareDetector::log_topology(const MemoryTopology & topo) {
    fprintf(stderr, "===============================================================\n");
    fprintf(stderr, " NEXUS Topology-Aware Hardware Detection:\n");
    fprintf(stderr, "   - Architecture    : %s\n", topo.architecture.c_str());
    fprintf(stderr, "   - Device Model    : %s\n", topo.device_model.c_str());
    fprintf(stderr, "   - Profile         : %s\n", topo.profile_name.c_str());
    fprintf(stderr, "   - Unified Memory  : %s\n", topo.unified_memory ? "YES (Zero-Copy UMA)" : "NO (Discrete)");
    fprintf(stderr, "   - Accelerator     : %s (VRAM: %.2f GB)\n",
            topo.accelerator.c_str(),
            (double)topo.accelerator_memory / (1024.0 * 1024.0 * 1024.0));
    fprintf(stderr, "   - System Memory   : %.2f GB\n",
            (double)topo.system_memory / (1024.0 * 1024.0 * 1024.0));
    fprintf(stderr, "   - Fast Storage    : %.2f GB total (%.2f GB free)\n",
            (double)topo.storage_capacity / (1024.0 * 1024.0 * 1024.0),
            (double)topo.storage_free / (1024.0 * 1024.0 * 1024.0));
    fprintf(stderr, "===============================================================\n");
}
