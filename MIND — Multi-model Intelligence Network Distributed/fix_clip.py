import sys
with open('tools/mtmd/clip.cpp', 'r') as f:
    lines = f.readlines()
for i in range(909, 1024):
    lines[i] = '// ' + lines[i]
with open('tools/mtmd/clip.cpp', 'w') as f:
    f.writelines(lines)
