#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Logical cache tier classification
enum class CacheTierType : uint8_t {
    HOT  = 0,
    WARM = 1,
    COLD = 2,
};

// Representation of a logical cache tier
struct CacheTier {
    CacheTierType type = CacheTierType::HOT;
    size_t capacity    = 0;     // capacity in bytes
    size_t used        = 0;     // currently allocated bytes
    bool persistent    = false; // true if backed by persistent storage (NVMe/SSD)
    bool shared        = false; // true if shared across sequences/sessions
    bool unified       = false; // true if this tier shares physical backing with another tier (e.g. UMA)
    std::string backend;        // "cuda_vram", "uma_hot", "uma_warm", "system_ram", "nvme"
};

// Complete hardware and memory topology of the host system
struct MemoryTopology {
    bool unified_memory = false;          // true for Apple Silicon, Snapdragon X Elite, APUs, iGPUs
    size_t accelerator_memory = 0;        // dedicated accelerator memory (VRAM) in bytes (0 if pure UMA)
    size_t system_memory = 0;             // host system RAM in bytes
    size_t storage_capacity = 0;          // detected NVMe / fast storage capacity in bytes
    size_t storage_free = 0;              // available free storage in bytes
    std::string accelerator = "cpu";      // "cuda", "metal", "qualcomm", "vulkan", "rocm", "cpu"
    std::string architecture = "unknown"; // "x86_64", "aarch64", "arm64"
    std::string profile_name = "cpu_only";// "discrete_gpu", "unified_memory", "cpu_only", "accelerator"
    std::string device_model = "Generic"; // specific detected hardware model or SoC name
    size_t host_page_size = 4096;
    bool can_direct_io = true;
};
