#include <chrono>
#include <iostream>
#include <vector>
#include <cstring>
#include <random>

volatile uint8_t global_sink = 0;

void run_benchmark() {
    constexpr size_t num_chunks = 1000;
    constexpr size_t chunk_size = 2 * 1024 * 1024; // 2 MB per chunk
    
    std::cout << "=== NEXUS UMA Zero-Copy Latency Benchmark ===" << std::endl;
    std::cout << "Simulating tier transition (HOT <-> WARM) for " << num_chunks 
              << " chunks of size " << (chunk_size / 1024 / 1024) << " MB." << std::endl;

    // Allocate physical memory for DMA benchmark
    std::vector<uint8_t> hot_vram(chunk_size * num_chunks);
    std::vector<uint8_t> warm_ram(chunk_size * num_chunks);
    
    // Fill with dummy data to avoid page faults during benchmark
    std::memset(hot_vram.data(), 1, hot_vram.size());
    std::memset(warm_ram.data(), 2, warm_ram.size());

    // 1. DMA (memcpy) benchmark
    auto start_dma = std::chrono::high_resolution_clock::now();
    for (size_t i = 0; i < num_chunks; ++i) {
        std::memcpy(warm_ram.data() + i * chunk_size, hot_vram.data() + i * chunk_size, chunk_size);
    }
    auto end_dma = std::chrono::high_resolution_clock::now();
    global_sink = warm_ram[num_chunks * chunk_size / 2]; // Prevent optimization
    
    std::chrono::duration<double, std::milli> dma_time = end_dma - start_dma;

    // 2. UMA Zero-Copy (metadata flip) benchmark
    struct ChunkMeta {
        int cell_start;
        bool warm;
    };
    std::vector<ChunkMeta> logical_chunks(num_chunks, {-1, false});
    
    auto start_uma = std::chrono::high_resolution_clock::now();
    for (size_t i = 0; i < num_chunks; ++i) {
        // Simulating the logic in touch_or_promote_block / set_warm
        logical_chunks[i].warm = true;
        logical_chunks[i].cell_start = i;
    }
    auto end_uma = std::chrono::high_resolution_clock::now();
    global_sink = logical_chunks[num_chunks / 2].warm ? 1 : 0; // Prevent optimization
    
    std::chrono::duration<double, std::milli> uma_time = end_uma - start_uma;

    std::cout << "\nResults:" << std::endl;
    std::cout << "- Standard DMA copy time:  " << dma_time.count() << " ms" << std::endl;
    std::cout << "- UMA zero-copy time:      " << uma_time.count() << " ms" << std::endl;
    
    double speedup = dma_time.count() / uma_time.count();
    std::cout << "- Speedup factor:          " << speedup << "x" << std::endl;
}

int main() {
    run_benchmark();
    return 0;
}
