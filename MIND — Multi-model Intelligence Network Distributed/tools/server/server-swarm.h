#pragma once

#include <string>
#include <map>
#include <mutex>
#include <thread>
#include <atomic>
#include <vector>

struct SwarmPeer {
    std::string node_id;
    std::string ip;
    int port;
    std::string role;
    std::string model;
    long long last_seen;
};

class SwarmNode {
public:
    SwarmNode(const std::string& role, const std::string& model_name, int http_port);
    ~SwarmNode();

    void start();
    void stop();
    std::vector<SwarmPeer> get_active_peers();
    std::string get_node_id() const;

private:
    void listen_loop();
    void broadcast_loop();
    void prune_peers();

    std::string node_id;
    std::string role;
    std::string model;
    int port;

    std::map<std::string, SwarmPeer> peers;
    std::mutex peers_mutex;

    std::atomic<bool> running;
    std::thread listen_thread;
    std::thread broadcast_thread;
};
