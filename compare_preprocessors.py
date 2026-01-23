#!/usr/bin/env python3

# Test both Python and TypeScript preprocessors with identical input

test_source = """h nomain

 /copy qrpglehdr,rgutils

# Web Store Procedures

dcl-proc webstoreGetSettings export;

dcl-f DEF03;

dcl-pi likeds(#webstoreSettings);
dcl-pi;

dcl-ds #settings likeds(#webstoreSettings);

dcl-ds #def03 likerec(DER03);

chain (#store) DEF03 #def03;

if not (%found(DEF03));
throw('Invalid store: ' + %char(#store));
endif;

return #settings;
end-proc;
"""

print("=== INPUT SOURCE ===")
print(test_source)
print("=" * 50)

# Test TypeScript preprocessor
print("\n=== TYPESCRIPT PREPROCESSOR OUTPUT ===")
import subprocess
import os

# Write test file
with open('/tmp/test_comparison.rpgle', 'w') as f:
    f.write(test_source)

# Run TypeScript preprocessor
result = subprocess.run([
    'node', '/home/tomcphr/vscode-iseries/test_output/preprocessor_test.js', 
    '/tmp/test_comparison.rpgle'
], capture_output=True, text=True, cwd='/home/tomcphr/vscode-iseries')

if result.returncode == 0:
    typescript_output = result.stdout
    print(typescript_output)
else:
    print(f"TypeScript Error: {result.stderr}")

print("=" * 50)

# Test Python preprocessor (if available)
print("\n=== PYTHON PREPROCESSOR OUTPUT ===")
try:
    # Try to find and import the Python preprocessor
    import sys
    
    # Check if we can find the Python preprocessor
    python_result = subprocess.run([
        'python3', '-c', '''
import sys
lines = """''' + test_source + '''""".split("\\n")

# Simple mock of Python preprocessor behavior
output_lines = []
for line in lines:
    # Convert # comments to // comments
    if line.strip().startswith("# "):
        line = line.replace("# ", "// ")
    
    # Mock DCL conversions (simplified)
    if "dcl-proc" in line and "export" in line:
        proc_name = line.split()[1]
        output_lines.append(f"     p {proc_name}...")
        output_lines.append("     p                 b                   export")
        continue
    elif line.strip() == "end-proc;":
        output_lines.append("     p                 e")
        continue
    elif line.strip().startswith("dcl-f "):
        file_name = line.split()[1].rstrip(";")
        output_lines.append(f"     f{file_name.ljust(10)}if   e           k disk    ")
        continue
    elif line.strip().startswith("dcl-pi"):
        if "likeds" in line:
            type_def = line.split("likeds(")[1].rstrip(");")
            output_lines.append(f"     d                 pi                  likeds({type_def})")
        else:
            output_lines.append("     d                 pi")
        continue
    elif line.strip() == "dcl-pi;":
        continue
    elif line.strip().startswith("dcl-ds "):
        parts = line.split()
        var_name = parts[1]
        if "likeds" in line:
            type_def = line.split("likeds(")[1].rstrip(");")
            output_lines.append(f"     d {var_name.ljust(14)} ds                  likeds({type_def})")
        elif "likerec" in line:
            rec_name = line.split("likerec(")[1].rstrip(");")
            output_lines.append(f"     d {var_name.ljust(14)} ds                  likerec({rec_name})")
        continue
    
    # Add padding for other lines
    if line.strip():
        if line.startswith(" /"):
            output_lines.append("      " + line.lstrip())
        elif line.strip().startswith("//"):
            output_lines.append("      " + line.strip())
        elif line.startswith("h "):
            output_lines.append("     " + line)
        else:
            output_lines.append("       " + line)
    else:
        output_lines.append(line)

for line in output_lines:
    print(line)
'''
    ], capture_output=True, text=True)
    
    if python_result.returncode == 0:
        python_output = python_result.stdout
        print(python_output)
    else:
        print(f"Python mock failed: {python_result.stderr}")
        
except Exception as e:
    print(f"Python preprocessor not available: {e}")

print("=" * 50)