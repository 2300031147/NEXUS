#pragma once
#include <string>
#include <vector>

struct ModelCapabilities {
    bool cpu_supported = true;
    bool adreno_supported = false;
    bool hexagon_supported = false;
    bool hexagon_partial = false; // Indicates if Hexagon supports some layers but needs CPU fallback

    std::string model_type; // e.g., "llama", "qwen"
    std::string quantization; // e.g., "Q4_K_M", "F16"
};

class CapabilityMatrix {
public:
    static ModelCapabilities evaluate_model(const std::string& model_type, const std::string& quant_type);
};
