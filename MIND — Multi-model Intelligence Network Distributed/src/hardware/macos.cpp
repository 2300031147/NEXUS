#include "detector.h"
#include "hardware_profile.h"

#include <unistd.h>
#include <string>

#if defined(__APPLE__)
#include <sys/types.h>
#include <sys/sysctl.h>
#include <sys/statvfs.h>
#endif

MemoryTopology detect_macos_topology() {
    MemoryTopology topo;

#if defined(__aarch64__) || defined(__arm64__)
    topo.architecture = "arm64";
#elif defined(__x86_64__)
    topo.architecture = "x86_64";
#else
    topo.architecture = "unknown";
#endif

    long page_size = sysconf(_SC_PAGESIZE);
    if (page_size > 0) {
        topo.host_page_size = (size_t)page_size;
    }

#if defined(__APPLE__)
    // 1. Check RAM via sysctl hw.memsize
    int mib_ram[2] = { CTL_HW, HW_MEMSIZE };
    uint64_t total_ram = 0;
    size_t len = sizeof(total_ram);
    if (sysctl(mib_ram, 2, &total_ram, &len, NULL, 0) == 0) {
        topo.system_memory = (size_t)total_ram;
    }

    // 2. Check CPU brand string
    char brand[256] = {0};
    size_t brand_len = sizeof(brand);
    if (sysctlbyname("machdep.cpu.brand_string", brand, &brand_len, NULL, 0) == 0) {
        topo.device_model = brand;
    }

    // 3. Apple Silicon has unified memory
    int arm64_supported = 0;
    size_t arm_len = sizeof(arm64_supported);
    bool is_arm = (sysctlbyname("hw.optional.arm64", &arm64_supported, &arm_len, NULL, 0) == 0 && arm64_supported == 1);
#if defined(__aarch64__) || defined(__arm64__)
    is_arm = true;
#endif

    if (is_arm) {
        topo.unified_memory = true;
        topo.accelerator = "metal";
        if (topo.device_model.empty() || topo.device_model == "Generic") {
            topo.device_model = "Apple Silicon";
        }
    } else {
        // Intel Mac
        topo.unified_memory = false;
        topo.accelerator = "cpu"; 
    }

    // 4. Fast storage (APFS / NVMe)
    struct statvfs sv;
    if (statvfs("/", &sv) == 0) {
        topo.storage_capacity = (size_t)sv.f_blocks * sv.f_frsize;
        topo.storage_free = (size_t)sv.f_bavail * sv.f_frsize;
    }
#endif

    topo.profile_name = HardwareProfile::profile_to_string(HardwareProfile::determine_profile(topo));
    return topo;
}
