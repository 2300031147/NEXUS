#pragma once
#include <string>

struct ComputeTopology {
    bool has_cpu = true;
    bool has_gpu = false;
    bool has_npu = false;

    std::string cpu_backend = "cpu";       // "cpu"
    std::string gpu_backend;               // "cuda", "metal", "vulkan", "adreno", ""
    std::string npu_backend;               // "hexagon", "coreml", "ane", ""

    std::string cpu_arch;                  // "x86_64", "aarch64"
    std::string gpu_model;                 // "RTX 4090", "Adreno 680", ""
    std::string npu_model;                 // "Hexagon DSP", ""
};
