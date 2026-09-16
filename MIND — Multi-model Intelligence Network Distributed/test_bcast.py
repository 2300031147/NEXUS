import socket
import sys

port = 52415
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

if sys.argv[1] == "listen":
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, "SO_REUSEPORT"):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    sock.bind(('', port))
    print(f"Listening on {port}...")
    while True:
        data, addr = sock.recvfrom(1024)
        print(f"Received {data} from {addr}")

elif sys.argv[1] == "send":
    try:
        sock.sendto(b"test 127.255.255.255", ("127.255.255.255", port))
        print("Sent to 127.255.255.255")
    except Exception as e:
        print(e)
    try:
        sock.sendto(b"test 255.255.255.255", ("255.255.255.255", port))
        print("Sent to 255.255.255.255")
    except Exception as e:
        print(e)

