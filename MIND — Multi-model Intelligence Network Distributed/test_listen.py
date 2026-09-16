import socket, struct, json
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(('', 52415))
mreq = struct.pack("4s4s", socket.inet_aton("224.0.0.111"), socket.inet_aton("0.0.0.0"))
sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
print("Listening...")
for i in range(5):
    data, addr = sock.recvfrom(1024)
    print(addr, data)
