#!/usr/bin/env python3
import sys
from rembg import remove
from PIL import Image

def remove_background(input_path, output_path):
    try:
        input_img = Image.open(input_path)
        output_img = remove(input_img)
        output_img.save(output_path, format='PNG')
        print(f"✓ Background removed: {output_path}")
        return 0
    except Exception as e:
        print(f"✗ Error: {str(e)}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: remove_bg.py <input> <output>")
        sys.exit(1)
    
    exit_code = remove_background(sys.argv[1], sys.argv[2])
    sys.exit(exit_code)
