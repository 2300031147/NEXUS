#pragma once
#include "compute_topology.h"
#include "capability_matrix.h"
#include <string>
#include <vector>

struct BackendPlacement {
    bool use_cpu = false;
    bool use_adreno = false;
    bool use_hexagon = false;

    // Optional fine-grained tracking
    size_t npu_layers = 0;
    size_t gpu_layers = 0;
    size_t cpu_layers = 0;
};

class BackendManager {
public:
    static BackendManager& get_instance();

    // Set the detected hardware topology
    void set_topology(const ComputeTopology& topo);
    const ComputeTopology& get_topology() const;

    // Calculate how the model should be placed across the available topology
    BackendPlacement plan_placement(const ModelCapabilities& caps);

    // This overrides/configures backend registration based on the planned placement.
    // It should be called before or during llama_backend_init / llama_prepare_model_devices.
    void apply_placement(const BackendPlacement& placement);
    const BackendPlacement& get_current_placement() const { return current_placement; }

private:
    BackendManager() = default;
    ComputeTopology current_topo;
    BackendPlacement current_placement;
};
