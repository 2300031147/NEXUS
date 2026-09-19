#include "backend_manager.h"

BackendManager& BackendManager::get_instance() {
    static BackendManager instance;
    return instance;
}

void BackendManager::set_topology(const ComputeTopology& topo) {
    current_topo = topo;
}

const ComputeTopology& BackendManager::get_topology() const {
    return current_topo;
}

BackendPlacement BackendManager::plan_placement(const ModelCapabilities& caps) {
    BackendPlacement placement;

    // Default to CPU
    placement.use_cpu = caps.cpu_supported;

    // Check Hexagon first (highest efficiency)
    if (current_topo.has_npu && current_topo.npu_backend == "hexagon" && caps.hexagon_supported) {
        placement.use_hexagon = true;
        // If Hexagon can only do partial, we also need Adreno or CPU
        if (caps.hexagon_partial) {
            if (current_topo.has_gpu && current_topo.gpu_backend == "adreno" && caps.adreno_supported) {
                placement.use_adreno = true;
            }
        }
    } 
    // Fallback to Adreno if Hexagon isn't used or isn't fully capable
    else if (current_topo.has_gpu && current_topo.gpu_backend == "adreno" && caps.adreno_supported) {
        placement.use_adreno = true;
    }

    current_placement = placement;
    return placement;
}

void BackendManager::apply_placement(const BackendPlacement& placement) {
    // In a real integration, this function configures environment variables,
    // toggles GGML registry flags, or builds a specific list of ggml_backend_dev_t
    // to pass into llama_prepare_model_devices.
    current_placement = placement;
}
