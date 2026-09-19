#pragma once

#include "memory_topology.h"

class HardwareDetector {
public:
    // Detect system hardware, accelerator, and memory topology
    static MemoryTopology detect();

    // Log detected topology summary to stderr/logs
    static void log_topology(const MemoryTopology & topo);
    
    // Override detection for testing Snapdragon/UMA locally
    static void override_simulation(bool enable);
    static bool is_simulation_enabled();

private:
    static bool simulation_enabled;
};

// Platform-specific internal detection functions
MemoryTopology detect_linux_topology();
MemoryTopology detect_macos_topology();
MemoryTopology detect_windows_topology();
