#!/usr/bin/env python3

# Test both Python and TypeScript preprocessors with the exact DCL statements from webstores.rpgle

python_test_code = """h nomain

 /copy qrpglehdr,rgutils

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

if (#def03.exch03 = 1);
else;
endif;

return #settings;
end-proc;

dcl-proc getCustomerStore export;

dcl-f DEF03L01;

dcl-pi packed(5:0);
dcl-pi;

dcl-ds #def03 likerec(DER03);

chain (#cono: #cusn: #dseq) DEF03L01 #def03;
if not (%found(DEF03L01));
return 0;
endif;

return #def03.stor03;
end-proc;
"""

typescript_test_code = """h nomain

 /copy qrpglehdr,rgutils

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

  if (#def03.exch03 = 1);
  else;
  endif;

  return #settings;
  end-proc;

  dcl-proc getCustomerStore export;

  dcl-f DEF03L01;

  dcl-pi packed(5:0);
  dcl-pi;

  dcl-ds #def03 likerec(DER03);

  chain (#cono: #cusn: #dseq) DEF03L01 #def03;
  if not (%found(DEF03L01));
  return 0;
  endif;

  return #def03.stor03;
  end-proc;
"""

print("=== TESTING PYTHON PREPROCESSOR ===")
import sys
import os
sys.path.append('/home/tomcphr/python_preprocessor')
from pre_process_source import PreProcessor

python_processor = PreProcessor()
python_result = python_processor.pre_process_source(python_test_code)

print("Python output:")
print("="*50)
print(python_result)
print("="*50)

print("\n=== TESTING TYPESCRIPT PREPROCESSOR ===")
# Write test file for TypeScript
with open('/tmp/test_typescript.rpgle', 'w') as f:
    f.write(typescript_test_code)

# Run TypeScript preprocessor
import subprocess
result = subprocess.run([
    'node', '/home/tomcphr/vscode-iseries/out/test_preprocessor_node.js', 
    '/tmp/test_typescript.rpgle'
], capture_output=True, text=True)

print("TypeScript output:")
print("="*50)
print(result.stdout)
print("="*50)

if result.stderr:
    print("TypeScript errors:")
    print(result.stderr)