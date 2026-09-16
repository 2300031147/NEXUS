import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(('127.0.0.1', 52415))
print("Listening on 127.0.0.1:52415...")
for i in range(5):
    data, addr = sock.recvfrom(1024)
    print(addr, data)
