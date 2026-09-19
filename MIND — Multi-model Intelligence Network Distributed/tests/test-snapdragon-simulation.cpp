#include "llama.h"
#include "hardware/backend_manager.h"
#include "hardware/detector.h"
#include "hardware/hardware_profile.h"
#include <iostream>

int main() {
    // 1. Simulate a Snapdragon X Elite topology
    ComputeTopology topo;
    topo.has_cpu = true;
    topo.cpu_arch = "aarch64";
    topo.has_gpu = true;
    topo.gpu_backend = "adreno";
    topo.has_npu = true;
    topo.npu_backend = "hexagon";

    BackendManager::get_instance().set_topology(topo);

    std::cout << "=== Snapdragon X Elite Simulation ===" << std::endl;
    std::cout << "Topology detected: CPU=" << topo.cpu_arch << ", GPU=" << topo.gpu_backend << ", NPU=" << topo.npu_backend << std::endl;

    // 2. Evaluate a Q4_K_M Llama model
    std::cout << "\nEvaluating Llama Q4_K_M model..." << std::endl;
    ModelCapabilities llama_caps = CapabilityMatrix::evaluate_model("llama", "Q4_K_M");
    std::cout << "- CPU Supported: " << llama_caps.cpu_supported << std::endl;
    std::cout << "- Adreno Supported: " << llama_caps.adreno_supported << std::endl;
    std::cout << "- Hexagon Supported: " << llama_caps.hexagon_supported << " (Partial: " << llama_caps.hexagon_partial << ")" << std::endl;

    // 3. Plan placement
    BackendPlacement placement = BackendManager::get_instance().plan_placement(llama_caps);
    std::cout << "\nPlacement Plan:" << std::endl;
    std::cout << "- Use CPU: " << placement.use_cpu << std::endl;
    std::cout << "- Use Adreno: " << placement.use_adreno << std::endl;
    std::cout << "- Use Hexagon: " << placement.use_hexagon << std::endl;

    // 4. Evaluate an unsupported F32 model
    std::cout << "\nEvaluating generic F32 model (no Hexagon optimization)..." << std::endl;
    ModelCapabilities generic_caps = CapabilityMatrix::evaluate_model("generic", "F32");
    BackendPlacement generic_placement = BackendManager::get_instance().plan_placement(generic_caps);
    std::cout << "Placement Plan:" << std::endl;
    std::cout << "- Use CPU: " << generic_placement.use_cpu << std::endl;
    std::cout << "- Use Adreno: " << generic_placement.use_adreno << std::endl;
    std::cout << "- Use Hexagon: " << generic_placement.use_hexagon << std::endl;

    return 0;
}
