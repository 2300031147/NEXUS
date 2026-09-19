#include "capability_matrix.h"

ModelCapabilities CapabilityMatrix::evaluate_model(const std::string& model_type, const std::string& quant_type) {
    ModelCapabilities caps;
    caps.model_type = model_type;
    caps.quantization = quant_type;

    // CPU supports everything
    caps.cpu_supported = true;

    // Adreno supports most models with standard quantization (Q4_0, Q4_1, Q4_K, F16)
    if (quant_type == "Q4_0" || quant_type == "Q4_1" || 
        quant_type == "Q4_K_M" || quant_type == "Q4_K_S" || quant_type == "Q8_0" || quant_type == "F16") {
        caps.adreno_supported = true;
    }

    // Hexagon DSP currently is highly optimized for specific operations and models.
    // Llama and Qwen models with standard Q4_K_M are partially supported (might need CPU fallback for certain unsupported ops like RoPE specific versions).
    if (model_type == "llama" || model_type == "qwen" || model_type == "qwen2") {
        if (quant_type == "Q4_K_M" || quant_type == "Q4_0" || quant_type == "Q8_0") {
            caps.hexagon_supported = true;
            // E.g., we mark it as partial if we know certain ops aren't mapped
            caps.hexagon_partial = true; 
        }
    }

    return caps;
}
