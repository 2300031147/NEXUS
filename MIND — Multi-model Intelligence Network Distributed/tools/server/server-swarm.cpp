#include "server-swarm.h"
#include <nlohmann/json.hpp>

#include <sys/socket.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>

#include <iostream>
#include <chrono>

using json = nlohmann::json;

SwarmNode::SwarmNode(const std::string& role, const std::string& model_name, int http_port)
    : role(role), model(model_name), port(http_port), running(false) {
    
    // Generate simple ID
    node_id = "node_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
}

SwarmNode::~SwarmNode() {
    stop();
}

void SwarmNode::start() {
    if (running) return;
    running = true;
    listen_thread = std::thread(&SwarmNode::listen_loop, this);
    broadcast_thread = std::thread(&SwarmNode::broadcast_loop, this);
}

void SwarmNode::stop() {
    running = false;
    if (listen_thread.joinable()) listen_thread.join();
    if (broadcast_thread.joinable()) broadcast_thread.join();
}

std::vector<SwarmPeer> SwarmNode::get_active_peers() {
    prune_peers();
    std::lock_guard<std::mutex> lock(peers_mutex);
    std::vector<SwarmPeer> active;
    for (const auto& pair : peers) {
        active.push_back(pair.second);
    }
    return active;
}

std::string SwarmNode::get_node_id() const {
    return node_id;
}

void SwarmNode::prune_peers() {
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::system_clock::now().time_since_epoch())
                   .count();
    std::lock_guard<std::mutex> lock(peers_mutex);
    for (auto it = peers.begin(); it != peers.end();) {
        if (now - it->second.last_seen > 15000) {
            it = peers.erase(it);
        } else {
            ++it;
        }
    }
}

void SwarmNode::listen_loop() {
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return;

    int reuse = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (char*)&reuse, sizeof(reuse));

    struct sockaddr_in local_addr;
    memset(&local_addr, 0, sizeof(local_addr));
    local_addr.sin_family = AF_INET;
    local_addr.sin_port = htons(52415);
    local_addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(sock, (struct sockaddr*)&local_addr, sizeof(local_addr)) < 0) {
        close(sock);
        return;
    }

    struct ip_mreq group;
    group.imr_multiaddr.s_addr = inet_addr("224.0.0.111");
    group.imr_interface.s_addr = INADDR_ANY;
    setsockopt(sock, IPPROTO_IP, IP_ADD_MEMBERSHIP, (char*)&group, sizeof(group));

    // Non-blocking for graceful shutdown
    fcntl(sock, F_SETFL, O_NONBLOCK);

    char buffer[2048];
    while (running) {
        struct sockaddr_in sender_addr;
        socklen_t sender_len = sizeof(sender_addr);
        int n = recvfrom(sock, buffer, sizeof(buffer) - 1, 0, (struct sockaddr*)&sender_addr, &sender_len);
        
        if (n > 0) {
            buffer[n] = '\0';
            try {
                json payload = json::parse(buffer);
                if (payload.contains("magic") && payload["magic"] == "SWARM") {
                    std::string peer_id = payload["node_id"];
                    if (peer_id != this->node_id) {
                        SwarmPeer peer;
                        peer.node_id = peer_id;
                        peer.ip = inet_ntoa(sender_addr.sin_addr);
                        peer.port = payload["port"];
                        peer.role = payload["role"];
                        peer.model = payload["model"];
                        peer.last_seen = std::chrono::duration_cast<std::chrono::milliseconds>(
                                             std::chrono::system_clock::now().time_since_epoch())
                                             .count();

                        std::lock_guard<std::mutex> lock(peers_mutex);
                        peers[peer_id] = peer;
                    }
                }
            } catch (...) {
                // Ignore parse errors
            }
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    close(sock);
}

void SwarmNode::broadcast_loop() {
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) return;

    int ttl = 2;
    setsockopt(sock, IPPROTO_IP, IP_MULTICAST_TTL, (void*)&ttl, sizeof(ttl));

    struct sockaddr_in mcast_addr;
    memset(&mcast_addr, 0, sizeof(mcast_addr));
    mcast_addr.sin_family = AF_INET;
    mcast_addr.sin_addr.s_addr = inet_addr("224.0.0.111");
    mcast_addr.sin_port = htons(52415);

    while (running) {
        json payload = {
            {"magic", "SWARM"},
            {"node_id", this->node_id},
            {"role", this->role},
            {"port", this->port},
            {"model", this->model}
        };

        std::string msg = payload.dump();
        sendto(sock, msg.c_str(), msg.length(), 0, (struct sockaddr*)&mcast_addr, sizeof(mcast_addr));

        for (int i = 0; i < 30 && running; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }

    close(sock);
}
