#include "detector.h"
#include "hardware_profile.h"

#if defined(_WIN32)
    #define WIN32_LEAN_AND_MEAN
    #ifndef NOMINMAX
        #define NOMINMAX
    #endif
    #include <windows.h>
#endif

MemoryTopology detect_windows_topology() {
    MemoryTopology topo;

#if defined(_WIN32)
    SYSTEM_INFO sys_info;
    GetNativeSystemInfo(&sys_info);

    if (sys_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_ARM64) {
        topo.architecture = "arm64";
        // Snapdragon X Elite / Qualcomm Copilot+ PCs running Windows
        topo.unified_memory = true;
        topo.accelerator = "qualcomm";
        topo.device_model = "Windows ARM64 (Snapdragon/Qualcomm assumed)";
    } else if (sys_info.wProcessorArchitecture == PROCESSOR_ARCHITECTURE_AMD64) {
        topo.architecture = "x86_64";
        topo.unified_memory = false;
        topo.accelerator = "cpu";
        topo.device_model = "x86_64 PC";
    } else {
        topo.architecture = "x86";
    }

    topo.host_page_size = sys_info.dwPageSize > 0 ? sys_info.dwPageSize : 4096;

    // Total System RAM
    MEMORYSTATUSEX mem_status;
    mem_status.dwLength = sizeof(mem_status);
    if (GlobalMemoryStatusEx(&mem_status)) {
        topo.system_memory = mem_status.ullTotalPhys;
    }

    // Storage capacity on C:
    ULARGE_INTEGER free_bytes_available, total_number_of_bytes, total_number_of_free_bytes;
    if (GetDiskFreeSpaceExA("C:\\", &free_bytes_available, &total_number_of_bytes, &total_number_of_free_bytes)) {
        topo.storage_capacity = (size_t)total_number_of_bytes.QuadPart;
        topo.storage_free = (size_t)free_bytes_available.QuadPart;
    }
#endif

    topo.profile_name = HardwareProfile::profile_to_string(HardwareProfile::determine_profile(topo));
    return topo;
}
